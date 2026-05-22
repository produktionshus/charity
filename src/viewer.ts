// Audience viewer — fullscreen single slide, syncs to server state.
// Slide swaps cross-fade (220ms) to keep the audience visually anchored.

import { SyncClient } from './ws-client';
import { renderSlide, fitToViewport } from './render';
import { SLIDES, lotById, displayNumFor, refreshLotsFromServer } from './slides';

// Mirror controller's saved theme so all three views share the chrome.
const savedTheme = localStorage.getItem('controller.theme') || 'forest';
document.body.classList.add(`theme-${savedTheme}`);
window.addEventListener('storage', (e) => {
  if (e.key !== 'controller.theme' || !e.newValue) return;
  document.body.classList.remove('theme-forest', 'theme-marine', 'theme-dark');
  document.body.classList.add(`theme-${e.newValue}`);
});

const stage = document.getElementById('stage')!;
const slideFrame = document.getElementById('slide-frame')!;

let currentSlideIdx = -1;
let currentEl: HTMLElement | null = null;
let audioUnlocked = false;
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
}
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

// ---- Sound playback with fade in/out, single-track ----
let currentAudio: HTMLAudioElement | null = null;
const fadeTimers = new Set<number>();
function clearFades() { fadeTimers.forEach(id => clearInterval(id)); fadeTimers.clear(); }
function stopAudio() {
  clearFades();
  if (currentAudio) { try { currentAudio.pause(); } catch {} currentAudio = null; }
}

function rampVolume(a: HTMLAudioElement, from: number, to: number, durationSec: number, onDone?: () => void) {
  if (durationSec <= 0) { a.volume = to; onDone?.(); return; }
  const start = performance.now();
  const id = window.setInterval(() => {
    if (currentAudio !== a) { clearInterval(id); fadeTimers.delete(id); return; }
    const t = Math.min(1, (performance.now() - start) / (durationSec * 1000));
    a.volume = from + (to - from) * t;
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

function swapSlide(idx: number) {
  const slide = SLIDES[idx];
  if (!slide) { console.warn('no slide at idx', idx, 'of', SLIDES.length); return; }
  const next = renderSlide(slide);
  next.classList.add('entering');
  slideFrame.appendChild(next);
  fitToViewport(slideFrame, next);
  next.getBoundingClientRect();  // reflow
  next.classList.remove('entering');
  // Trigger build-in animation on this slide (per-element fades start at t=0)
  next.classList.add('is-visible');
  currentEl?.classList.add('entering');
  const previous = currentEl;
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
      <div class="bid">${fmtKr(finalPrice)}<span class="kr">kr</span></div>
      <div class="foot">
        <div class="item"><span>Bud</span><b>${fmtKr(finalPrice)} kr</b></div>
        <div class="item"><span>Doneret af</span><b>${lot.sponsor}</b></div>
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

sync.onLotsUpdated(async () => {
  await refreshLotsFromServer();
  // Re-render current slide with fresh data (no full reload, no flash).
  if (currentSlideIdx >= 0) swapSlide(currentSlideIdx);
});

sync.on((state) => {
  if (state.slideIdx !== currentSlideIdx) {
    currentSlideIdx = state.slideIdx;
    swapSlide(currentSlideIdx);
    clearHammerOverlay();
    removeRibbon();
  }

  // Ribbon mount/update based on current slide's lot + bid
  const slide = SLIDES[currentSlideIdx];
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
  }
  for (const k of Object.keys(state.lots || {})) lastSoldStatus[k] = state.lots[k].status;
  firstStateMsg = false;
});

// Server drives playback via sound-event messages (init on slide enter,
// hammer on hammerslag, manual via controller). Single track at a time.
sync.onSound(async (event) => {
  if (event.action === 'stop') { stopAudio(); return; }
  stopAudio();
  const a = new Audio(`/sounds/${event.file}`);
  a.currentTime = event.offset;
  a.volume = event.fadeIn > 0 ? 0 : 1;
  currentAudio = a;
  try { await a.play(); } catch (e) { console.warn('audio play blocked', e); return; }
  if (event.fadeIn > 0) rampVolume(a, 0, 1, event.fadeIn);
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
