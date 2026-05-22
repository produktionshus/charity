// Auctioneer monitor — F-style spotlight (per design handoff).
// Vignetted lot image as ambient background, lot number + title top-left,
// big centered bid number. Sound countdown floats bottom-right. Hammer
// overlay fires on Solgt and stays until lot change.

import { SyncClient } from './ws-client';
import { renderSlide, fitToViewport } from './render';
import { SLIDES, lotById, type Slide } from './slides';

// Mirror controller's saved theme via shared localStorage.
const savedTheme = localStorage.getItem('controller.theme') || 'forest';
document.body.classList.add(`theme-${savedTheme}`);
window.addEventListener('storage', (e) => {
  if (e.key !== 'controller.theme' || !e.newValue) return;
  document.body.classList.remove('theme-forest', 'theme-marine', 'theme-dark');
  document.body.classList.add(`theme-${e.newValue}`);
});

const stage = document.getElementById('stage')!;
const monitor = document.getElementById('auct-monitor')!;
const lotnumEl = document.getElementById('auct-lotnum')!;
const titleEl  = document.getElementById('auct-title-text')!;
const donorEl  = document.getElementById('auct-donor')!;
const bidEl    = document.getElementById('auct-bid')!;

const clockEl = document.getElementById('auct-clock')!;
const soundCountdownEl = document.getElementById('sound-countdown')! as HTMLDivElement;
const soundFileEl      = document.getElementById('sound-file')!;
const soundBarFillEl   = document.getElementById('sound-bar-fill')! as HTMLDivElement;
const soundRemainingEl = document.getElementById('sound-remaining')!;

const fmtKr = (n: number) => n.toLocaleString('da-DK').replace(/,/g, '.');

const sync = new SyncClient();
let currentIdx = -1;
let lastBid: number | null = null;
const lastSoldStatus: Record<string, string> = {};
let firstStateMsg = true;

// ---- Background slide preview ----
let bgMount: HTMLElement | null = null;
function ensureBg() {
  if (bgMount) return bgMount;
  bgMount = document.createElement('div');
  bgMount.className = 'preview-mount';
  monitor.insertBefore(bgMount, monitor.firstChild);
  return bgMount;
}
function setBackgroundSlide(slide: Slide | null) {
  const mount = ensureBg();
  mount.innerHTML = '';
  if (!slide) return;
  const slideEl = renderSlide(slide);
  slideEl.classList.add('is-visible', 'no-build');
  mount.appendChild(slideEl);
  requestAnimationFrame(() => fitToViewport(mount, slideEl));
}

// ---- Hammer overlay ----
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
      <div class="lot-line">${lot.title}<span class="lot-no">Lot ${lot.id}</span></div>
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
  const el = stage.querySelector('.hammer-overlay-c') as HTMLElement | null;
  if (!el || el.classList.contains('fading')) return;
  el.classList.add('fading');
  setTimeout(() => el.remove(), 340);
}
function fireHammer(lotNum: string, finalPrice: number) {
  clearHammerOverlay();
  stage.appendChild(buildHammerOverlay(lotNum, finalPrice));
}

// ---- State sync ----
sync.on((state) => {
  const slide = SLIDES[state.slideIdx] ?? null;

  if (state.slideIdx !== currentIdx) {
    currentIdx = state.slideIdx;
    setBackgroundSlide(slide);
    clearHammerOverlay();
    lastBid = null;
  }

  if (slide?.kind === 'lot' && slide.lotId) {
    const lot = lotById(slide.lotId)!;
    lotnumEl.textContent = lot.id;
    titleEl.textContent = lot.title;
    donorEl.textContent = lot.sponsor;

    const ls = state.lots?.[slide.lotId];
    const last = ls?.bids?.length ? ls.bids[ls.bids.length - 1] : null;
    const sold = ls?.status === 'sold';
    if (last != null && !sold) {
      monitor.classList.add('has-bid');
      monitor.classList.add('show-header');
      bidEl.classList.remove('idle');
      bidEl.innerHTML = `${fmtKr(last)}<span class="kr">kr</span>`;
      if (lastBid !== last) {
        bidEl.classList.remove('bid-bump-anim');
        void (bidEl as HTMLElement).offsetWidth;
        bidEl.classList.add('bid-bump-anim');
      }
      lastBid = last;
    } else if (!sold) {
      monitor.classList.remove('has-bid');
      monitor.classList.remove('show-header');
      bidEl.innerHTML = `—<span class="kr">kr</span>`;
      lastBid = null;
    }

    // Hammer overlay on transition to sold
    const prev = lastSoldStatus[slide.lotId];
    if (!firstStateMsg && ls?.status === 'sold' && prev !== 'sold' && ls.finalPrice != null) {
      fireHammer(slide.lotId, ls.finalPrice);
      monitor.classList.remove('has-bid');
    }
  } else {
    monitor.classList.remove('show-header');
    monitor.classList.remove('has-bid');
    lotnumEl.textContent = '—';
    titleEl.textContent = slide?.kind === 'cover' ? 'Cover' : slide?.kind === 'sponsor-index' ? 'Sponsorer' : slide?.kind === 'closing' ? 'Tak for i aften' : '';
    donorEl.textContent = '';
    bidEl.innerHTML = `—<span class="kr">kr</span>`;
    lastBid = null;
  }

  for (const k of Object.keys(state.lots || {})) lastSoldStatus[k] = state.lots[k].status;
  firstStateMsg = false;
});

// ---- Sound playback countdown (visual only — viewer handles audio) ----
let countdownRaf = 0;
let countdownProbe: HTMLAudioElement | null = null;

function stopCountdown() {
  if (countdownRaf) { cancelAnimationFrame(countdownRaf); countdownRaf = 0; }
  if (countdownProbe) { try { countdownProbe.pause(); } catch {} countdownProbe = null; }
  soundCountdownEl.classList.remove('open');
  soundBarFillEl.style.width = '0%';
}

sync.onSound((event) => {
  if (event.action === 'stop') { stopCountdown(); return; }
  stopCountdown();
  const probe = new Audio(`/sounds/${event.file}`);
  probe.preload = 'metadata';
  probe.muted = true;
  countdownProbe = probe;
  soundFileEl.textContent = `${event.file} (${event.which})`;
  soundCountdownEl.classList.add('open');
  probe.addEventListener('loadedmetadata', () => {
    const totalPlay = Math.max(0.1, probe.duration - event.offset);
    const startTs = performance.now();
    const tick = () => {
      if (countdownProbe !== probe) return;
      const elapsed = (performance.now() - startTs) / 1000;
      const remaining = Math.max(0, totalPlay - elapsed);
      const pct = Math.min(100, (elapsed / totalPlay) * 100);
      soundBarFillEl.style.width = pct + '%';
      soundRemainingEl.textContent = remaining.toFixed(1) + 's';
      if (remaining <= 0) { stopCountdown(); return; }
      countdownRaf = requestAnimationFrame(tick);
    };
    countdownRaf = requestAnimationFrame(tick);
  });
});

// Keyboard nav (lets a client review slides without the controller)
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === ' ') {
    e.preventDefault();
    sync.send({ type: 'nav', slideIdx: Math.min(SLIDES.length - 1, currentIdx + 1) });
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    sync.send({ type: 'nav', slideIdx: Math.max(0, currentIdx - 1) });
  }
});

// Room-time clock — ticks every second, always visible.
function tickClock() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  clockEl.textContent = `${hh}:${mm}:${ss}`;
}
tickClock();
setInterval(tickClock, 1000);

window.addEventListener('resize', () => {
  const slideEl = bgMount?.querySelector('.slide-canvas') as HTMLElement | null;
  if (bgMount && slideEl) fitToViewport(bgMount, slideEl);
});
