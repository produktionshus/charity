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
// preview-auctioneer is now an <iframe src="/auctioneer.html"> that syncs
// itself via its own ws connection — no manual rendering needed here.
const thumbs = document.getElementById('thumbs')!;
const position = document.getElementById('position')!;
const prevBtn = document.getElementById('prev')!;
const nextBtn = document.getElementById('next')!;

const bidLotNumEl = document.getElementById('bid-lot-num')!;
const bidCurrentAmountEl = document.getElementById('bid-current-amount')!;
const bidTotalAmountEl = document.getElementById('bid-total-amount')!;
const bidInputEl = document.getElementById('bid-input') as HTMLInputElement;
const bidAddBtn = document.getElementById('bid-add')!;
const bidHistoryEl = document.getElementById('bid-history')!;
const hammerslagBtn = document.getElementById('hammerslag')!;
const bidQuickButtons = document.querySelectorAll<HTMLButtonElement>('.bid-quick button');

// ---- Drawers ----
const drawerSettings = document.getElementById('drawer-settings')!;
const drawerSound    = document.getElementById('drawer-sound')!;
const drawerTabSettings = document.getElementById('drawer-tab-settings')!;
const drawerTabSound    = document.getElementById('drawer-tab-sound')!;
const resetAuctionsBtn  = document.getElementById('reset-auctions')!;
const soundLotNumEl     = document.getElementById('sound-lot-num')!;
const soundInitFileEl   = document.getElementById('sound-init-file') as HTMLSelectElement;
const soundHammerFileEl = document.getElementById('sound-hammer-file') as HTMLSelectElement;
const soundInitKnobEl   = document.getElementById('sound-init-offset-knob') as HTMLInputElement;
const soundInitNumEl    = document.getElementById('sound-init-offset-num')  as HTMLInputElement;
const soundFadeInKnobEl  = document.getElementById('sound-fadein-knob')  as HTMLInputElement;
const soundFadeInNumEl   = document.getElementById('sound-fadein-num')   as HTMLInputElement;
const soundFadeOutKnobEl = document.getElementById('sound-fadeout-knob') as HTMLInputElement;
const soundFadeOutNumEl  = document.getElementById('sound-fadeout-num')  as HTMLInputElement;
const soundPlayInitBtn      = document.getElementById('sound-play-init')!;
const soundPlayHammerBtn    = document.getElementById('sound-play-hammer')!;
const soundStopBtn          = document.getElementById('sound-stop')!;
const soundPreviewInitBtn   = document.getElementById('sound-preview-init')!;
const soundPreviewHammerBtn = document.getElementById('sound-preview-hammer')!;
const soundRefreshBtn       = document.getElementById('sound-refresh')!;

function toggleDrawer(drawer: HTMLElement, other: HTMLElement) {
  const wasOpen = drawer.classList.contains('open');
  other.classList.remove('open');
  drawer.classList.toggle('open', !wasOpen);
}
drawerTabSettings.addEventListener('click', () => toggleDrawer(drawerSettings, drawerSound));
drawerTabSound.addEventListener('click', () => toggleDrawer(drawerSound, drawerSettings));

resetAuctionsBtn.addEventListener('click', () => {
  if (!confirm('Nulstil ALLE auktioner? Alle bud + hammerslag slettes.')) return;
  sync.send({ type: 'reset-auctions' } as any);
});

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
  soundInitKnobEl.value = String(offset);
  soundInitNumEl.value  = String(offset);
  const fadeIn  = cfg.fadeInSec ?? 0;
  const fadeOut = cfg.fadeOutSec ?? 0;
  soundFadeInKnobEl.value = String(fadeIn);
  soundFadeInNumEl.value  = String(fadeIn);
  soundFadeOutKnobEl.value = String(fadeOut);
  soundFadeOutNumEl.value  = String(fadeOut);
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

let currentIdx = 0;
let currentLotNum: string | null = null;
let lastState: any = null;

function renderPreview(container: HTMLElement, idx: number) {
  container.innerHTML = '';
  const slide = SLIDES[idx];
  if (!slide) return;
  const el = renderSlide(slide);
  // Previews show finished state — no build animation
  el.classList.add('is-visible', 'no-build');
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
    slideEl.classList.add('is-visible', 'no-build');
    inner.appendChild(slideEl);
    // Defer fit until thumb has layout dimensions
    requestAnimationFrame(() => fitToViewport(inner, slideEl));
  });
}

function updateBidPanel(state: any) {
  // Accumulated total across all sold lots
  let total = 0;
  for (const k of Object.keys(state.lots)) {
    const ls = state.lots[k];
    if (ls.status === 'sold' && typeof ls.finalPrice === 'number') total += ls.finalPrice;
  }
  bidTotalAmountEl.textContent = total.toLocaleString('da-DK') + ' kr';

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
    applySoundConfigToUI(lot.num);
  } else {
    currentLotNum = null;
    bidLotNumEl.textContent = '—';
    bidCurrentAmountEl.textContent = '— kr';
    bidHistoryEl.innerHTML = '';
    hammerslagBtn.textContent = 'HAMMERSLAG';
    applySoundConfigToUI(null);
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
  // auctioneer preview is a live iframe; no manual render
  let currentThumb: HTMLElement | null = null;
  thumbs.querySelectorAll<HTMLElement>('.thumb').forEach((t, i) => {
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
    if (i === currentIdx) currentThumb = t;
  });
  // Smooth-scroll the current thumb into view (centered). User can still
  // scroll the strip manually via the native scrollbar — this only triggers
  // when slide changes.
  if (currentThumb) {
    currentThumb.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }
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
