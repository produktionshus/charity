// Auctioneer view — shows the same slide as the audience, plus a side panel
// with lot details, bid controls, and hammerslag. Bid module wires in next.

import { SyncClient } from './ws-client';
import { renderSlide, fitToViewport } from './render';
import { SLIDES, lotByNum } from './slides';

const stage = document.getElementById('stage')!;
const lotNumEl = document.getElementById('lot-num')!;
const lotTitleEl = document.getElementById('lot-title')!;
const lotDonorEl = document.getElementById('lot-donor')!;
const lotNotesEl = document.getElementById('lot-notes')!;

const sync = new SyncClient();
let currentEl: HTMLElement | null = null;

let currentIdx = -1;
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
        currentEl?.classList.add('entering');
      });
    });
    const previous = currentEl;
    currentEl = next;
    setTimeout(() => previous?.remove(), 260);
  }

  if (slide.kind === 'lot') {
    const lot = lotByNum(slide.lotNum!);
    if (lot) {
      lotNumEl.textContent = lot.num;
      lotTitleEl.textContent = lot.title;
      lotDonorEl.textContent = `Doneret af: ${lot.sponsor}`;
      const bidState = state.lots[lot.num];
      const bids = bidState?.bids ?? [];
      const final = bidState?.finalPrice;
      lotNotesEl.textContent = `Bids: ${bids.length}\nCurrent: ${bids.length ? bids[bids.length - 1].toLocaleString('da-DK') + ' kr' : '–'}\n${final != null ? 'SOLGT: ' + final.toLocaleString('da-DK') + ' kr' : ''}`;
    }
  } else {
    lotNumEl.textContent = '';
    lotTitleEl.textContent = slide.kind === 'cover' ? 'Cover' : slide.kind;
    lotDonorEl.textContent = '';
    lotNotesEl.textContent = '';
  }
});

window.addEventListener('resize', () => { if (currentEl) fitToViewport(stage, currentEl); });
