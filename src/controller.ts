// Operator controller — 4 zones: current/next preview, live auction panel,
// auctioneer-view mirror, plus a thumb sidebar.

import QRCode from 'qrcode';
import { SyncClient } from './ws-client';
import { renderSlide, fitToViewport } from './render';
import { SLIDES, LOTS, lotByNum } from './slides';
import { lotLayout } from './layout';

const sync = new SyncClient();
const status = document.getElementById('status')!;
const previewCurrent = document.getElementById('preview-current')!;
const previewNext = document.getElementById('preview-next')!;
const previewAuctioneer = document.getElementById('preview-auctioneer')!;
const thumbs = document.getElementById('thumbs')!;
const position = document.getElementById('position')!;
const prevBtn = document.getElementById('prev')!;
const nextBtn = document.getElementById('next')!;

const bidLotNumEl = document.getElementById('bid-lot-num')!;
const bidCurrentAmountEl = document.getElementById('bid-current-amount')!;
const bidInputEl = document.getElementById('bid-input') as HTMLInputElement;
const bidAddBtn = document.getElementById('bid-add')!;
const bidHistoryEl = document.getElementById('bid-history')!;
const hammerslagBtn = document.getElementById('hammerslag')!;
const bidQuickButtons = document.querySelectorAll<HTMLButtonElement>('.bid-quick button');

let currentIdx = 0;
let currentLotNum: string | null = null;
let lastState: any = null;

function renderPreview(container: HTMLElement, idx: number) {
  container.innerHTML = '';
  const slide = SLIDES[idx];
  if (!slide) return;
  const el = renderSlide(slide);
  container.appendChild(el);
  fitToViewport(container, el);
}

function renderThumbs() {
  thumbs.innerHTML = '';
  SLIDES.forEach((s, i) => {
    const t = document.createElement('div');
    t.className = 'thumb' + (i === currentIdx ? ' active' : '');
    t.dataset.idx = String(i);
    const inner = document.createElement('div');
    inner.className = 'thumb-stage';
    t.appendChild(inner);
    const label = document.createElement('span');
    label.className = 'thumb-label';
    label.textContent = s.kind === 'lot' ? `Lot ${s.lotNum}` : s.kind === 'cover' ? 'Cover' : s.kind === 'sponsor-index' ? 'Sponsors' : 'Closing';
    t.appendChild(label);
    t.addEventListener('click', () => sync.send({ type: 'nav', slideIdx: i }));
    thumbs.appendChild(t);
    // Render the mini slide
    const slideEl = renderSlide(s);
    inner.appendChild(slideEl);
    // Defer fit until thumb has layout dimensions
    requestAnimationFrame(() => fitToViewport(inner, slideEl));
  });
}

function updateBidPanel(state: any) {
  const slide = SLIDES[state.slideIdx];
  if (slide?.kind === 'lot' && slide.lotNum) {
    currentLotNum = slide.lotNum;
    const lot = lotByNum(slide.lotNum)!;
    bidLotNumEl.textContent = lot.num;
    const lotState = state.lots[lot.num];
    const last = lotState.bids[lotState.bids.length - 1];
    bidCurrentAmountEl.textContent = last != null ? last.toLocaleString('da-DK') + ' kr' : '— kr';
    bidHistoryEl.innerHTML = lotState.bids
      .map((b: number, i: number) => `<div>${i + 1}. ${b.toLocaleString('da-DK')} kr</div>`)
      .reverse()
      .join('');
    if (lotState.status === 'sold') {
      hammerslagBtn.classList.add('sold');
      hammerslagBtn.textContent = `SOLGT — ${lotState.finalPrice.toLocaleString('da-DK')} kr`;
    } else {
      hammerslagBtn.classList.remove('sold');
      hammerslagBtn.textContent = 'HAMMERSLAG';
    }
  } else {
    currentLotNum = null;
    bidLotNumEl.textContent = '—';
    bidCurrentAmountEl.textContent = '— kr';
    bidHistoryEl.innerHTML = '';
    hammerslagBtn.textContent = 'HAMMERSLAG';
  }
}

sync.on((state) => {
  lastState = state;
  status.textContent = 'connected';
  status.classList.add('connected');
  currentIdx = state.slideIdx;
  position.textContent = `${currentIdx + 1} / ${SLIDES.length}`;
  renderPreview(previewCurrent, currentIdx);
  renderPreview(previewNext, currentIdx + 1);
  renderPreview(previewAuctioneer, currentIdx);  // mirrors auctioneer for now
  thumbs.querySelectorAll('.thumb').forEach((t, i) => {
    t.classList.toggle('current', i === currentIdx);
    t.classList.toggle('next', i === currentIdx + 1);
    let state = t.querySelector('.thumb-state');
    if (!state && (i === currentIdx || i === currentIdx + 1)) {
      state = document.createElement('span');
      state.className = 'thumb-state';
      t.appendChild(state);
    }
    if (state) {
      if (i === currentIdx) { state.textContent = 'CURRENT'; state.className = 'thumb-state current'; }
      else if (i === currentIdx + 1) { state.textContent = 'NEXT'; state.className = 'thumb-state next'; }
      else state.remove();
    }
  });
  updateBidPanel(state);
});

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
  bidInputEl.value = '';
}

bidAddBtn.addEventListener('click', () => addBid(parseInt(bidInputEl.value, 10)));
bidInputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') addBid(parseInt(bidInputEl.value, 10)); });
bidQuickButtons.forEach(btn => btn.addEventListener('click', () => {
  const inc = parseInt(btn.dataset.inc!, 10);
  if (!currentLotNum) return;
  const lotState = lastState?.lots[currentLotNum];
  const last = lotState?.bids[lotState.bids.length - 1] ?? 0;
  addBid(last + inc);
}));

hammerslagBtn.addEventListener('click', () => {
  if (!currentLotNum) return;
  const lotState = lastState?.lots[currentLotNum];
  const finalPrice = lotState?.bids[lotState.bids.length - 1];
  if (finalPrice == null) { alert('Ingen bud endnu — kan ikke hammere'); return; }
  if (!confirm(`Hammerslag på ${finalPrice.toLocaleString('da-DK')} kr for lot ${currentLotNum}?`)) return;
  sync.send({ type: 'hammerslag', lotNum: currentLotNum, finalPrice });
});

renderThumbs();

// ---- Open viewers in new windows ----
document.querySelectorAll<HTMLButtonElement>('#open-buttons button').forEach(btn => {
  btn.addEventListener('click', () => {
    const path = btn.dataset.open!;
    const url = new URL(path, window.location.origin).toString();
    window.open(url, path, 'noopener,noreferrer');
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
