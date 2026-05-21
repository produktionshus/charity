// Auctioneer view — same slide as audience, plus a side panel with lot
// details, live bid tracking, total raised, and a sound playback countdown
// so the auctioneer knows how long the current cue will run.

import { SyncClient } from './ws-client';
import { renderSlide, fitToViewport } from './render';
import { SLIDES, lotByNum } from './slides';

const stage = document.getElementById('stage')!;
const lotNumEl = document.getElementById('lot-num')!;
const lotTitleEl = document.getElementById('lot-title')!;
const lotDonorEl = document.getElementById('lot-donor')!;
const lotNotesEl = document.getElementById('lot-notes')!;
const bidCurrentEl = document.getElementById('bid-current')!;
const bidHistoryEl = document.getElementById('bid-history-list')!;
const bidTotalEl = document.getElementById('bid-total')!;
const soundCountdownEl = document.getElementById('sound-countdown')! as HTMLDivElement;
const soundFileEl = document.getElementById('sound-file')!;
const soundBarFillEl = document.getElementById('sound-bar-fill')! as HTMLDivElement;
const soundRemainingEl = document.getElementById('sound-remaining')!;

const sync = new SyncClient();
let currentEl: HTMLElement | null = null;
let currentIdx = -1;

// Boot-render slide 0 so the stage isn't blank if ws lags. State takes over.
function bootRender() {
  const slide = SLIDES[0];
  const next = renderSlide(slide);
  stage.appendChild(next);
  requestAnimationFrame(() => {
    fitToViewport(stage, next);
    next.classList.add('is-visible');
  });
  currentEl = next;
  currentIdx = 0;
}
bootRender();
window.addEventListener('resize', () => { if (currentEl) fitToViewport(stage, currentEl); });

sync.on((state) => {
  const slide = SLIDES[state.slideIdx];
  if (!slide) return;
  if (state.slideIdx !== currentIdx) {
    currentIdx = state.slideIdx;
    const next = renderSlide(slide);
    next.classList.add('entering');
    stage.appendChild(next);
    requestAnimationFrame(() => {
      fitToViewport(stage, next);
      requestAnimationFrame(() => {
        next.classList.remove('entering');
        next.classList.add('is-visible');
        currentEl?.classList.add('entering');
      });
    });
    const previous = currentEl;
    currentEl = next;
    setTimeout(() => previous?.remove(), 260);
  }

  // Accumulated total across all sold lots
  let total = 0;
  for (const k of Object.keys(state.lots || {})) {
    const ls = state.lots[k];
    if (ls.status === 'sold' && typeof ls.finalPrice === 'number') total += ls.finalPrice;
  }
  bidTotalEl.textContent = total.toLocaleString('da-DK') + ' kr';

  if (slide.kind === 'lot') {
    const lot = lotByNum(slide.lotNum!);
    if (lot) {
      lotNumEl.textContent = lot.num;
      lotTitleEl.textContent = lot.title;
      lotDonorEl.textContent = `Doneret af: ${lot.sponsor}`;
      const bidState = state.lots[lot.num];
      const bids = bidState?.bids ?? [];
      const last = bids.length ? bids[bids.length - 1] : null;
      bidCurrentEl.textContent = last != null ? last.toLocaleString('da-DK') + ' kr' : '— kr';
      bidHistoryEl.innerHTML = bids
        .map((b: number) => `<li><span>${b.toLocaleString('da-DK')} kr</span></li>`)
        .join('');
      if (bidState?.status === 'sold' && bidState.finalPrice != null) {
        lotNotesEl.textContent = `SOLGT — ${bidState.finalPrice.toLocaleString('da-DK')} kr`;
        bidCurrentEl.textContent = bidState.finalPrice.toLocaleString('da-DK') + ' kr';
      } else {
        lotNotesEl.textContent = '';
      }
    }
  } else {
    lotNumEl.textContent = '';
    lotTitleEl.textContent = slide.kind === 'cover' ? 'Cover' : slide.kind;
    lotDonorEl.textContent = '';
    lotNotesEl.textContent = '';
    bidCurrentEl.textContent = '— kr';
    bidHistoryEl.innerHTML = '';
  }
});

// ---- Sound playback countdown ----
let countdownRaf = 0;
let countdownAudio: HTMLAudioElement | null = null;

function stopCountdown() {
  if (countdownRaf) { cancelAnimationFrame(countdownRaf); countdownRaf = 0; }
  if (countdownAudio) { try { countdownAudio.pause(); } catch {} countdownAudio = null; }
  soundCountdownEl.hidden = true;
  soundBarFillEl.style.width = '0%';
}

sync.onSound((event) => {
  if (event.action === 'stop') { stopCountdown(); return; }
  stopCountdown();
  // Load metadata to get duration. Don't actually play this — viewer handles audio.
  const probe = new Audio(`/sounds/${event.file}`);
  probe.preload = 'metadata';
  probe.muted = true;
  countdownAudio = probe;
  soundFileEl.textContent = `${event.file} (${event.which})`;
  soundCountdownEl.hidden = false;
  probe.addEventListener('loadedmetadata', () => {
    const totalPlay = Math.max(0.1, probe.duration - event.offset);
    const startTs = performance.now();
    const tick = () => {
      if (countdownAudio !== probe) return;
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

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === ' ') {
    e.preventDefault();
    sync.send({ type: 'nav', slideIdx: Math.min(SLIDES.length - 1, currentIdx + 1) });
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    sync.send({ type: 'nav', slideIdx: Math.max(0, currentIdx - 1) });
  }
});
