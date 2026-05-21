// Audience viewer — fullscreen single slide, syncs to server state.
// Slide swaps cross-fade (220ms) to keep the audience visually anchored.

import { SyncClient } from './ws-client';
import { renderSlide, fitToViewport } from './render';
import { SLIDES } from './slides';

const stage = document.getElementById('stage')!;

let currentSlideIdx = -1;
let currentEl: HTMLElement | null = null;

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
  // Force reflow so the transition fires on opacity change
  next.getBoundingClientRect();
  next.classList.remove('entering');
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
