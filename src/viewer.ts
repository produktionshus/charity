// Audience viewer — fullscreen single slide, syncs to server state.
// Slide swaps cross-fade (220ms) to keep the audience visually anchored.

import { SyncClient } from './ws-client';
import { renderSlide, fitToViewport } from './render';
import { SLIDES } from './slides';

const stage = document.getElementById('stage')!;

let currentSlideIdx = -1;
let currentEl: HTMLElement | null = null;
let audioUnlocked = false;

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
  stage.appendChild(next);
  fitToViewport(stage, next);
  next.getBoundingClientRect();  // reflow
  next.classList.remove('entering');
  // Trigger build-in animation on this slide (per-element fades start at t=0)
  next.classList.add('is-visible');
  currentEl?.classList.add('entering');
  const previous = currentEl;
  currentEl = next;
  setTimeout(() => previous?.remove(), 260);
}

sync.on((state) => {
  if (state.slideIdx === currentSlideIdx) return;
  currentSlideIdx = state.slideIdx;
  swapSlide(currentSlideIdx);
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

window.addEventListener('resize', () => { if (currentEl) fitToViewport(stage, currentEl); });

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
