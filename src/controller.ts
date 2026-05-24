// Operator controller — dark-green forest theme (per design handoff).
// Layout: topbar + 2x2 main grid (Nuværende, Næste, Live auktion, Auctioneer
// view) + 280px sidebar (grouped lot list + total). Bid history is kept
// internally for undo but not rendered (per operator feedback).

import QRCode from 'qrcode';
import { SyncClient } from './ws-client';
import { renderSlide, fitToViewport } from './render';
import { SLIDES, LOTS, lotById, displayNumFor, refreshLotsFromServer, EVENT_META, type Slide } from './slides';

const sync = new SyncClient();

// ---- DOM lookups ----
const statusPill = document.getElementById('status-pill')!;
// Topbar stats removed — sidebar foot total + history drawer cover this.
const navCurrent  = document.getElementById('nav-current')!;
const navTotal    = document.getElementById('nav-total')!;
const prevBtn     = document.getElementById('prev')!;
const nextBtn     = document.getElementById('next')!;

const currentCard = document.getElementById('current-card')!;
const nextCard    = document.getElementById('next-card')!;

const bidAmountDisplay = document.getElementById('bid-amount-display')!;
const bidLotNum        = document.getElementById('bid-lot-num')!;
const bidLotCat        = document.getElementById('bid-lot-cat')!;
const bidInput         = document.getElementById('bid-input') as HTMLInputElement;
const bidAddBtn        = document.getElementById('bid-add')!;
const presetGridEl     = document.querySelector<HTMLElement>('.preset-grid')!;
let presetBtns         = document.querySelectorAll<HTMLButtonElement>('.preset-btn');
const undoBidBtn       = document.getElementById('undo-bid')!;
const hammerslagBtn    = document.getElementById('hammerslag')!;
const hammerAmountEl   = document.getElementById('hammer-amount')!;

const auctStage    = document.getElementById('auct-stage')!;
const auctBg       = document.getElementById('auct-bg')!;
const auctLotnum   = document.getElementById('auct-lotnum')!;
const auctTitle    = document.getElementById('auct-title-text')!;
const auctDonor    = document.getElementById('auct-donor')!;
const auctBid      = document.getElementById('auct-bid')!;

const sidebarTotal  = document.getElementById('sidebar-total')!;
const progressFill  = document.getElementById('progress-fill')!;
const progressPct   = document.getElementById('progress-pct')!;
const progressCounter = document.getElementById('progress-counter')!;
const lotList       = document.getElementById('lot-list')!;

// Drawers
const drawerSettings = document.getElementById('drawer-settings')!;
const drawerSound    = document.getElementById('drawer-sound')!;
const drawerHistory  = document.getElementById('drawer-history')!;
const drawerTabSettings = document.getElementById('drawer-tab-settings')!;
const drawerTabSound    = document.getElementById('drawer-tab-sound')!;
const drawerTabHistory  = document.getElementById('drawer-tab-history')!;
const historySoldListEl = document.getElementById('history-sold-list')!;
const historyFootAmountEl = document.getElementById('history-foot-amount')!;
const resetAuctionsBtn  = document.getElementById('reset-auctions')!;
const soundLotNumEl     = document.getElementById('sound-lot-num')!;
const soundInitFileEl   = document.getElementById('sound-init-file')   as HTMLSelectElement;
const soundHammerFileEl = document.getElementById('sound-hammer-file') as HTMLSelectElement;
const soundInitKnobEl   = document.getElementById('sound-init-offset-knob') as HTMLInputElement;
const soundInitNumEl    = document.getElementById('sound-init-offset-num')  as HTMLInputElement;
const soundFadeInKnobEl  = document.getElementById('sound-fadein-knob')  as HTMLInputElement;
const soundFadeInNumEl   = document.getElementById('sound-fadein-num')   as HTMLInputElement;
const soundFadeOutKnobEl = document.getElementById('sound-fadeout-knob') as HTMLInputElement;
const soundFadeOutNumEl  = document.getElementById('sound-fadeout-num')  as HTMLInputElement;
const soundInitVolKnobEl   = document.getElementById('sound-init-vol-knob')   as HTMLInputElement;
const soundInitVolNumEl    = document.getElementById('sound-init-vol-num')    as HTMLInputElement;
const soundHammerVolKnobEl = document.getElementById('sound-hammer-vol-knob') as HTMLInputElement;
const soundHammerVolNumEl  = document.getElementById('sound-hammer-vol-num')  as HTMLInputElement;
const soundPlayInitBtn   = document.getElementById('sound-play-init')!;
const soundPlayHammerBtn = document.getElementById('sound-play-hammer')!;
const soundStopBtn       = document.getElementById('sound-stop')!;
const soundPreviewInitBtn   = document.getElementById('sound-preview-init')!;
const soundPreviewHammerBtn = document.getElementById('sound-preview-hammer')!;
const soundRefreshBtn       = document.getElementById('sound-refresh')!;

// ---- State ----
let lastState: any = null;
let currentIdx = 0;
let currentLotNum: string | null = null;
let lastBidByLot: Record<string, number | null> = {};
let lastRenderedCurrentIdx = -999;
let lastRenderedNextIdx    = -999;
const lastSoldStatus: Record<string, string> = {};
let hammerTimer = 0;
let firstStateMsg = true;

// ---- Helpers ----
const fmtKr = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('da-DK').replace(/,/g, '.');

function lotCategory(lot: ReturnType<typeof lotById>): string {
  if (!lot) return '';
  // Derive a short category label from the sponsor field (fallback: empty)
  const s = lot.sponsor || '';
  if (/^doneret/i.test(s)) return 'PRIVAT';
  return s.split('·')[0].trim().toUpperCase().slice(0, 18);
}

function renderLotImage(container: HTMLElement, slide: Slide | null, big: boolean, withRibbon: boolean) {
  container.innerHTML = '';
  if (!slide) return;
  // Image area (full panel) holds a 16:9 frame for the actual slide content
  const image = document.createElement('div');
  image.className = 'lot-image';
  const frame = document.createElement('div');
  frame.className = 'lot-slide-frame';
  const mount = document.createElement('div');
  mount.className = 'preview-mount';
  frame.appendChild(mount);
  image.appendChild(frame);
  container.appendChild(image);

  // Lot number overlay (only for actual lot slides), placed inside the
  // 16:9 frame so it aligns with the slide content not the panel letterbox.
  let lotNum: string | null = null;
  if (slide.kind === 'lot' && slide.lotId) {
    lotNum = slide.lotId;
    const num = document.createElement('div');
    num.className = 'lot-num-overlay' + (big ? '' : ' small');
    num.textContent = slide.lotId;
    frame.appendChild(num);
  }
  // Status tag (top-right of frame)
  if (lotNum && lastState?.lots?.[lotNum]) {
    const st = lastState.lots[lotNum].status;
    if (st === 'live') {
      const tag = document.createElement('div'); tag.className = 'lot-tag live'; tag.textContent = '• Live'; frame.appendChild(tag);
    } else if (st === 'sold') {
      const tag = document.createElement('div'); tag.className = 'lot-tag sold'; tag.textContent = 'Solgt'; frame.appendChild(tag);
    }
  }

  // Render the slide preview into the mount
  const slideEl = renderSlide(slide);
  slideEl.classList.add('is-visible', 'no-build');
  mount.appendChild(slideEl);
  requestAnimationFrame(() => fitToViewport(mount, slideEl));

  // Ribbon (B-style) when bid > 0 — anchored to bottom of the 16:9 frame.
  if (withRibbon && lotNum && lastState?.lots?.[lotNum]) {
    const bids: number[] = lastState.lots[lotNum].bids || [];
    const last = bids.length ? bids[bids.length - 1] : null;
    if (last != null) {
      const lot = lotById(lotNum)!;
      const ribbon = document.createElement('div');
      ribbon.className = 'current-ribbon';
      // Use the same element structure refreshCurrentOverlays expects so
      // subsequent updates patch in place instead of remounting the ribbon.
      ribbon.innerHTML = `
        <div class="cr-lot"><div class="cr-num">${displayNumFor(lot.id)}</div></div>
        <div class="cr-title"><span class="cr-title-text">${lot.title}</span><b class="cr-sponsor">${lot.sponsor}</b></div>
        <div class="cr-bid">
          <span class="cr-label">Nuværende bud</span>
          <span class="cr-amount">${fmtKr(last)}<span class="kr">kr</span></span>
        </div>
      `;
      frame.appendChild(ribbon);
    }
  }
}

function refreshCurrentOverlays(slide: Slide | null) {
  if (!slide) return;
  const frame = currentCard.querySelector('.lot-slide-frame');
  if (!frame) return;
  const existingTag = frame.querySelector('.lot-tag');
  if (existingTag) existingTag.remove();

  // Status tag (live / sold) — always rebuilt cheaply, no animation churn.
  if (slide.kind === 'lot' && slide.lotId && lastState?.lots?.[slide.lotId]) {
    const ls = lastState.lots[slide.lotId];
    if (ls.status === 'live') {
      const tag = document.createElement('div'); tag.className = 'lot-tag live'; tag.textContent = '• Live'; frame.appendChild(tag);
    } else if (ls.status === 'sold') {
      const tag = document.createElement('div'); tag.className = 'lot-tag sold'; tag.textContent = 'Solgt'; frame.appendChild(tag);
    }
  }

  // Ribbon: build wrapper once on first mount, then only update text nodes
  // so the slide-up entrance animation doesn't re-fire on every bid.
  const ls = (slide.kind === 'lot' && slide.lotId) ? lastState?.lots?.[slide.lotId] : null;
  const bids: number[] = ls?.bids || [];
  const last = bids.length ? bids[bids.length - 1] : null;
  const wantsRibbon = slide.kind === 'lot' && slide.lotId && last != null;
  let ribbon = frame.querySelector('.current-ribbon') as HTMLElement | null;
  if (!wantsRibbon) {
    if (ribbon) ribbon.remove();
    return;
  }
  const lot = lotById(slide.lotId!)!;
  if (!ribbon) {
    ribbon = document.createElement('div');
    ribbon.className = 'current-ribbon';
    ribbon.innerHTML = `
      <div class="cr-lot"><div class="cr-num"></div></div>
      <div class="cr-title"><span class="cr-title-text"></span><b class="cr-sponsor"></b></div>
      <div class="cr-bid">
        <span class="cr-label">Nuværende bud</span>
        <span class="cr-amount"></span>
      </div>
    `;
    frame.appendChild(ribbon);
  }
  const numEl   = ribbon.querySelector('.cr-num')!;
  const titleEl = ribbon.querySelector('.cr-title-text')!;
  const spoEl   = ribbon.querySelector('.cr-sponsor')!;
  const amtEl   = ribbon.querySelector('.cr-amount') as HTMLElement;
  const dn = displayNumFor(lot.id);
  if (numEl.textContent   !== dn)         numEl.textContent   = dn;
  if (titleEl.textContent !== lot.title)  titleEl.textContent = lot.title;
  if (spoEl.textContent   !== lot.sponsor) spoEl.textContent  = lot.sponsor;
  amtEl.innerHTML = `${fmtKr(last!)}<span class="kr">kr</span>`;
  amtEl.classList.remove('bid-bump');
  void amtEl.offsetWidth;
  amtEl.classList.add('bid-bump');
}

function updateAuctioneerBid(slide: Slide | null) {
  if (slide?.kind === 'lot' && slide.lotId) {
    const ls = lastState?.lots?.[slide.lotId];
    const last = ls?.bids?.length ? ls.bids[ls.bids.length - 1] : null;
    if (last != null) {
      auctStage.classList.add('has-bid');
      auctStage.classList.add('show-header');
      auctBid.classList.remove('idle');
      auctBid.innerHTML = `${fmtKr(last)}<span class="kr">kr</span>`;
      // re-fire bump
      auctBid.classList.remove('bid-bump');
      void (auctBid as HTMLElement).offsetWidth;
      auctBid.classList.add('bid-bump');
    } else {
      auctStage.classList.remove('has-bid');
      auctStage.classList.remove('show-header');
      auctBid.classList.add('idle');
      auctBid.innerHTML = `—<span class="kr">kr</span>`;
    }
  } else {
    auctStage.classList.remove('has-bid');
    auctStage.classList.remove('show-header');
  }
}

function renderAuctioneerPanel(slide: Slide | null) {
  // Background: render the slide darkened (vignette overlay does the work).
  auctBg.innerHTML = '';
  if (!slide) return;
  const mount = document.createElement('div');
  mount.className = 'preview-mount';
  auctBg.appendChild(mount);
  const slideEl = renderSlide(slide);
  slideEl.classList.add('is-visible', 'no-build');
  mount.appendChild(slideEl);
  requestAnimationFrame(() => fitToViewport(mount, slideEl));

  if (slide.kind === 'lot' && slide.lotId) {
    const lot = lotById(slide.lotId)!;
    auctLotnum.textContent = displayNumFor(lot.id);
    auctTitle.textContent = lot.title;
    auctDonor.textContent = lot.sponsor;
    const ls = lastState?.lots?.[lot.id];
    const last = ls?.bids?.length ? ls.bids[ls.bids.length - 1] : null;
    if (last != null) {
      auctStage.classList.add('has-bid');
      auctStage.classList.add('show-header');
      auctBid.classList.remove('idle');
      auctBid.innerHTML = `${fmtKr(last)}<span class="kr">kr</span>`;
    } else {
      auctStage.classList.remove('has-bid');
      auctStage.classList.remove('show-header');
      auctBid.classList.add('idle');
      auctBid.innerHTML = `—<span class="kr">kr</span>`;
    }
  } else {
    auctStage.classList.remove('has-bid');
    auctStage.classList.remove('show-header');
    auctLotnum.textContent = '—';
    auctTitle.textContent = slide.kind === 'cover' ? 'Cover' : slide.kind === 'sponsor-index' ? 'Sponsorer' : slide.kind === 'closing' ? 'Tak for i aften' : '';
    auctDonor.textContent = '';
    auctBid.classList.add('idle');
    auctBid.innerHTML = `—<span class="kr">kr</span>`;
  }
}

function renderBidHero(slide: Slide | null) {
  if (slide?.kind === 'lot' && slide.lotId) {
    currentLotNum = slide.lotId;
    const lot = lotById(slide.lotId)!;
    bidLotNum.textContent = displayNumFor(lot.id);
    bidLotCat.textContent = lotCategory(lot);
    const ls = lastState?.lots?.[lot.id];
    const last = ls?.bids?.length ? ls.bids[ls.bids.length - 1] : null;
    const finalPrice = ls?.finalPrice;

    if (last != null) {
      bidAmountDisplay.classList.remove('idle');
      // Re-trigger CSS bump on every new bid by toggling a marker class.
      bidAmountDisplay.innerHTML = `${fmtKr(last)}<span class="currency">kr</span>`;
      bidAmountDisplay.classList.remove('bid-bump');
      void (bidAmountDisplay as HTMLElement).offsetWidth;   // reflow
      bidAmountDisplay.classList.add('bid-bump');
    } else {
      bidAmountDisplay.classList.add('idle');
      bidAmountDisplay.innerHTML = `—<span class="currency">kr</span>`;
    }

    // Sold-bar state
    if (ls?.status === 'sold' && finalPrice != null) {
      hammerslagBtn.classList.add('is-sold');
      hammerslagBtn.classList.remove('disabled');
      hammerAmountEl.textContent = fmtKr(finalPrice) + ' kr';
    } else {
      hammerslagBtn.classList.remove('is-sold');
      hammerslagBtn.classList.toggle('disabled', !ls?.bids?.length);
      hammerAmountEl.textContent = last != null ? fmtKr(last) + ' kr' : '';
    }
  } else {
    currentLotNum = null;
    bidLotNum.textContent = '—';
    bidLotCat.textContent = '';
    bidAmountDisplay.classList.add('idle');
    bidAmountDisplay.innerHTML = `—<span class="currency">kr</span>`;
    hammerslagBtn.classList.add('disabled');
    hammerslagBtn.classList.remove('is-sold');
    hammerAmountEl.textContent = '';
  }
}

function renderSidebar(state: any) {
  // Build once, then update classes / badges per state change.
  if (!lotList.dataset.built) {
    // Render slides in deck order (SLIDES array). Section labels are
    // inserted lazily when the kind transitions — keeps the sidebar
    // honest about cross-type ordering set in the generator.
    let lastKind: string | null = null;
    const labelFor = (k: string) =>
      k === 'cover' ? 'Cover'
        : k === 'bordplan' ? 'Bordplan'
        : k === 'sponsor-index' ? 'Sponsorer'
        : k === 'lot' ? 'Lots'
        : k === 'closing' ? 'Afslutning'
        : k;
    for (let i = 0; i < SLIDES.length; i++) {
      const slide = SLIDES[i];
      const idx = i;
      if (slide.kind !== lastKind) {
        const lbl = document.createElement('div');
        lbl.className = 'lot-section-label';
        lbl.textContent = labelFor(slide.kind);
        lotList.appendChild(lbl);
        lastKind = slide.kind;
      }
      {
        const row = document.createElement('div');
        row.className = 'lot-row';
        row.dataset.idx = String(idx);
        const lot = slide.kind === 'lot' ? lotById(slide.lotId!) : null;
        const numLabel = lot
          ? `Lot ${displayNumFor(lot.id)}`
          : (slide.kind === 'cover' ? 'Cover'
            : slide.kind === 'sponsor-index' ? 'Sponsorer'
            : slide.kind === 'bordplan' ? 'Bordplan'
            : 'Afslutning');
        const name = lot
          ? lot.title
          : (slide.kind === 'cover' ? 'Auktionens forside'
            : slide.kind === 'sponsor-index' ? 'Auktionens sponsorer'
            : slide.kind === 'bordplan' ? 'Bordplan'
            : 'Tak for i aften');
        row.innerHTML = `
          <div class="lot-num-side">${lot ? displayNumFor(lot.id) : ''}</div>
          <div class="thumb">
            <div class="preview-mount"></div>
          </div>
          <div class="info">
            <div class="num">${numLabel}</div>
            <div class="name">${name}</div>
          </div>
          <div class="badge"></div>
        `;
        row.addEventListener('click', () => sync.send({ type: 'nav', slideIdx: idx }));
        lotList.appendChild(row);
        const mount = row.querySelector<HTMLElement>('.preview-mount')!;
        const slideEl = renderSlide(slide);
        slideEl.classList.add('is-visible', 'no-build');
        mount.appendChild(slideEl);
        requestAnimationFrame(() => fitToViewport(mount, slideEl));
      }
    }
    lotList.dataset.built = '1';
  }

  // Update per-row state
  let scrollTo: HTMLElement | null = null;
  lotList.querySelectorAll<HTMLElement>('.lot-row').forEach((row: HTMLElement) => {
    const idx = parseInt(row.dataset.idx!, 10);
    const slide = SLIDES[idx];
    const lot = slide.kind === 'lot' ? lotById(slide.lotId!) : null;
    row.classList.toggle('current', idx === state.slideIdx);
    row.classList.toggle('next', idx === state.slideIdx + 1);
    row.classList.toggle('sold', !!(lot && state.lots[lot.id]?.status === 'sold'));
    const badge = row.querySelector('.badge')!;
    if (idx === state.slideIdx) badge.textContent = 'CURRENT';
    else if (idx === state.slideIdx + 1) badge.textContent = 'NEXT';
    else if (lot && state.lots[lot.id]?.status === 'sold') badge.textContent = 'Solgt';
    else badge.textContent = '';
    if (idx === state.slideIdx) scrollTo = row;
  });
  if (scrollTo) (scrollTo as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
}

// ---- Hammer overlay (D ceremoniel) ----
function buildHammerOverlay(lotNum: string, finalPrice: number): HTMLElement {
  const lot = lotById(lotNum)!;
  const wrap = document.createElement('div');
  wrap.className = 'hammer-overlay';
  // 18 gold particles, random angles around the card center, 140-360px float
  const particlesHtml = Array.from({ length: 18 }).map(() => {
    const angle = Math.random() * Math.PI * 2;
    const dist = 140 + Math.random() * 220;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const left = 30 + Math.random() * 40;  // 30%..70%
    const top  = 30 + Math.random() * 40;
    const delay = Math.random() * 600;
    return `<span class="particle" style="left:${left}%;top:${top}%;--dx:${dx}px;--dy:${dy}px;animation-delay:${500 + delay}ms"></span>`;
  }).join('');
  wrap.innerHTML = `
    <div class="hammer-scrim"></div>
    <div class="hammer-rays"></div>
    <div class="hammer-flash"></div>
    <div class="hammer-card">
      <div class="hammer-top"><span class="hammer-icon">🔨</span><span>Solgt</span></div>
      <div class="hammer-lot">${lot.title}<span class="lot-no">Lot ${displayNumFor(lot.id)}</span></div>
      <div class="hammer-bid">${fmtKr(finalPrice)}<span class="kr">kr</span></div>
      <div class="hammer-foot">
        <div class="item"><span>Bud</span><b>${fmtKr(finalPrice)} kr</b></div>
        <div class="item"><span>Doneret af</span><b>${lot.sponsor}</b></div>
      </div>
    </div>
    ${particlesHtml}
  `;
  return wrap;
}

function clearHammerOverlays() {
  document.querySelectorAll<HTMLElement>('.hammer-overlay').forEach(el => {
    if (el.classList.contains('fading')) return;
    el.classList.add('fading');
    setTimeout(() => el.remove(), 340);
  });
  if (hammerTimer) { clearTimeout(hammerTimer); hammerTimer = 0; }
}

function fireHammerOverlay(lotNum: string, finalPrice: number) {
  clearHammerOverlays();
  const nuvPanel = currentCard.closest('.panel');
  if (nuvPanel) nuvPanel.appendChild(buildHammerOverlay(lotNum, finalPrice));
  auctStage.appendChild(buildHammerOverlay(lotNum, finalPrice));
  // Overlay persists until operator navigates to a new lot (cleared in the
  // sync.on slide-change branch). No auto-dismiss — fading back to the live
  // bid view would suggest bidding is still open.
}

function maybeFireHammer(state: any) {
  for (const k of Object.keys(state.lots || {})) {
    const newStatus = state.lots[k].status;
    if (!firstStateMsg && newStatus === 'sold' && lastSoldStatus[k] !== 'sold') {
      const finalPrice = state.lots[k].finalPrice;
      if (finalPrice != null && k === currentLotNum) {
        fireHammerOverlay(k, finalPrice);
      }
    }
    // Hammerslag fortrudt: status går fra 'sold' væk → fjern overlay
    // så auktionen visuelt fortsætter (intet "Solgt"-banner hængende).
    if (!firstStateMsg && lastSoldStatus[k] === 'sold' && newStatus !== 'sold' && k === currentLotNum) {
      clearHammerOverlays();
    }
    lastSoldStatus[k] = newStatus;
  }
  firstStateMsg = false;
}

function renderHistoryDrawer(state: any) {
  const rows: string[] = [];
  let total = 0;
  for (const lot of LOTS) {
    const ls = state.lots?.[lot.id];
    if (ls?.status === 'sold' && typeof ls.finalPrice === 'number') {
      total += ls.finalPrice;
      rows.push(`
        <li data-lot="${lot.id}">
          <span class="h-num">${displayNumFor(lot.id)}</span>
          <span class="h-title">${lot.title}</span>
          <span class="h-amount">${fmtKr(ls.finalPrice)} kr</span>
        </li>
      `);
    }
  }
  if (rows.length === 0) {
    historySoldListEl.innerHTML = `<li class="h-empty">Ingen hammerslag endnu</li>`;
  } else {
    historySoldListEl.innerHTML = rows.join('');
    // Clicking a row navigates to that lot
    historySoldListEl.querySelectorAll<HTMLElement>('li[data-lot]').forEach(li => {
      li.addEventListener('click', () => {
        const lotNum = li.dataset.lot!;
        const idx = SLIDES.findIndex(s => s.kind === 'lot' && s.lotId === lotNum);
        if (idx >= 0) sync.send({ type: 'nav', slideIdx: idx });
      });
      (li.style as any).cursor = 'pointer';
    });
  }
  historyFootAmountEl.textContent = fmtKr(total) + ' kr';
}

function renderStatsAndProgress(state: any) {
  // Total + sold count
  let total = 0; let soldCount = 0;
  const lotIds = LOTS.map(l => l.id);
  for (const k of lotIds) {
    const ls = state.lots[k];
    if (ls?.status === 'sold' && typeof ls.finalPrice === 'number') {
      total += ls.finalPrice;
      soldCount += 1;
    }
  }
  sidebarTotal.textContent = fmtKr(total) + ' kr';
  const pct = Math.round((soldCount / lotIds.length) * 100);
  progressFill.style.width = pct + '%';
  progressPct.textContent = pct + '%';
  progressCounter.textContent = `${soldCount}/${lotIds.length} solgt`;
}

// ---- Boot ----
navTotal.textContent = String(SLIDES.length);

// Refresh once on boot so we pick up any volume-side changes.
refreshLotsFromServer().then(() => { renderPresetChips(); applyEventMeta(); }).catch(() => {});

sync.onLotsUpdated(async () => {
  await refreshLotsFromServer();
  renderPresetChips();
  applyEventMeta();
  // Force a re-render: invalidate the slide-cache markers so the next state
  // update rebuilds Nuværende + Næste with fresh data.
  lastRenderedCurrentIdx = -999;
  lastRenderedNextIdx    = -999;
  // Rebuild sidebar from scratch
  delete lotList.dataset.built;
  lotList.innerHTML = '';
  if (lastState) {
    const slide = SLIDES[currentIdx] ?? null;
    const nextSlide = SLIDES[currentIdx + 1] ?? null;
    renderLotImage(currentCard, slide, true, true);
    renderAuctioneerPanel(slide);
    lastRenderedCurrentIdx = currentIdx;
    renderLotImage(nextCard, nextSlide, false, false);
    lastRenderedNextIdx = currentIdx + 1;
    renderBidHero(slide);
    renderSidebar(lastState);
    renderStatsAndProgress(lastState);
    renderHistoryDrawer(lastState);
  }
});

sync.on((state) => {
  lastState = state;
  statusPill.classList.remove('disconnected');

  currentIdx = state.slideIdx;
  navCurrent.textContent = String(currentIdx + 1).padStart(2, '0');

  const slide = SLIDES[currentIdx] ?? null;
  const nextSlide = SLIDES[currentIdx + 1] ?? null;

  // Slide-preview re-render only when slideIdx changes (otherwise just update
  // overlays — ribbon, status tags, bid display, auctioneer bid number).
  if (currentIdx !== lastRenderedCurrentIdx) {
    lastRenderedCurrentIdx = currentIdx;
    clearHammerOverlays();    // overlay clears immediately on lot change
    renderLotImage(currentCard, slide, true, true);
    renderAuctioneerPanel(slide);
  } else {
    // Just refresh ribbon + status tag on the current card
    refreshCurrentOverlays(slide);
    updateAuctioneerBid(slide);
  }
  const nextIdx = currentIdx + 1;
  if (nextIdx !== lastRenderedNextIdx) {
    lastRenderedNextIdx = nextIdx;
    renderLotImage(nextCard, nextSlide, false, false);
  }

  renderBidHero(slide);
  renderSidebar(state);
  renderStatsAndProgress(state);
  renderHistoryDrawer(state);
  refreshDefaultSoundLabels();
  maybeFireHammer(state);

  // Re-apply sound config UI for current lot
  applySoundConfigToUI(currentLotNum);

  // Auto-focus bid input on lot slide
  if (slide?.kind === 'lot' && document.activeElement !== bidInput) {
    // Only focus on slide transitions, not every state msg
    const last = lastBidByLot[slide.lotId!] ?? null;
    const ls = state.lots[slide.lotId!];
    const cur = ls?.bids?.length ? ls.bids[ls.bids.length - 1] : null;
    if (cur !== last) {
      lastBidByLot[slide.lotId!] = cur;
    }
  }
});

// ---- Nav ----
prevBtn.addEventListener('click', () => sync.send({ type: 'nav', slideIdx: Math.max(0, currentIdx - 1) }));
nextBtn.addEventListener('click', () => sync.send({ type: 'nav', slideIdx: Math.min(SLIDES.length - 1, currentIdx + 1) }));
document.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); (nextBtn as HTMLButtonElement).click(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); (prevBtn as HTMLButtonElement).click(); }
});

// ---- Bid actions ----
function addBid(amount: number) {
  if (!currentLotNum || !amount || isNaN(amount)) return;
  sync.send({ type: 'bid', lotNum: currentLotNum, amount });
  bidInput.value = '';
}
bidAddBtn.addEventListener('click', () => addBid(parseInt(bidInput.value, 10)));
bidInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addBid(parseInt(bidInput.value, 10)); });
// Event delegation so dynamically-rendered preset chips still fire.
presetGridEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.preset-btn');
  if (!btn) return;
  const inc = parseInt(btn.dataset.inc!, 10);
  if (!currentLotNum) return;
  const ls = lastState?.lots?.[currentLotNum];
  const last = ls?.bids?.length ? ls.bids[ls.bids.length - 1] : 0;
  addBid(last + inc);
});

const DEFAULT_PRESETS = [500, 1000, 2000, 3000, 5000, 10000, 20000, 50000, 100000];
function currentPresets(): number[] {
  return (EVENT_META.bidPresets && EVENT_META.bidPresets.length)
    ? EVENT_META.bidPresets
    : DEFAULT_PRESETS;
}
function renderPresetChips() {
  const presets = currentPresets();
  presetGridEl.innerHTML = presets.map(v =>
    `<button class="preset-btn" data-inc="${v}">${v.toLocaleString('da-DK').replace(/,/g, '.')}</button>`
  ).join('');
  const inp = document.getElementById('bid-presets') as HTMLInputElement | null;
  if (inp && document.activeElement !== inp) inp.value = presets.join(', ');
}
renderPresetChips();

// ---- Sound countdown mirror (matches auctioneer overlay) ----
const ctrlSoundCountdownEl = document.getElementById('ctrl-sound-countdown')! as HTMLDivElement;
const ctrlSoundFileEl      = document.getElementById('ctrl-sound-file')!;
const ctrlSoundBarFillEl   = document.getElementById('ctrl-sound-bar-fill')! as HTMLDivElement;
const ctrlSoundRemainingEl = document.getElementById('ctrl-sound-remaining')!;
let ctrlCountdownRaf = 0;
let ctrlCountdownProbe: HTMLAudioElement | null = null;
function ctrlStopCountdown() {
  if (ctrlCountdownRaf) { cancelAnimationFrame(ctrlCountdownRaf); ctrlCountdownRaf = 0; }
  if (ctrlCountdownProbe) { try { ctrlCountdownProbe.pause(); } catch {} ctrlCountdownProbe = null; }
  ctrlSoundCountdownEl.classList.remove('open', 'center-large');
  ctrlSoundBarFillEl.style.width = '0%';
}
sync.onSound((event) => {
  if (event.action === 'stop') { ctrlStopCountdown(); return; }
  ctrlStopCountdown();
  const probe = new Audio(`/sounds/${event.file}`);
  probe.preload = 'metadata';
  probe.muted = true;
  ctrlCountdownProbe = probe;
  ctrlSoundFileEl.textContent = `${event.file} (${event.which})`;
  ctrlSoundCountdownEl.classList.add('open');
  ctrlSoundCountdownEl.classList.toggle('center-large', event.which === 'init');
  ctrlSoundRemainingEl.textContent = '…';
  ctrlSoundBarFillEl.style.width = '0%';
  const startCountdown = (duration: number) => {
    const totalPlay = Math.max(0.1, duration - event.offset);
    const startTs = performance.now();
    const tick = () => {
      if (ctrlCountdownProbe !== probe) return;
      const elapsed = (performance.now() - startTs) / 1000;
      const remaining = Math.max(0, totalPlay - elapsed);
      const pct = Math.min(100, (elapsed / totalPlay) * 100);
      ctrlSoundBarFillEl.style.width = pct + '%';
      ctrlSoundRemainingEl.textContent = remaining.toFixed(1) + 's';
      if (remaining <= 0) { ctrlStopCountdown(); return; }
      ctrlCountdownRaf = requestAnimationFrame(tick);
    };
    ctrlCountdownRaf = requestAnimationFrame(tick);
  };
  const onMeta = () => {
    if (!isFinite(probe.duration) || probe.duration <= 0) return;
    startCountdown(probe.duration);
  };
  probe.addEventListener('loadedmetadata', onMeta);
  probe.addEventListener('durationchange', onMeta);
  probe.load();
});

const bidPresetsInput = document.getElementById('bid-presets') as HTMLInputElement | null;
const bidPresetsSave  = document.getElementById('bid-presets-save') as HTMLButtonElement | null;
if (bidPresetsSave && bidPresetsInput) {
  bidPresetsSave.addEventListener('click', async () => {
    const parsed = bidPresetsInput.value
      .split(/[,\s]+/)
      .map(s => parseInt(s.replace(/\./g, ''), 10))
      .filter(n => Number.isFinite(n) && n > 0);
    if (!parsed.length) { alert('Mindst ét tal kræves'); return; }
    bidPresetsSave.disabled = true;
    try {
      const res = await fetch('/api/meta', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bidPresets: parsed }),
      });
      if (!res.ok) throw new Error('save failed');
      // ws lots-updated will trigger refreshLotsFromServer + renderPresetChips
    } catch (e) {
      alert('Kunne ikke gemme præsets');
    } finally {
      bidPresetsSave.disabled = false;
    }
  });
}

undoBidBtn.addEventListener('click', () => {
  if (!currentLotNum) return;
  sync.send({ type: 'undo-bid', lotNum: currentLotNum } as any);
});

hammerslagBtn.addEventListener('click', () => {
  if (!currentLotNum) return;
  const ls = lastState?.lots?.[currentLotNum];
  const finalPrice = ls?.bids?.length ? ls.bids[ls.bids.length - 1] : null;
  if (finalPrice == null) { alert('Ingen bud endnu — kan ikke hammere'); return; }
  if (ls.status === 'sold') {
    if (!confirm(`Re-hammere lot ${currentLotNum} på ${fmtKr(finalPrice)} kr?`)) return;
  } else {
    if (!confirm(`Hammerslag på ${fmtKr(finalPrice)} kr for lot ${currentLotNum}?`)) return;
  }
  sync.send({ type: 'hammerslag', lotNum: currentLotNum, finalPrice });
});

// ---- Drawers (mutually exclusive — Sound, Settings, History) ----
const allDrawers = [drawerSettings, drawerSound, drawerHistory];
const allTabs    = [drawerTabSettings, drawerTabSound, drawerTabHistory];
function toggleDrawer(target: HTMLElement, targetTab: HTMLElement) {
  const wasOpen = target.classList.contains('open');
  allDrawers.forEach(d => d.classList.remove('open'));
  allTabs.forEach(t => t.classList.remove('active'));
  if (!wasOpen) {
    target.classList.add('open');
    targetTab.classList.add('active');
  }
}
drawerTabSettings.addEventListener('click', () => toggleDrawer(drawerSettings, drawerTabSettings));
drawerTabSound.addEventListener('click', () => toggleDrawer(drawerSound, drawerTabSound));
drawerTabHistory.addEventListener('click', () => toggleDrawer(drawerHistory, drawerTabHistory));
resetAuctionsBtn.addEventListener('click', () => {
  if (!confirm('Nulstil ALLE auktioner? Alle bud + hammerslag slettes.')) return;
  sync.send({ type: 'reset-auctions' } as any);
});

// Theme picker — switches the dark-chrome palette (forest/marine/dark).
// Persists to localStorage. Applied as body class consumed by chrome.css.
const themeRadios = document.querySelectorAll<HTMLInputElement>('input[name="theme"]');
const savedTheme = localStorage.getItem('controller.theme') || 'kidsaid';
function applyTheme(name: string) {
  document.body.classList.remove('theme-forest', 'theme-marine', 'theme-dark', 'theme-kidsaid');
  const valid = ['marine', 'dark', 'forest'].includes(name) ? name : 'kidsaid';
  document.body.classList.add(`theme-${valid}`);
  localStorage.setItem('controller.theme', valid);
}
applyTheme(savedTheme);
themeRadios.forEach(r => {
  if (r.value === savedTheme) r.checked = true;
  r.addEventListener('change', () => { if (r.checked) applyTheme(r.value); });
});

// Brand color overrides — three pickers (primary green, gold, ink) that
// override the active theme. Stored in localStorage and broadcast via
// storage events so viewer + auctioneer reflect the change.
const colorPrimaryEl = document.getElementById('color-primary') as HTMLInputElement;
const colorGoldEl    = document.getElementById('color-gold')    as HTMLInputElement;
const colorInkEl     = document.getElementById('color-ink')     as HTMLInputElement;
const colorResetBtn  = document.getElementById('color-reset')!;

function readCustomColors(): { primary?: string; gold?: string; ink?: string } {
  try { return JSON.parse(localStorage.getItem('brand.colors') || '{}'); }
  catch { return {}; }
}
function applyBrandColors(c: { primary?: string; gold?: string; ink?: string }) {
  // Use !important — body.theme-marine / theme-dark have higher specificity
  // than :root and would otherwise win over our inline override.
  const root = document.documentElement.style;
  const set = (p: string, v: string) => root.setProperty(p, v, 'important');
  if (c.primary) {
    set('--green', c.primary);
    set('--green-dark', `color-mix(in srgb, ${c.primary} 75%, black)`);
    set('--green-200', `color-mix(in srgb, ${c.primary} 55%, white)`);
    set('--green-300', `color-mix(in srgb, ${c.primary} 70%, white)`);
    set('--green-400', c.primary);
    set('--green-500', `color-mix(in srgb, ${c.primary} 85%, black)`);
    set('--green-600', `color-mix(in srgb, ${c.primary} 70%, black)`);
    set('--green-700', `color-mix(in srgb, ${c.primary} 55%, black)`);
    set('--accent-glow', `color-mix(in srgb, ${c.primary} 50%, transparent)`);
  } else {
    ['--green', '--green-dark', '--green-200', '--green-300', '--green-400', '--green-500', '--green-600', '--green-700', '--accent-glow'].forEach(p => root.removeProperty(p));
  }
  if (c.gold) {
    set('--gold', c.gold);
    set('--gold-soft', `color-mix(in srgb, ${c.gold} 60%, black)`);
  } else {
    root.removeProperty('--gold');
    root.removeProperty('--gold-soft');
  }
  if (c.ink) {
    set('--ink', c.ink);
    set('--text-c', c.ink);
  } else {
    root.removeProperty('--ink');
    root.removeProperty('--text-c');
  }
}

const boot = readCustomColors();
applyBrandColors(boot);
if (boot.primary) colorPrimaryEl.value = boot.primary;
if (boot.gold)    colorGoldEl.value    = boot.gold;
if (boot.ink)     colorInkEl.value     = boot.ink;

function saveAndBroadcastColors() {
  const c = {
    primary: colorPrimaryEl.value,
    gold: colorGoldEl.value,
    ink: colorInkEl.value,
  };
  localStorage.setItem('brand.colors', JSON.stringify(c));
  applyBrandColors(c);
}
colorPrimaryEl.addEventListener('input', saveAndBroadcastColors);
colorGoldEl.addEventListener('input', saveAndBroadcastColors);
colorInkEl.addEventListener('input', saveAndBroadcastColors);
colorResetBtn.addEventListener('click', () => {
  localStorage.removeItem('brand.colors');
  applyBrandColors({});
  colorPrimaryEl.value = '#3FA34D';
  colorGoldEl.value    = '#D9BF8C';
  colorInkEl.value     = '#2A2A2A';
  putMeta({ brandColors: { primary: null, gold: null, ink: null } as any });
});

// ---- Event meta (server-persisted) ----
// brandColors + theme + event title/subtitle/date live in lots.json.meta and
// are broadcast via ws so viewer + auctioneer + every controller stay in sync.
const metaEventNameEl     = document.getElementById('meta-event-name')     as HTMLInputElement;
const metaEventSubtitleEl = document.getElementById('meta-event-subtitle') as HTMLInputElement;
const metaEventDateEl     = document.getElementById('meta-event-date')     as HTMLInputElement;
const metaEventSaveBtn    = document.getElementById('meta-event-save')     as HTMLButtonElement;
const brandStrongEl       = document.querySelector('.brand-text strong')   as HTMLElement | null;
const brandSmallEl        = document.querySelector('.brand-text small')    as HTMLElement | null;

async function putMeta(partial: Partial<typeof EVENT_META>): Promise<void> {
  try {
    await fetch('/api/meta', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
  } catch {}
}

function applyEventMeta() {
  // Theme — server wins over localStorage when set.
  if (EVENT_META.theme) {
    applyTheme(EVENT_META.theme);
    themeRadios.forEach(r => { r.checked = (r.value === EVENT_META.theme); });
  }
  // Brand colors — apply if any field set on server.
  if (EVENT_META.brandColors) {
    const c = EVENT_META.brandColors;
    applyBrandColors(c);
    if (c.primary) colorPrimaryEl.value = c.primary;
    if (c.gold)    colorGoldEl.value    = c.gold;
    if (c.ink)     colorInkEl.value     = c.ink;
  }
  // Inputs
  if (metaEventNameEl && document.activeElement !== metaEventNameEl)
    metaEventNameEl.value = EVENT_META.eventName || '';
  if (metaEventSubtitleEl && document.activeElement !== metaEventSubtitleEl)
    metaEventSubtitleEl.value = EVENT_META.eventSubtitle || '';
  if (metaEventDateEl && document.activeElement !== metaEventDateEl)
    metaEventDateEl.value = EVENT_META.eventDate || '';
  // Topbar brand text
  if (brandStrongEl && EVENT_META.eventName) brandStrongEl.textContent = EVENT_META.eventName;
  if (brandSmallEl) {
    const sub = EVENT_META.eventSubtitle;
    if (sub) brandSmallEl.textContent = `CONTROLLER · ${sub.toUpperCase()}`;
  }
}

metaEventSaveBtn?.addEventListener('click', () => {
  putMeta({
    eventName:     metaEventNameEl.value.trim() || null as any,
    eventSubtitle: metaEventSubtitleEl.value.trim() || null as any,
    eventDate:     metaEventDateEl.value || null as any,
  });
});

// Theme picker — also persist to server so all clients sync.
themeRadios.forEach(r => {
  r.addEventListener('change', () => {
    if (r.checked) putMeta({ theme: r.value as any });
  });
});

// Brand color — debounce server PUT to avoid spamming on slider drag.
let brandSaveTimer: any = null;
function scheduleBrandPut() {
  if (brandSaveTimer) clearTimeout(brandSaveTimer);
  brandSaveTimer = setTimeout(() => {
    putMeta({ brandColors: {
      primary: colorPrimaryEl.value,
      gold:    colorGoldEl.value,
      ink:     colorInkEl.value,
    }});
  }, 400);
}
colorPrimaryEl.addEventListener('input', scheduleBrandPut);
colorGoldEl.addEventListener('input', scheduleBrandPut);
colorInkEl.addEventListener('input', scheduleBrandPut);

// Local toggle: show/hide the big lot-num overlay on Nuværende + Næste.
// Persisted in localStorage. Default off — slide content already shows the
// lot number, so the overlay would duplicate the digit.
const toggleLotNumEl = document.getElementById('toggle-lot-num') as HTMLInputElement;
const lotNumPref = localStorage.getItem('controller.showLotNum') === '1';
toggleLotNumEl.checked = lotNumPref;
document.body.classList.toggle('show-lot-num', lotNumPref);
toggleLotNumEl.addEventListener('change', () => {
  const on = toggleLotNumEl.checked;
  document.body.classList.toggle('show-lot-num', on);
  localStorage.setItem('controller.showLotNum', on ? '1' : '0');
});

// ---- Sound config ----
async function loadSoundFiles() {
  try {
    const res = await fetch('/api/sounds');
    const { files } = await res.json();
    for (const sel of [soundInitFileEl, soundHammerFileEl]) {
      const current = sel.value;
      sel.innerHTML = '<option value="">(none)</option>' +
        files.map((f: string) => `<option value="${f}">${f}</option>`).join('');
      if (files.includes(current)) sel.value = current;
    }
  } catch (e) { console.warn('failed loading sounds', e); }
}
soundRefreshBtn.addEventListener('click', loadSoundFiles);
loadSoundFiles();

function applySoundConfigToUI(lotNum: string | null) {
  soundLotNumEl.textContent = lotNum ?? '—';
  const cfg = (lotNum && lastState?.sounds?.[lotNum]) || {};
  soundInitFileEl.value   = cfg.initSound ?? '';
  soundHammerFileEl.value = cfg.hammerSound ?? '';
  const offset = cfg.initStartOffset ?? 0;
  soundInitKnobEl.value = String(offset); soundInitNumEl.value = String(offset);
  const fadeIn = cfg.fadeInSec ?? 0;
  soundFadeInKnobEl.value = String(fadeIn); soundFadeInNumEl.value = String(fadeIn);
  const fadeOut = cfg.fadeOutSec ?? 0;
  soundFadeOutKnobEl.value = String(fadeOut); soundFadeOutNumEl.value = String(fadeOut);
  const initVol = Math.round((cfg.initVolume ?? 1) * 100);
  soundInitVolKnobEl.value = String(initVol); soundInitVolNumEl.value = String(initVol);
  const hammerVol = Math.round((cfg.hammerVolume ?? 1) * 100);
  soundHammerVolKnobEl.value = String(hammerVol); soundHammerVolNumEl.value = String(hammerVol);
}
function pushSoundConfig() {
  if (!currentLotNum) return;
  sync.send({
    type: 'set-sound', lotNum: currentLotNum,
    config: {
      initSound: soundInitFileEl.value || undefined,
      initStartOffset: parseFloat(soundInitNumEl.value) || 0,
      hammerSound: soundHammerFileEl.value || undefined,
      fadeInSec: parseFloat(soundFadeInNumEl.value) || 0,
      fadeOutSec: parseFloat(soundFadeOutNumEl.value) || 0,
      initVolume: (parseFloat(soundInitVolNumEl.value) || 100) / 100,
      hammerVolume: (parseFloat(soundHammerVolNumEl.value) || 100) / 100,
    },
  } as any);
}
soundInitFileEl.addEventListener('change', pushSoundConfig);
soundHammerFileEl.addEventListener('change', pushSoundConfig);
function bindKnobPair(knob: HTMLInputElement, num: HTMLInputElement) {
  knob.addEventListener('input', () => { num.value = knob.value; });
  knob.addEventListener('change', pushSoundConfig);
  num.addEventListener('change', () => { knob.value = num.value; pushSoundConfig(); });
}
bindKnobPair(soundInitKnobEl, soundInitNumEl);
bindKnobPair(soundFadeInKnobEl, soundFadeInNumEl);
bindKnobPair(soundFadeOutKnobEl, soundFadeOutNumEl);
bindKnobPair(soundInitVolKnobEl, soundInitVolNumEl);
bindKnobPair(soundHammerVolKnobEl, soundHammerVolNumEl);

soundPlayInitBtn.addEventListener('click', () => {
  if (!currentLotNum) return;
  sync.send({ type: 'play-sound', lotNum: currentLotNum, which: 'init' } as any);
});
soundPlayHammerBtn.addEventListener('click', () => {
  if (!currentLotNum) return;
  sync.send({ type: 'play-sound', lotNum: currentLotNum, which: 'hammer' } as any);
});
soundStopBtn.addEventListener('click', () => sync.send({ type: 'stop-sound' } as any));

function playPreview(file: string | null, offset = 0) {
  if (!file) return;
  const a = new Audio(`/sounds/${file}`);
  a.currentTime = offset;
  a.play().catch(e => console.warn('preview play failed', e));
}
soundPreviewInitBtn.addEventListener('click', () => playPreview(soundInitFileEl.value, parseFloat(soundInitNumEl.value) || 0));
soundPreviewHammerBtn.addEventListener('click', () => playPreview(soundHammerFileEl.value, 0));

// ---- Sound uploads (per-lot override + deck-wide defaults) ----
async function uploadSound(file: File, which: 'init' | 'hammer', lotId: string | null) {
  const fd = new FormData();
  fd.append('kind', 'sound');
  fd.append('which', which);
  if (lotId) fd.append('lotId', lotId);
  fd.append('file', file);
  try {
    statusPill.textContent = `Uploading ${which}…`;
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    await loadSoundFiles();
    // Auto-select the just-uploaded file in the current dropdown.
    if (lotId === currentLotNum) {
      if (which === 'init') { soundInitFileEl.value = data.filename; pushSoundConfig(); }
      else { soundHammerFileEl.value = data.filename; pushSoundConfig(); }
    }
  } catch (e) { console.warn('sound upload failed', e); }
}

const soundInitUploadEl   = document.getElementById('sound-init-upload')   as HTMLInputElement;
const soundHammerUploadEl = document.getElementById('sound-hammer-upload') as HTMLInputElement;
soundInitUploadEl.addEventListener('change', () => {
  if (soundInitUploadEl.files?.[0] && currentLotNum) uploadSound(soundInitUploadEl.files[0], 'init', currentLotNum);
});
soundHammerUploadEl.addEventListener('change', () => {
  if (soundHammerUploadEl.files?.[0] && currentLotNum) uploadSound(soundHammerUploadEl.files[0], 'hammer', currentLotNum);
});

const defaultInitUploadEl   = document.getElementById('default-init-upload')   as HTMLInputElement;
const defaultHammerUploadEl = document.getElementById('default-hammer-upload') as HTMLInputElement;
const defaultInitCurrentEl  = document.getElementById('default-init-current')!;
const defaultHammerCurrentEl = document.getElementById('default-hammer-current')!;
const defaultInitVolKnobEl   = document.getElementById('default-init-vol-knob')   as HTMLInputElement;
const defaultInitVolNumEl    = document.getElementById('default-init-vol-num')    as HTMLInputElement;
const defaultHammerVolKnobEl = document.getElementById('default-hammer-vol-knob') as HTMLInputElement;
const defaultHammerVolNumEl  = document.getElementById('default-hammer-vol-num')  as HTMLInputElement;
defaultInitUploadEl.addEventListener('change', () => {
  if (defaultInitUploadEl.files?.[0]) uploadSound(defaultInitUploadEl.files[0], 'init', null);
});
defaultHammerUploadEl.addEventListener('change', () => {
  if (defaultHammerUploadEl.files?.[0]) uploadSound(defaultHammerUploadEl.files[0], 'hammer', null);
});
function pushDefaultSoundConfig() {
  sync.send({
    type: 'set-sound-defaults',
    config: {
      initVolume:   (parseFloat(defaultInitVolNumEl.value)   || 100) / 100,
      hammerVolume: (parseFloat(defaultHammerVolNumEl.value) || 100) / 100,
    },
  } as any);
}
function bindDefaultKnobPair(knob: HTMLInputElement, num: HTMLInputElement) {
  knob.addEventListener('input', () => { num.value = knob.value; });
  knob.addEventListener('change', pushDefaultSoundConfig);
  num.addEventListener('change', () => { knob.value = num.value; pushDefaultSoundConfig(); });
}
bindDefaultKnobPair(defaultInitVolKnobEl, defaultInitVolNumEl);
bindDefaultKnobPair(defaultHammerVolKnobEl, defaultHammerVolNumEl);

function refreshDefaultSoundLabels() {
  const d = lastState?.soundDefaults || {};
  defaultInitCurrentEl.textContent   = d.initSound   || '—';
  defaultHammerCurrentEl.textContent = d.hammerSound || '—';
  if (document.activeElement !== defaultInitVolKnobEl && document.activeElement !== defaultInitVolNumEl) {
    const iv = Math.round((d.initVolume ?? 1) * 100);
    defaultInitVolKnobEl.value = String(iv); defaultInitVolNumEl.value = String(iv);
  }
  if (document.activeElement !== defaultHammerVolKnobEl && document.activeElement !== defaultHammerVolNumEl) {
    const hv = Math.round((d.hammerVolume ?? 1) * 100);
    defaultHammerVolKnobEl.value = String(hv); defaultHammerVolNumEl.value = String(hv);
  }
}

// ---- Open viewers in new windows ----
document.querySelectorAll<HTMLButtonElement>('#open-buttons button').forEach(btn => {
  btn.addEventListener('click', () => {
    const path = btn.dataset.open!;
    const url = new URL(path, window.location.origin).toString();
    // _blank forces a fresh window; custom target names get reused which
    // is why the previous build felt like "same window".
    window.open(url, '_blank', 'noopener,noreferrer');
  });
});

// ---- Share bars + QR panels ----
document.querySelectorAll<HTMLButtonElement>('.share-bar').forEach(bar => {
  const path = bar.dataset.share!;
  const targetId = bar.dataset.target!;
  const panel = document.getElementById(targetId)!;
  const canvas = panel.querySelector<HTMLCanvasElement>('.qr-canvas')!;
  const urlEl = panel.querySelector<HTMLDivElement>('.qr-url')!;
  const url = new URL(path, window.location.origin).toString();
  urlEl.textContent = url;
  QRCode.toCanvas(canvas, url, { width: 256, margin: 2, color: { dark: '#000', light: '#fff' } });
  bar.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = panel.classList.toggle('open');
    bar.classList.toggle('open', isOpen);
  });
  panel.addEventListener('click', () => {
    panel.classList.remove('open');
    bar.classList.remove('open');
  });
});

// ---- Mirror clock on auctioneer view ----
const auctClockMirror = document.getElementById('auct-clock-mirror');
function tickAuctClock() {
  if (!auctClockMirror) return;
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  auctClockMirror.textContent = `${hh}:${mm}:${ss}`;
}
tickAuctClock();
setInterval(tickAuctClock, 1000);

// ---- Resize: refit slide previews ----
window.addEventListener('resize', () => {
  document.querySelectorAll<HTMLElement>('.preview-mount').forEach(mount => {
    const slideEl = mount.querySelector<HTMLElement>('.slide-canvas');
    if (slideEl) fitToViewport(mount, slideEl);
  });
});
