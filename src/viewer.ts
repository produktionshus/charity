// Audience viewer — fullscreen single slide, syncs to server state.
// Slide swaps cross-fade (220ms) to keep the audience visually anchored.

import { SyncClient } from './ws-client';
import { renderSlide, teamLotIds, fitToViewport } from './render';
import { SLIDES, EVENT_META, lotById, auctionDisplayById, wishLoopById, mediaById, displayNumFor, refreshLotsFromServer } from './slides';
import { applyChromeFromMeta } from './event-meta-apply';

// Apply localStorage fallback before first paint, then refresh from server
// later when EVENT_META is populated.
applyChromeFromMeta();
window.addEventListener('storage', (e) => {
  if (e.key === 'controller.theme' || e.key === 'brand.colors') applyChromeFromMeta();
});

const stage = document.getElementById('stage')!;
const slideFrame = document.getElementById('slide-frame')!;

let currentSlideIdx = -1;
let currentEl: HTMLElement | null = null;
let audioUnlocked = false;
let audioBanner: HTMLElement | null = null;
function showAudioBanner() {
  if (audioBanner || audioUnlocked) return;
  audioBanner = document.createElement('div');
  audioBanner.id = 'audio-unlock-banner';
  audioBanner.textContent = 'Klik hvor som helst for at aktivere lyd';
  audioBanner.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);padding:14px 24px;background:rgba(0,0,0,0.78);color:#fff;font:600 14px/1.2 system-ui;border-radius:8px;z-index:99999;letter-spacing:0.05em;box-shadow:0 8px 32px rgba(0,0,0,0.4);';
  document.body.appendChild(audioBanner);
}
function hideAudioBanner() {
  if (audioBanner) { audioBanner.remove(); audioBanner = null; }
}
let lastBidForRibbon: number | null = null;
const lastSoldStatus: Record<string, string> = {};
let firstStateMsg = true;

const fmtKr = (n: number) => n.toLocaleString('da-DK').replace(/,/g, '.');

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  const a = new Audio();
  a.muted = true;
  a.play().catch(() => {});
  hideAudioBanner();
  // Also unmute any media-slide videos that wanted sound but had to start
  // muted to satisfy the browser autoplay policy.
  document.querySelectorAll<HTMLVideoElement>('video[data-wants-unmuted="1"]').forEach(v => {
    try { v.muted = false; } catch {}
  });
}
// Future videos mounted after the initial unlock should also un-mute.
function unmuteWantedVideos(root: ParentNode) {
  if (!audioUnlocked) return;
  root.querySelectorAll<HTMLVideoElement>('video[data-wants-unmuted="1"]').forEach(v => {
    try { v.muted = false; } catch {}
  });
}
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

// ---- Manual audio leader toggle ----
// Each viewer instance defaults to silent. The operator clicks the
// status badge to claim audio-leader; the click broadcasts a claim
// message that other viewers in the same browser honour by stepping
// down. This lets a backstage screen run alongside the main viewer
// without double-playback.
const VIEWER_ID = Math.random().toString(36).slice(2);
let isAudioLeader = false;
let viewerChan: BroadcastChannel | null = null;
try { viewerChan = new BroadcastChannel('kidsaid-viewer'); } catch { /* unsupported */ }
function claimAudioLead() {
  isAudioLeader = true;
  viewerChan?.postMessage({ type: 'viewer-claim', id: VIEWER_ID, ts: Date.now() });
  updateAudioStatusBadge();
  // The click itself counts as a user gesture — unlock audio AND retry
  // any media-slide videos that may have failed to autoplay at mount.
  unlockAudio();
  document.querySelectorAll<HTMLVideoElement>('video').forEach(v => {
    v.play().catch(() => {});
  });
}
function releaseAudioLead() {
  isAudioLeader = false;
  if (currentAudio) { try { currentAudio.pause(); } catch {} currentAudio = null; }
  updateAudioStatusBadge();
}
function updateAudioStatusBadge() {
  let badge = document.getElementById('viewer-audio-status');
  if (!badge) {
    badge = document.createElement('button');
    badge.id = 'viewer-audio-status';
    badge.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99998;padding:5px 10px;font:600 11px/1.2 system-ui;letter-spacing:0.1em;text-transform:uppercase;border-radius:5px;border:0;cursor:pointer;opacity:0.85;box-shadow:0 2px 8px rgba(0,0,0,0.35)';
    badge.addEventListener('click', () => {
      if (isAudioLeader) releaseAudioLead();
      else claimAudioLead();
    });
    document.body.appendChild(badge);
  }
  if (isAudioLeader) {
    // Compact dot once audio is live — operator doesn't need a label.
    badge.textContent = '●';
    badge.title = 'Lyd til — klik for at mute';
    badge.style.background = 'rgba(63,163,77,0.92)';
    badge.style.color = '#fff';
    badge.style.padding = '4px 8px';
    badge.style.fontSize = '13px';
    badge.style.letterSpacing = '0';
  } else {
    badge.textContent = '○ stum · klik for at aktivere lyd';
    badge.title = '';
    badge.style.background = 'rgba(60,60,68,0.92)';
    badge.style.color = '#F4ECD8';
    badge.style.padding = '5px 10px';
    badge.style.fontSize = '11px';
    badge.style.letterSpacing = '0.1em';
  }
}
viewerChan?.addEventListener('message', (e) => {
  const m = e.data;
  if (!m || m.id === VIEWER_ID) return;
  if (m.type === 'viewer-claim') {
    // Another viewer just claimed the lead — step down.
    if (isAudioLeader) releaseAudioLead();
  }
});
setTimeout(updateAudioStatusBadge, 100);

// ---- Sound playback with fade in/out, single-track ----
// Plain HTMLAudioElement.volume — avoids Web Audio MediaElementSource bugs
// that cause double-playback / reverb on Safari + some Chrome versions.
// Trade-off: max volume capped at 1.0 (re-encode mp3 with louder gain if
// the source is too quiet).
let currentAudio: HTMLAudioElement | null = null;
const fadeTimers = new Set<number>();
function clearFades() { fadeTimers.forEach(id => clearInterval(id)); fadeTimers.clear(); }
function stopAudio() {
  clearFades();
  if (currentAudio) { try { currentAudio.pause(); } catch {} currentAudio = null; }
}

function rampVolume(a: HTMLAudioElement, from: number, to: number, durationSec: number, onDone?: () => void) {
  if (durationSec <= 0) { a.volume = Math.max(0, Math.min(1, to)); onDone?.(); return; }
  const start = performance.now();
  const id = window.setInterval(() => {
    if (currentAudio !== a) { clearInterval(id); fadeTimers.delete(id); return; }
    const t = Math.min(1, (performance.now() - start) / (durationSec * 1000));
    a.volume = Math.max(0, Math.min(1, from + (to - from) * t));
    if (t >= 1) { clearInterval(id); fadeTimers.delete(id); onDone?.(); }
  }, 40);
  fadeTimers.add(id);
}

// Render slide 0 immediately so the viewer isn't blank if the ws never
// connects. Once sync state arrives it takes over.
function bootRender() {
  swapSlide(0);
}

const sync = new SyncClient();

let currentSlideId: string | null = null;
// Persistent auction-display iframe — mounted once, kept alive across
// every AD slide so navigating between AD slides only sends a state
// update via postMessage instead of reloading the React app (which
// caused a large dark flash + reset all in-flight transitions).
let adIframe: HTMLIFrameElement | null = null;
let adIframeReady = false;
const adPendingMessages: any[] = [];

// ---- Sponsor ticker (rolling marquee shown on wish-loop + media slides) ----
let tickerEl: HTMLElement | null = null;
function ensureTicker(): HTMLElement {
  if (tickerEl) return tickerEl;
  tickerEl = document.createElement('div');
  tickerEl.id = 'sponsor-ticker';
  tickerEl.innerHTML = '<div class="ticker-track"><div class="ticker-row"></div></div>';
  slideFrame.appendChild(tickerEl);
  return tickerEl;
}
function renderTicker() {
  const t = EVENT_META.sponsorTicker;
  console.log('[ticker]', { meta: t, slideKind: SLIDES[currentSlideIdx]?.kind });
  const slide = SLIDES[currentSlideIdx];
  // Allowed only on wish-loop + media slides — lots, sponsor-index,
  // closing, bordplan, auction-display, cover are all excluded.
  let eligible = false;
  let itemAllows = true;
  if (slide?.kind === 'wish-loop' && slide.itemId) {
    eligible = true;
    const item = (window as any).__wishLookup?.(slide.itemId) ?? null;
    // Use sync lookup via slides module
    const wl = wishLoopById(slide.itemId);
    itemAllows = wl?.showTicker !== false;
  } else if (slide?.kind === 'media' && slide.itemId) {
    eligible = true;
    const md = mediaById(slide.itemId);
    itemAllows = md?.showTicker !== false;
  }
  const enabled = !!(t?.enabled && eligible && itemAllows && (t.prefix || (t.sponsors && t.sponsors.length)));
  if (!enabled) {
    if (tickerEl) tickerEl.style.display = 'none';
    return;
  }
  const el = ensureTicker();
  el.style.display = 'block';
  const row = el.querySelector('.ticker-row') as HTMLElement;
  const prefix = (t.prefix || '').trim();
  const sponsors = t.sponsors || [];
  // Build each sponsor as its own <span> with explicit <span class="ticker-sep">
  // dividers between every entry so margin styling actually spaces them.
  const sponsorTags = sponsors
    .map(s => `<span class="ticker-name">${s}</span>`)
    .join('<span class="ticker-sep">·</span>');
  const segment = `<span class="ticker-prefix">${prefix}</span><span class="ticker-sep">·</span>${sponsorTags}`;
  // Duplicate the segment so the marquee can loop seamlessly. Use a
  // blank spacer (not a "·") between segments so each loop starts cleanly
  // with the prefix instead of a dangling divider.
  row.innerHTML = `${segment}<span class="ticker-gap"></span>${segment}<span class="ticker-gap"></span>`;
  el.style.setProperty('--ticker-speed', `${t.speedSec ?? 60}s`);
}

function ensureAdIframe() {
  if (adIframe) return adIframe;
  const teams = EVENT_META.teams || [];
  const cfg = { teams, state: { screen: 'intro' } };
  const cfgEncoded = encodeURIComponent(JSON.stringify(cfg));
  const ifr = document.createElement('iframe');
  ifr.src = `/auction-display/index.html#cfg=${cfgEncoded}`;
  ifr.style.cssText =
    'position:absolute;inset:0;border:0;width:100%;height:100%;' +
    'background:#3fa34d;z-index:2;display:none;opacity:0;' +
    'transition:opacity 260ms ease;';
  slideFrame.appendChild(ifr);
  adIframe = ifr;
  return ifr;
}

function postToAd(message: any) {
  if (!adIframe) return;
  if (adIframeReady && adIframe.contentWindow) {
    adIframe.contentWindow.postMessage(message, '*');
  } else {
    adPendingMessages.push(message);
  }
}

window.addEventListener('message', (e) => {
  if (e.data?.type === 'auction-display:ready') {
    adIframeReady = true;
    if (adIframe?.contentWindow) {
      for (const msg of adPendingMessages) adIframe.contentWindow.postMessage(msg, '*');
      adPendingMessages.length = 0;
    }
  }
});

function swapSlide(idx: number, force = false) {
  const slide = SLIDES[idx];
  if (!slide) { console.warn('no slide at idx', idx, 'of', SLIDES.length); return; }
  if (!force && currentEl && currentSlideId === slide.id) return;
  currentSlideId = slide.id;

  if (slide.kind === 'auction-display') {
    const ifr = ensureAdIframe();
    ifr.style.display = 'block';
    requestAnimationFrame(() => { ifr.style.opacity = '1'; });
    const item = slide.itemId ? auctionDisplayById(slide.itemId) : undefined;
    if (item) {
      postToAd({
        type: 'auction-display:state',
        state: {
          screen: item.screen,
          activeLot: item.activeLot ?? 0,
          revealCount: item.revealCount ?? 0,
          ranking: item.ranking ?? false,
          namesVisible: item.namesVisible ?? true,
          showBaseLabel: item.showBaseLabel ?? true,
        },
      });
    }
    const previous = currentEl;
    if (previous) previous.classList.add('entering');
    currentEl = null;
    setTimeout(() => previous?.remove(), 260);
    return;
  }

  // Non-AD slide: hide persistent iframe.
  if (adIframe) {
    adIframe.style.opacity = '0';
    setTimeout(() => { if (adIframe) adIframe.style.display = 'none'; }, 260);
  }

  const next = renderSlide(slide);
  slideFrame.insertBefore(next, slideFrame.firstChild);
  fitToViewport(slideFrame, next);
  next.classList.add('is-visible');
  unmuteWantedVideos(next);
  // Some browsers don't honour the inline autoplay attribute when the
  // video is mounted via innerHTML — kick playback off manually.
  next.querySelectorAll<HTMLVideoElement>('video').forEach(v => {
    v.play().catch(() => { /* will resume on first user gesture */ });
  });
  const previous = currentEl;
  if (previous) previous.classList.add('entering');
  currentEl = next;
  setTimeout(() => previous?.remove(), 260);
}

// ---- Ribbon (B-style) ----
function getRibbon(): HTMLElement | null { return slideFrame.querySelector('.stage-ribbon'); }

function mountOrUpdateRibbon(lotNum: string, bid: number) {
  const lot = lotById(lotNum)!;
  let ribbon = getRibbon();
  if (!ribbon) {
    // First mount — build full DOM. The slide-up entrance animation only
    // fires here, never on subsequent bid updates.
    ribbon = document.createElement('div');
    ribbon.className = 'stage-ribbon';
    ribbon.innerHTML = `
      <div class="sr-lot">
        <div class="sr-num"></div>
        <div class="sr-title"></div>
      </div>
      <div></div>
      <div class="sr-bid-wrap">
        <span class="sr-bid-label">Nuværende bud</span>
        <span class="sr-bid"></span>
        <span class="sr-meta">▲ Live</span>
      </div>
    `;
    slideFrame.appendChild(ribbon);
  }
  // Update text content in place — wrapper element stays put, no re-entrance.
  const numEl   = ribbon.querySelector('.sr-num')!;
  const titleEl = ribbon.querySelector('.sr-title')!;
  const bidEl   = ribbon.querySelector('.sr-bid') as HTMLElement;
  const dn = displayNumFor(lot.id);
  if (numEl.textContent !== dn) numEl.textContent = dn;
  if (titleEl.textContent !== lot.title) titleEl.textContent = lot.title;
  bidEl.innerHTML = `${fmtKr(bid)}<span class="kr">kr</span>`;
  if (lastBidForRibbon !== bid) {
    bidEl.classList.remove('bid-bump-anim');
    void bidEl.offsetWidth;
    bidEl.classList.add('bid-bump-anim');
  }
  lastBidForRibbon = bid;
}
function removeRibbon() {
  const ribbon = getRibbon();
  if (!ribbon) return;
  if (ribbon.classList.contains('fading')) return;
  ribbon.classList.add('fading');
  setTimeout(() => ribbon!.remove(), 340);
  lastBidForRibbon = null;
}

// ---- Hammer overlay (D ceremoniel) ----
function hammerBidFontPx(amount: number): number {
  // Scale down for longer numbers so the gold bid stays inside the card.
  const len = fmtKr(amount).length + 3;   // include " kr"
  if (len <= 8)  return 160;
  if (len <= 11) return 120;
  return 96;
}

function buildHammerOverlay(lotNum: string, finalPrice: number): HTMLElement {
  const lot = lotById(lotNum)!;
  const wrap = document.createElement('div');
  wrap.className = 'hammer-overlay-c';
  const particles = Array.from({ length: 22 }).map(() => {
    const angle = Math.random() * Math.PI * 2;
    const dist = 200 + Math.random() * 320;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const left = 30 + Math.random() * 40;
    const top  = 30 + Math.random() * 40;
    const delay = Math.random() * 600;
    return `<span class="particle" style="left:${left}%;top:${top}%;--dx:${dx}px;--dy:${dy}px;animation-delay:${500 + delay}ms"></span>`;
  }).join('');
  wrap.innerHTML = `
    <div class="scrim"></div>
    <div class="rays"></div>
    <div class="flash"></div>
    <div class="card">
      <div class="top"><span class="icon">🔨</span><span>Solgt</span></div>
      <div class="lot-line">${lot.title}<span class="lot-no">Lot ${displayNumFor(lot.id)}</span></div>
      <div class="bid" style="font-size:${hammerBidFontPx(finalPrice)}px">${fmtKr(finalPrice)}<span class="kr">kr</span></div>
      <div class="foot">
        <div class="item"><span>Bud</span><b>${fmtKr(finalPrice)} kr</b></div>
      </div>
    </div>
    ${particles}
  `;
  return wrap;
}
function clearHammerOverlay() {
  const el = slideFrame.querySelector('.hammer-overlay-c') as HTMLElement | null;
  if (!el || el.classList.contains('fading')) return;
  el.classList.add('fading');
  setTimeout(() => el.remove(), 340);
}
function fireHammer(lotNum: string, finalPrice: number) {
  clearHammerOverlay();
  slideFrame.appendChild(buildHammerOverlay(lotNum, finalPrice));
}

// Refresh on boot so the in-bundle lots.json snapshot is replaced with
// whatever's currently on the server's volume.
refreshLotsFromServer().then(() => {
  applyChromeFromMeta();
  if (currentSlideIdx >= 0) swapSlide(currentSlideIdx, true);
  renderTicker();
});

sync.onLotsUpdated(async () => {
  await refreshLotsFromServer();
  applyChromeFromMeta();
  renderTicker();
  // Push fresh team config (colors, names, lot-bindings) into the
  // persistent auction-display iframe — operator edits in generator
  // would otherwise stick to the old config until full page reload.
  if (adIframe) postToAd({ type: 'auction-display:teams', teams: EVENT_META.teams || [] });
  // Force re-render only on lots-updated since the underlying data may have
  // changed. swapSlide's same-id guard still skips work if nothing relevant
  // actually shifted.
  if (currentSlideIdx >= 0) swapSlide(currentSlideIdx, true);
});

sync.on((state) => {
  if (state.slideIdx !== currentSlideIdx) {
    currentSlideIdx = state.slideIdx;
    swapSlide(currentSlideIdx);
    clearHammerOverlay();
    removeRibbon();
    renderTicker();
  }

  // Ribbon mount/update based on current slide's lot + bid.
  const slide = SLIDES[currentSlideIdx];
  const teamBoundLot = slide?.kind === 'lot' && slide.lotId
    && (EVENT_META.teams || []).some(t => teamLotIds(t).includes(slide.lotId!));
  if (slide?.kind === 'lot' && slide.lotId) {
    const ls = state.lots?.[slide.lotId];
    const bids: number[] = ls?.bids || [];
    const last = bids.length ? bids[bids.length - 1] : null;
    if (last != null && ls?.status !== 'sold') {
      mountOrUpdateRibbon(slide.lotId, last);
    } else {
      removeRibbon();
    }
  } else {
    removeRibbon();
  }
  // Mark slide-frame so CSS can dock the bar-overlay onto the ribbon when
  // both are visible (team-bound lot AND first bid has landed).
  const teamLotHasBid = !!(teamBoundLot && slide?.lotId
    && state.lots?.[slide.lotId]?.bids?.length);
  slideFrame.classList.toggle('has-team-overlay', teamLotHasBid);
  // Reveal the bar-overlay only after the first live bid arrives, so the
  // lot's caption strip stays uncovered until the auction actually starts.
  const overlayEl = currentEl?.querySelector('.team-bar-overlay') as HTMLElement | null;
  if (overlayEl) overlayEl.classList.toggle('is-revealed', teamLotHasBid);

  // Hammer overlay on status -> sold transition (current slide's lot)
  if (slide?.kind === 'lot' && slide.lotId) {
    const prev = lastSoldStatus[slide.lotId];
    const newSt = state.lots?.[slide.lotId]?.status;
    if (!firstStateMsg && newSt === 'sold' && prev !== 'sold') {
      const fp = state.lots[slide.lotId].finalPrice;
      if (fp != null) {
        removeRibbon();
        fireHammer(slide.lotId, fp);
      }
    }
    // Fortrudt hammerslag: ryd Solgt-overlay så viewer ikke står låst.
    if (!firstStateMsg && prev === 'sold' && newSt !== 'sold') {
      clearHammerOverlay();
    }
  }
  for (const k of Object.keys(state.lots || {})) lastSoldStatus[k] = state.lots[k].status;
  firstStateMsg = false;

  // If an auction-display iframe is currently mounted, forward live team
  // amounts to it. Each team's auctionAmount = the last bid (or finalPrice
  // if sold) on their bound lot.
  if (slide?.kind === 'auction-display') {
    const iframe = currentEl?.querySelector('iframe') as HTMLIFrameElement | null;
    if (iframe?.contentWindow) {
      const teams = (EVENT_META.teams || []).map(t => {
        // Per-lot breakdown so the bar can render vertical dividers
        // between each lot's contribution to the live segment.
        const ids = teamLotIds(t);
        const lotAmounts: number[] = ids.map(id => {
          const ls = state.lots?.[id];
          if (!ls) return 0;
          if (ls.status === 'sold' && typeof ls.finalPrice === 'number') return ls.finalPrice;
          if (ls.bids?.length) return ls.bids[ls.bids.length - 1];
          return 0;
        });
        const bidTotal = lotAmounts.reduce((s, v) => s + v, 0);
        return {
          ...t,
          auctionAmount: bidTotal + (t.bonusAmount || 0),
          lotAmounts,                     // [amt for lot1, amt for lot2, ...]
          bonusAmount: t.bonusAmount || 0,
        };
      });
      iframe.contentWindow.postMessage({ type: 'auction-display:teams', teams }, '*');
    }
  }

  // Hybrid bar-strip on lot slides bound to a team — update widths live.
  if (slide?.kind === 'lot' && slide.lotId) {
    const overlay = currentEl?.querySelector('.team-bar-overlay') as HTMLElement | null;
    if (overlay) {
      const teams = EVENT_META.teams || [];
      const totals: Array<{ id: string; pre: number; live: number; total: number }> = teams.map(t => {
        const pre = t.preAmount || 0;
        let bid = 0;
        for (const id of teamLotIds(t)) {
          const ls = state.lots?.[id];
          if (!ls) continue;
          if (ls.status === 'sold' && typeof ls.finalPrice === 'number') bid += ls.finalPrice;
          else if (ls.bids?.length) bid += ls.bids[ls.bids.length - 1];
        }
        const live = bid + (t.bonusAmount || 0);
        return { id: t.id, pre, live, total: pre + live };
      });
      const max = Math.max(1, ...totals.map(t => t.total));
      for (const t of totals) {
        const row = overlay.querySelector(`.tb-row[data-team-id="${t.id}"]`) as HTMLElement | null;
        if (!row) continue;
        const preEl = row.querySelector('.tb-pre') as HTMLElement | null;
        const liveEl = row.querySelector('.tb-live') as HTMLElement | null;
        const amtEl = row.querySelector('.tb-amount') as HTMLElement | null;
        const preW = (t.pre / max) * 100;
        const liveW = (t.live / max) * 100;
        if (preEl) preEl.style.width = `${preW}%`;
        if (liveEl) { liveEl.style.left = `${preW}%`; liveEl.style.width = `${liveW}%`; }
        if (amtEl) amtEl.textContent = `kr ${(t.total).toLocaleString('da-DK').replace(/,/g, '.')}`;
      }
    }
  }
});

// Server drives playback via sound-event messages (init on slide enter,
// hammer on hammerslag, manual via controller). Single track at a time.
sync.onSound(async (event) => {
  if (event.action === 'stop') { stopAudio(); return; }
  // Only the audio-leader viewer plays sound; followers stay silent to
  // prevent double-playback when multiple viewers are open.
  if (!isAudioLeader) return;
  stopAudio();
  const a = new Audio(`/sounds/${event.file}`);
  a.currentTime = event.offset;
  const targetVol = Math.max(0, Math.min(1, typeof event.volume === 'number' ? event.volume : 1));
  a.volume = event.fadeIn > 0 ? 0 : targetVol;
  currentAudio = a;
  try { await a.play(); }
  catch (e) {
    console.warn('audio play blocked — klik i viewer for at aktivere', e);
    showAudioBanner();
    return;
  }
  if (event.fadeIn > 0) rampVolume(a, 0, targetVol, event.fadeIn);
  if (event.fadeOut > 0) {
    a.addEventListener('loadedmetadata', () => {
      const remaining = a.duration - event.offset - event.fadeOut;
      if (remaining <= 0) { rampVolume(a, a.volume, 0, event.fadeOut, () => a.pause()); return; }
      const id = window.setTimeout(() => {
        if (currentAudio !== a) return;
        rampVolume(a, a.volume, 0, event.fadeOut, () => a.pause());
      }, remaining * 1000);
      fadeTimers.add(id as unknown as number);
    });
  }
});

window.addEventListener('resize', () => { if (currentEl) fitToViewport(slideFrame, currentEl); });

bootRender();
console.log('viewer booted, SLIDES count =', SLIDES.length);

// Probe whether audio can autoplay; if not, show the unlock banner up front
// so the operator knows to click into the viewer before the auction starts.
(async () => {
  const probe = new Audio();
  probe.muted = true;
  try { await probe.play(); audioUnlocked = true; }
  catch { showAudioBanner(); }
})();

// Client review: arrow keys / space step through slides via the server,
// so all connected clients stay in sync.
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === ' ') {
    e.preventDefault();
    sync.send({ type: 'nav', slideIdx: Math.min(SLIDES.length - 1, currentSlideIdx + 1) });
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    sync.send({ type: 'nav', slideIdx: Math.max(0, currentSlideIdx - 1) });
  }
});
