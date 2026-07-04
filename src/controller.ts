// Operator controller v2 — cream paper chrome (design_handoff_generator_v2).
// Two operator layouts: A · Konsol (big now-card + right rail) and
// B · Launchpad (NU-bar + tile grid). Slide previews reuse renderSlide()
// (same data → same pixels as viewer/generator). Live state over ws.

import QRCode from 'qrcode';
import { SyncClient } from './ws-client';
import { renderSlide, fitToViewport, resolvedSlideTheme, slideThemeGradient } from './render';
import { SLIDES, LOTS, ALL_ITEMS, lotById, displayNumFor, refreshLotsFromServer, EVENT_META, type Slide, type SlideTheme } from './slides';

const sync = new SyncClient();

const fmtKr = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('da-DK').replace(/,/g, '.');

const KIND_META: Record<string, { name: string; dot: string }> = {
  lot:               { name: 'Lot',             dot: '#3FA34D' },
  cover:             { name: 'Cover',           dot: '#B8893A' },
  bordplan:          { name: 'Bordplan',        dot: '#1F4A28' },
  'sponsor-index':   { name: 'Sponsor-indeks',  dot: '#D9B26A' },
  closing:           { name: 'Closing',         dot: '#8E6824' },
  'wish-loop':       { name: 'Ønske-loop',      dot: '#7FBF8E' },
  media:             { name: 'Media',           dot: '#5C544A' },
  'auction-display': { name: 'Auktion-display', dot: '#E6C885' },
  carousel:          { name: 'Billedkarrusel',  dot: '#A67B33' },
  contest:           { name: 'Konkurrence',     dot: '#C0764F' },
};

function slideTitle(slide: Slide): string {
  if (slide.kind === 'lot' && slide.lotId) return lotById(slide.lotId)?.title || '(uden titel)';
  const item = slide.itemId ? ALL_ITEMS.find(i => i.id === slide.itemId) : undefined;
  return (item as any)?.label || KIND_META[slide.kind]?.name || slide.kind;
}
function slideEyebrow(slide: Slide): string {
  if (slide.kind === 'lot' && slide.lotId) return `LOT ${displayNumFor(slide.lotId)}`;
  return (KIND_META[slide.kind]?.name || slide.kind).toUpperCase();
}

// ---- DOM ----
const statusPill = document.getElementById('status-pill')!;
const histCountEl = document.getElementById('hist-count')!;
const ctlTotalEl = document.getElementById('ctl-total')!;
const ctlClockEl = document.getElementById('ctl-clock')!;
const viewKonsol = document.getElementById('view-konsol')!;
const viewLaunchpad = document.getElementById('view-launchpad')!;
const segOpLayout = document.getElementById('seg-oplayout')!;
const nowEyebrow = document.getElementById('now-eyebrow')!;
const nowCard = document.getElementById('now-card')!;
const nowMount = document.getElementById('now-mount')!;
const nowSold = document.getElementById('now-sold')!;
const nowSoldAmt = document.getElementById('now-sold-amt')!;
const nextEyebrow = document.getElementById('next-eyebrow')!;
const nextCard = document.getElementById('next-card')!;
const nextMount = document.getElementById('next-mount')!;
const ctlCounter = document.getElementById('ctl-counter')!;
const goBtn = document.getElementById('go-btn')!;
const goHint = document.getElementById('go-hint')!;
const prevBtn = document.getElementById('prev-btn')!;
const konsolBpCollapse = document.getElementById('konsol-bp-collapse')!;
const ctlItems = document.getElementById('ctl-items')!;
const progressFill = document.getElementById('progress-fill')!;
const progressCounter = document.getElementById('progress-counter')!;
const lpMount = document.getElementById('lp-mount')!;
const lpSold = document.getElementById('lp-sold')!;
const lpSoldAmt = document.getElementById('lp-sold-amt')!;
const lpNowLabel = document.getElementById('lp-now-label')!;
const lpTitle = document.getElementById('lp-title')!;
const lpNext = document.getElementById('lp-next')!;
const lpBpCollapse = document.getElementById('lp-bp-collapse')!;
const lpPrev = document.getElementById('lp-prev')!;
const lpGo = document.getElementById('lp-go')!;
const lpTiles = document.getElementById('lp-tiles')!;
// Auctioneer mirror
const auctStage = document.getElementById('auct-stage')!;
const auctBg = document.getElementById('auct-bg')!;
const auctLotnum = document.getElementById('auct-lotnum')!;
const auctTitle = document.getElementById('auct-title-text')!;
const auctDonor = document.getElementById('auct-donor')!;
const auctBid = document.getElementById('auct-bid')!;
const auctBidLabel = document.getElementById('auct-bid-label')!;
// Drawer
const drawerScrim = document.getElementById('drawer-scrim')!;
const drawerTitle = document.getElementById('drawer-title')!;
const drawerClose = document.getElementById('drawer-close')!;
const drawerSettingsContent = document.getElementById('drawer-settings-content')!;
const drawerHistoryContent = document.getElementById('drawer-history-content')!;
const openSettingsBtn = document.getElementById('open-settings')!;
const openHistoryBtn = document.getElementById('open-history')!;
const historySoldListEl = document.getElementById('history-sold-list')!;
const historyFootAmountEl = document.getElementById('history-foot-amount')!;
const resetAuctionsBtn = document.getElementById('reset-auctions')!;
// Toast
const toastEl = document.getElementById('ctl-toast')!;
let toastTimer = 0;
function toast(msg: string) {
  toastEl.textContent = msg;
  toastEl.classList.add('open');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('open'), 2600);
}

// ---- State ----
let lastState: any = null;
let currentIdx = 0;
let currentLotNum: string | null = null;
let lastRenderedIdx = -999;
let lastRenderedLayout = '';
const lastSoldStatus: Record<string, string> = {};
let soldOrder: string[] = [];
let firstStateMsg = true;
let opLayout: 'konsol' | 'launchpad' =
  (localStorage.getItem('controller.layout') as any) === 'launchpad' ? 'launchpad' : 'konsol';

// ---- Layout toggle ----
function applyOpLayout() {
  viewKonsol.style.display = opLayout === 'konsol' ? '' : 'none';
  viewLaunchpad.style.display = opLayout === 'launchpad' ? '' : 'none';
  segOpLayout.querySelectorAll<HTMLButtonElement>('button[data-val]').forEach(b => {
    b.classList.toggle('active', b.dataset.val === opLayout);
  });
  lastRenderedIdx = -999;   // force slide re-mount in the visible view
  if (lastState) update(lastState);
}
segOpLayout.querySelectorAll<HTMLButtonElement>('button[data-val]').forEach(b => {
  b.addEventListener('click', () => {
    opLayout = b.dataset.val as any;
    localStorage.setItem('controller.layout', opLayout);
    applyOpLayout();
  });
});

// ---- Viewport-derived now-card width (JYSK principle) ----
function computeNowW(): number {
  const winW = window.innerWidth, winH = window.innerHeight;
  return Math.round(Math.max(520, Math.min(winW - 420, (winH - 480) * 16 / 9, 1680)));
}
function sizeCards() {
  const nowW = computeNowW();
  nowCard.style.width = `${nowW}px`;
  nowCard.style.height = `${Math.round(nowW * 9 / 16)}px`;
  const nextW = Math.round(Math.max(280, Math.min(nowW * 0.42, 560)));
  nextCard.style.width = `${nextW}px`;
  nextCard.style.height = `${Math.round(nextW * 9 / 16)}px`;
}

// ---- Slide mounting ----
function mountSlide(mountEl: HTMLElement, slide: Slide | null) {
  mountEl.innerHTML = '';
  if (!slide) return;
  const slideEl = renderSlide(slide);
  slideEl.classList.add('is-visible', 'no-build');
  slideEl.querySelectorAll<HTMLVideoElement>('video').forEach(v => { v.muted = true; v.volume = 0; });
  mountEl.appendChild(slideEl);
  requestAnimationFrame(() => fitToViewport(mountEl, slideEl));
}
function refitAll() {
  document.querySelectorAll<HTMLElement>('.preview-mount').forEach(mount => {
    const slideEl = mount.querySelector<HTMLElement>('.slide-canvas');
    if (slideEl) fitToViewport(mount, slideEl);
  });
}

// ---- Bid panel (class-based — updates both layouts' instances) ----
const bpAmountEls = () => document.querySelectorAll<HTMLElement>('.bp-amount');
const bpHistoryEls = () => document.querySelectorAll<HTMLElement>('.bp-history');
const bpLotEls = () => document.querySelectorAll<HTMLElement>('.bp-lot');
const bpSoldAmtEls = () => document.querySelectorAll<HTMLElement>('.bp-sold-amt');
const DEFAULT_PRESETS = [500, 1000, 2000, 3000, 5000, 10000, 25000];
function currentPresets(): number[] {
  return (EVENT_META.bidPresets && EVENT_META.bidPresets.length)
    ? EVENT_META.bidPresets
    : DEFAULT_PRESETS;
}
function renderPresetChips() {
  const presets = currentPresets().slice(0, 9);
  const html = presets.map(v =>
    `<button class="bp-preset" data-inc="${v}">+${fmtKr(v)}</button>`
  ).join('');
  document.querySelectorAll<HTMLElement>('.bp-presets').forEach(el => { el.innerHTML = html; });
  const inp = document.getElementById('bid-presets') as HTMLInputElement | null;
  if (inp && document.activeElement !== inp) inp.value = currentPresets().join(', ');
}
function currentBid(): number | null {
  if (!currentLotNum) return null;
  const ls = lastState?.lots?.[currentLotNum];
  return ls?.bids?.length ? ls.bids[ls.bids.length - 1] : null;
}
function updateBidPanels(slide: Slide | null) {
  const isLot = slide?.kind === 'lot' && !!slide.lotId;
  konsolBpCollapse.classList.toggle('collapsed', !isLot);
  lpBpCollapse.classList.toggle('collapsed', !isLot);
  if (!isLot) { currentLotNum = null; return; }
  currentLotNum = slide!.lotId!;
  const ls = lastState?.lots?.[currentLotNum];
  const bids: number[] = ls?.bids || [];
  const last = bids.length ? bids[bids.length - 1] : null;
  const sold = ls?.status === 'sold';
  const shown = sold && ls.finalPrice != null ? ls.finalPrice : last;
  bpLotEls().forEach(el => el.textContent = `LOT ${displayNumFor(currentLotNum!)}`);
  bpAmountEls().forEach(el => {
    el.classList.toggle('idle', shown == null);
    el.innerHTML = `${fmtKr(shown)}<span class="kr"> kr</span>`;
  });
  bpHistoryEls().forEach(el => {
    el.textContent = bids.length ? 'Budhistorik: ' + bids.slice(-5).map(fmtKr).join(' → ') : 'Ingen bud endnu';
  });
  bpSoldAmtEls().forEach(el => el.textContent = last != null ? `· ${fmtKr(last)} kr` : '');
  document.querySelectorAll<HTMLButtonElement>('.bp-sold').forEach(b => {
    b.classList.toggle('is-sold', sold);
    b.disabled = !bids.length && !sold;
  });
}
function addBid(amount: number) {
  if (!currentLotNum || !amount || isNaN(amount)) return;
  const ls = lastState?.lots?.[currentLotNum];
  if (ls?.status === 'sold') { toast('Lot er solgt — brug Fortryd først'); return; }
  sync.send({ type: 'bid', lotNum: currentLotNum, amount });
}
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const preset = t.closest<HTMLButtonElement>('.bp-preset');
  if (preset) {
    if (!currentLotNum) return;
    const inc = parseInt(preset.dataset.inc!, 10);
    addBid((currentBid() || 0) + inc);
    return;
  }
  if (t.closest('.bp-set')) {
    const panel = t.closest('.ctl-bidpanel, .lp-bidcluster');
    const input = panel?.querySelector<HTMLInputElement>('.bp-input');
    if (input) {
      const n = parseInt(input.value, 10);
      if (Number.isFinite(n) && n > 0) { addBid(n); input.value = ''; }
    }
    return;
  }
  if (t.closest('.bp-undo')) {
    if (!currentLotNum) return;
    const ls = lastState?.lots?.[currentLotNum];
    if (ls?.status === 'sold') toast('Salg rullet tilbage');
    sync.send({ type: 'undo-bid', lotNum: currentLotNum } as any);
    return;
  }
  if (t.closest('.bp-sold')) {
    if (!currentLotNum) return;
    const last = currentBid();
    if (last == null) { toast('Intet bud at sælge på'); return; }
    const ls = lastState?.lots?.[currentLotNum];
    const dn = displayNumFor(currentLotNum);
    if (ls?.status === 'sold') {
      if (!confirm(`Re-hammere lot ${dn} på ${fmtKr(last)} kr?`)) return;
    } else {
      if (!confirm(`Hammerslag på ${fmtKr(last)} kr for lot ${dn}?`)) return;
    }
    sync.send({ type: 'hammerslag', lotNum: currentLotNum, finalPrice: last });
  }
});
document.querySelectorAll<HTMLInputElement>('.bp-input').forEach(inp => {
  inp.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const n = parseInt(inp.value, 10);
    if (Number.isFinite(n) && n > 0) { addBid(n); inp.value = ''; }
  });
});

// ---- Nav ----
function nav(idx: number) {
  sync.send({ type: 'nav', slideIdx: Math.max(0, Math.min(SLIDES.length - 1, idx)) });
}
goBtn.addEventListener('click', () => nav(currentIdx + 1));
lpGo.addEventListener('click', () => nav(currentIdx + 1));
prevBtn.addEventListener('click', () => nav(currentIdx - 1));
lpPrev.addEventListener('click', () => nav(currentIdx - 1));
document.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.key === 'Escape') { closeDrawer(); return; }
  if (e.key === ' ' || e.code === 'Space' || e.key === 'ArrowRight') { e.preventDefault(); nav(currentIdx + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); nav(currentIdx - 1); }
});

// ---- Item list (Konsol) + tiles (Launchpad) ----
function buildItemList() {
  ctlItems.innerHTML = '';
  SLIDES.forEach((slide, i) => {
    const m = KIND_META[slide.kind] || { name: slide.kind, dot: '#8A8175' };
    const row = document.createElement('div');
    row.className = 'ctl-item-row';
    row.dataset.idx = String(i);
    const num = slide.kind === 'lot' && slide.lotId ? displayNumFor(slide.lotId) : '·';
    row.innerHTML = `
      <span class="num pp-mono">${num}</span>
      <span class="dot" style="background:${m.dot}"></span>
      <span class="title">${slideTitle(slide)}</span>
      <span class="sold pp-mono pp-tabular"></span>
    `;
    row.addEventListener('click', () => nav(i));
    ctlItems.appendChild(row);
  });
}
function buildTiles() {
  lpTiles.innerHTML = '';
  SLIDES.forEach((slide, i) => {
    const m = KIND_META[slide.kind] || { name: slide.kind, dot: '#8A8175' };
    const tile = document.createElement('div');
    tile.className = 'lp-tile';
    tile.dataset.idx = String(i);
    const num = slide.kind === 'lot' && slide.lotId ? displayNumFor(slide.lotId) : '·';
    tile.innerHTML = `
      <div class="head">
        <span class="num pp-mono">${num}</span>
        <span class="bar" style="background:${m.dot}"></span>
        <div class="pp-flex-spacer"></div>
        <span class="cur pp-mono"></span>
      </div>
      <span class="title">${slideTitle(slide).slice(0, 52)}</span>
      <span class="foot">
        <span class="tname pp-mono">${m.name}</span>
        <div class="pp-flex-spacer"></div>
        <span class="sold pp-mono pp-tabular"></span>
      </span>
    `;
    tile.addEventListener('click', () => nav(i));
    lpTiles.appendChild(tile);
  });
}
function updateItemStates(state: any) {
  let scrollTo: HTMLElement | null = null;
  ctlItems.querySelectorAll<HTMLElement>('.ctl-item-row').forEach(row => {
    const i = parseInt(row.dataset.idx!, 10);
    const slide = SLIDES[i];
    const lotId = slide?.kind === 'lot' ? slide.lotId : null;
    const ls = lotId ? state.lots?.[lotId] : null;
    row.classList.toggle('current', i === state.slideIdx);
    row.querySelector('.sold')!.textContent = ls?.status === 'sold' && ls.finalPrice != null ? fmtKr(ls.finalPrice) : '';
    if (i === state.slideIdx) scrollTo = row;
  });
  if (scrollTo && opLayout === 'konsol') (scrollTo as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  lpTiles.querySelectorAll<HTMLElement>('.lp-tile').forEach(tile => {
    const i = parseInt(tile.dataset.idx!, 10);
    const slide = SLIDES[i];
    const lotId = slide?.kind === 'lot' ? slide.lotId : null;
    const ls = lotId ? state.lots?.[lotId] : null;
    const sold = ls?.status === 'sold' && ls.finalPrice != null;
    tile.classList.toggle('current', i === state.slideIdx);
    tile.classList.toggle('is-sold', !!sold);
    tile.querySelector('.cur')!.textContent = i === state.slideIdx ? '● NU' : '';
    tile.querySelector('.sold')!.textContent = sold ? `🔨 ${fmtKr(ls.finalPrice)}` : '';
  });
}

// ---- Auctioneer mirror ----
function updateAuctMirror(slide: Slide | null) {
  if (slide?.kind === 'lot' && slide.lotId) {
    const lot = lotById(slide.lotId)!;
    auctLotnum.textContent = displayNumFor(lot.id);
    auctTitle.textContent = lot.title;
    auctDonor.textContent = lot.sponsor;
    const ls = lastState?.lots?.[lot.id];
    const sold = ls?.status === 'sold' && ls.finalPrice != null;
    const last = ls?.bids?.length ? ls.bids[ls.bids.length - 1] : null;
    auctBidLabel.textContent = sold ? 'SOLGT' : 'NUVÆRENDE BUD';
    auctBid.innerHTML = `${fmtKr(sold ? ls.finalPrice : last)}<span class="kr"> kr</span>`;
    auctBid.classList.toggle('idle', !sold && last == null);
  } else if (slide) {
    auctLotnum.textContent = '—';
    auctTitle.textContent = slideTitle(slide);
    auctDonor.textContent = '';
    auctBidLabel.textContent = 'NUVÆRENDE BUD';
    auctBid.innerHTML = `—<span class="kr"> kr</span>`;
    auctBid.classList.add('idle');
  }
}
function renderAuctBg(slide: Slide | null) {
  auctBg.innerHTML = '';
  if (!slide) return;
  const mount = document.createElement('div');
  mount.className = 'preview-mount';
  auctBg.appendChild(mount);
  mountSlide(mount, slide);
}

// ---- Sold overlays ----
function updateSoldOverlays(slide: Slide | null) {
  const lotId = slide?.kind === 'lot' ? slide.lotId : null;
  const ls = lotId ? lastState?.lots?.[lotId] : null;
  const sold = ls?.status === 'sold' && ls.finalPrice != null;
  nowSold.style.display = sold ? '' : 'none';
  lpSold.style.display = sold ? '' : 'none';
  if (sold) {
    nowSoldAmt.textContent = `${fmtKr(ls.finalPrice)} kr`;
    lpSoldAmt.textContent = `🔨 SOLGT · ${fmtKr(ls.finalPrice)} kr`;
  }
}

// ---- Hammer overlay (ceremonial) ----
let hammerTimer = 0;
// Ceremonial hammer overlay — identical markup/classes to viewer +
// auctioneer (.hammer-overlay-c, KidsAid green card) so all screens
// celebrate the same way. Styles live in controller.css.
function hammerBidFontPx(amount: number): number {
  const len = (fmtKr(amount) || '').length + 3;
  if (len <= 8)  return 120;
  if (len <= 11) return 96;
  return 72;
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
  const dn = displayNumFor(lot.id);
  wrap.innerHTML = `
    <div class="scrim"></div>
    <div class="rays"></div>
    <div class="flash"></div>
    <div class="card">
      <div class="top"><span class="icon">🔨</span><span>Solgt</span></div>
      <div class="lot-line">${lot.title}${dn ? `<span class="lot-no">Lot ${dn}</span>` : ''}</div>
      <div class="bid" style="font-size:${hammerBidFontPx(finalPrice)}px">${fmtKr(finalPrice)}<span class="kr">kr</span></div>
    </div>
    ${particles}
  `;
  return wrap;
}
function clearHammerOverlays() {
  document.querySelectorAll<HTMLElement>('.hammer-overlay-c').forEach(el => {
    if (el.classList.contains('fading')) return;
    el.classList.add('fading');
    setTimeout(() => el.remove(), 340);
  });
  if (hammerTimer) { clearTimeout(hammerTimer); hammerTimer = 0; }
}
function fireHammerOverlay(lotNum: string, finalPrice: number) {
  clearHammerOverlays();
  const host = opLayout === 'konsol' ? nowCard : document.getElementById('lp-mini')!;
  host.appendChild(buildHammerOverlay(lotNum, finalPrice));
}
function maybeFireHammer(state: any) {
  for (const k of Object.keys(state.lots || {})) {
    const newStatus = state.lots[k].status;
    if (!firstStateMsg && newStatus === 'sold' && lastSoldStatus[k] !== 'sold') {
      soldOrder = soldOrder.filter(x => x !== k).concat([k]);
      const finalPrice = state.lots[k].finalPrice;
      if (finalPrice != null && k === currentLotNum) {
        fireHammerOverlay(k, finalPrice);
        toast('SOLGT — hammer-overlay sendt til alle skærme');
      }
    }
    if (!firstStateMsg && lastSoldStatus[k] === 'sold' && newStatus !== 'sold') {
      soldOrder = soldOrder.filter(x => x !== k);
      if (k === currentLotNum) clearHammerOverlays();
    }
    lastSoldStatus[k] = newStatus;
  }
  if (firstStateMsg) {
    // Seed chronological history in deck order on first connect.
    // ponytail: ægte kronologi kendes ikke efter reload — deck-rækkefølge er nok.
    soldOrder = LOTS.filter(l => state.lots?.[l.id]?.status === 'sold').map(l => l.id);
    for (const k of Object.keys(state.lots || {})) lastSoldStatus[k] = state.lots[k].status;
  }
  firstStateMsg = false;
}

// ---- History drawer + totals ----
function renderHistory(state: any) {
  const rows: string[] = [];
  let total = 0;
  for (const id of soldOrder) {
    const ls = state.lots?.[id];
    const lot = lotById(id);
    if (!lot || ls?.status !== 'sold' || typeof ls.finalPrice !== 'number') continue;
    total += ls.finalPrice;
    rows.push(`
      <li data-lot="${id}">
        <span class="h-num pp-mono">${displayNumFor(id)}</span>
        <span class="h-title">${lot.title}</span>
        <span class="h-amount pp-mono pp-tabular">${fmtKr(ls.finalPrice)} kr</span>
      </li>
    `);
  }
  historySoldListEl.innerHTML = rows.length ? rows.join('') : `<li class="h-empty">Ingen hammerslag endnu</li>`;
  historySoldListEl.querySelectorAll<HTMLElement>('li[data-lot]').forEach(li => {
    li.addEventListener('click', () => {
      const idx = SLIDES.findIndex(s => s.kind === 'lot' && s.lotId === li.dataset.lot);
      if (idx >= 0) nav(idx);
    });
  });
  historyFootAmountEl.textContent = fmtKr(total) + ' kr';
  histCountEl.textContent = String(rows.length);
}
function renderTotals(state: any) {
  let total = 0; let soldCount = 0;
  const lotIds = LOTS.map(l => l.id);
  for (const k of lotIds) {
    const ls = state.lots[k];
    if (ls?.status === 'sold' && typeof ls.finalPrice === 'number') {
      total += ls.finalPrice;
      soldCount += 1;
    }
  }
  ctlTotalEl.textContent = fmtKr(total) + ' kr';
  const pct = lotIds.length ? Math.round((soldCount / lotIds.length) * 100) : 0;
  progressFill.style.width = pct + '%';
  progressCounter.textContent = `${soldCount}/${lotIds.length} solgt`;
}

// ---- Main state update ----
function update(state: any) {
  lastState = state;
  currentIdx = state.slideIdx;
  const slide = SLIDES[currentIdx] ?? null;
  const nextSlide = SLIDES[currentIdx + 1] ?? null;

  if (currentIdx !== lastRenderedIdx || opLayout !== lastRenderedLayout) {
    lastRenderedIdx = currentIdx;
    lastRenderedLayout = opLayout;
    clearHammerOverlays();
    if (opLayout === 'konsol') {
      sizeCards();
      mountSlide(nowMount, slide);
      mountSlide(nextMount, nextSlide);
      renderAuctBg(slide);
    } else {
      mountSlide(lpMount, slide);
    }
  }
  // Eyebrows + hints
  if (slide) nowEyebrow.textContent = `PÅ SKÆRMEN NU — ${slideEyebrow(slide)}`;
  nextEyebrow.textContent = nextSlide ? `NÆSTE — ${slideEyebrow(nextSlide)}` : 'NÆSTE — SHOWET ER SLUT';
  const nextCue = nextSlide ? `${slideEyebrow(nextSlide)} · ${slideTitle(nextSlide)}`.slice(0, 44) : 'Showet er slut';
  goHint.textContent = nextCue;
  ctlCounter.textContent = `ITEM ${currentIdx + 1} / ${SLIDES.length}  ·  MELLEMRUM = GO`;
  if (slide) {
    lpNowLabel.textContent = `NU · ${slideEyebrow(slide)}`;
    lpTitle.textContent = slideTitle(slide);
    lpNext.textContent = `Næste: ${nextCue}`;
  }

  updateBidPanels(slide);
  updateSoldOverlays(slide);
  updateAuctMirror(slide);
  updateItemStates(state);
  renderTotals(state);
  maybeFireHammer(state);
  renderHistory(state);
  refreshDefaultSoundLabels();
  applySoundConfigToUI(currentLotNum);
}

sync.on((state) => {
  statusPill.textContent = `FORBUNDET · ${SLIDES.length} ITEMS`;
  update(state);
});
sync.onLotsUpdated(async () => {
  await refreshLotsFromServer();
  renderPresetChips();
  applyEventMeta();
  renderBonusPanel();
  loadTickerForm();
  syncThemeUI();
  buildItemList();
  buildTiles();
  lastRenderedIdx = -999;
  if (lastState) update(lastState);
});

// ---- Boot data refresh ----
refreshLotsFromServer().then(() => {
  renderPresetChips();
  applyEventMeta();
  renderBonusPanel();
  loadTickerForm();
  syncThemeUI();
  buildItemList();
  buildTiles();
  statusPill.textContent = `FORBUNDET · ${SLIDES.length} ITEMS`;
  if (lastState) { lastRenderedIdx = -999; update(lastState); }
}).catch(() => {});

// ---- Drawers ----
let drawerMode: 'settings' | 'history' | null = null;
function openDrawer(mode: 'settings' | 'history') {
  drawerMode = mode;
  drawerScrim.classList.add('open');
  drawerTitle.textContent = mode === 'history' ? 'Auktions-historik' : 'Indstillinger';
  drawerSettingsContent.style.display = mode === 'settings' ? '' : 'none';
  drawerHistoryContent.style.display = mode === 'history' ? '' : 'none';
}
function closeDrawer() {
  drawerMode = null;
  drawerScrim.classList.remove('open');
}
openSettingsBtn.addEventListener('click', () => drawerMode === 'settings' ? closeDrawer() : openDrawer('settings'));
openHistoryBtn.addEventListener('click', () => drawerMode === 'history' ? closeDrawer() : openDrawer('history'));
drawerClose.addEventListener('click', closeDrawer);
drawerScrim.addEventListener('click', (e) => { if (e.target === drawerScrim) closeDrawer(); });

resetAuctionsBtn.addEventListener('click', () => {
  if (!confirm('Nulstil ALLE auktioner? Alle bud, hammerslag og bonus-donationer slettes.')) return;
  sync.send({ type: 'reset-auctions' } as any);
});

// ---- TEMA · SLIDE-LOOK ----
const TH_SWATCHES: Record<string, string[]> = {
  numColor:    ['#1F4A28', '#3FA34D', '#8E6824', '#1A1815', '#24457A', '#3B6EA8'],
  accentColor: ['#B8893A', '#8E6824', '#3FA34D', '#5C544A', '#4A6FA5', '#24457A'],
  gradA:       ['#F4ECD8', '#F8F1DD', '#D9EDDD', '#E7DCBC', '#EDF2F8', '#FFFFFF'],
  gradB:       ['#EFE6CD', '#E7DCBC', '#C9BFA8', '#D9EDDD', '#D8E2EE', '#C9D6E6'],
};
const TH_ROWS: Record<string, HTMLElement> = {
  numColor: document.getElementById('th-num-row')!,
  accentColor: document.getElementById('th-acc-row')!,
  gradA: document.getElementById('th-grada-row')!,
  gradB: document.getElementById('th-gradb-row')!,
};
const thAngle = document.getElementById('th-angle') as HTMLInputElement;
const thAngleVal = document.getElementById('th-angle-val')!;
const thAngleRow = document.getElementById('th-angle-row')!;
const segThFont = document.getElementById('seg-thfont')!;
const segGradType = document.getElementById('seg-gradtype')!;
let themePutTimer = 0;
function theme(): Required<Omit<SlideTheme, 'customColors'>> & { customColors?: Record<string, string[]> } {
  return { ...resolvedSlideTheme(), customColors: EVENT_META.slideTheme?.customColors };
}
function setTheme(patch: Partial<SlideTheme>) {
  EVENT_META.slideTheme = { ...(EVENT_META.slideTheme || {}), ...patch };
  syncThemeUI();
  // Live re-render of every lot render on this screen.
  lastRenderedIdx = -999;
  if (lastState) update(lastState);
  clearTimeout(themePutTimer);
  themePutTimer = window.setTimeout(() => {
    fetch('/api/meta', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slideTheme: EVENT_META.slideTheme }),
    }).catch(() => {});
  }, 400);
}
function syncThemeUI() {
  const th = theme();
  for (const [key, row] of Object.entries(TH_ROWS)) {
    const cur = (th as any)[key];
    const custom = (th.customColors?.[key] || []).filter(c => !TH_SWATCHES[key].includes(c));
    const all = [...TH_SWATCHES[key], ...custom];
    row.innerHTML = all.map(c =>
      `<button type="button" class="pp-swatch${c === cur ? ' active' : ''}" data-key="${key}" data-val="${c}" title="${c}" style="background:${c}"></button>`
    ).join('') + `
      <label class="pp-swatch pp-swatch--custom" title="Vælg egen farve">+
        <input type="color" data-key="${key}" value="${cur}" />
      </label>`;
  }
  segThFont.querySelectorAll<HTMLButtonElement>('button[data-val]').forEach(b =>
    b.classList.toggle('active', b.dataset.val === th.font));
  segGradType.querySelectorAll<HTMLButtonElement>('button[data-val]').forEach(b =>
    b.classList.toggle('active', b.dataset.val === th.gradType));
  thAngleRow.style.display = th.gradType === 'linear' ? '' : 'none';
  thAngle.value = String(th.gradAngle);
  thAngleVal.textContent = `${th.gradAngle}°`;
}
for (const row of Object.values(TH_ROWS)) {
  row.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.pp-swatch[data-val]');
    if (!btn) return;
    setTheme({ [btn.dataset.key!]: btn.dataset.val } as any);
  });
  row.addEventListener('input', (e) => {
    const inp = (e.target as HTMLElement).closest<HTMLInputElement>('input[type="color"]');
    if (!inp) return;
    const key = inp.dataset.key!;
    const val = inp.value;
    const cc = { ...(EVENT_META.slideTheme?.customColors || {}) };
    cc[key] = (cc[key] || []).filter(c => c !== val).slice(-2).concat([val]);
    setTheme({ [key]: val, customColors: cc } as any);
  });
}
segThFont.querySelectorAll<HTMLButtonElement>('button[data-val]').forEach(b =>
  b.addEventListener('click', () => setTheme({ font: b.dataset.val as any })));
segGradType.querySelectorAll<HTMLButtonElement>('button[data-val]').forEach(b =>
  b.addEventListener('click', () => setTheme({ gradType: b.dataset.val as any })));
thAngle.addEventListener('input', () => {
  thAngleVal.textContent = `${thAngle.value}°`;
  setTheme({ gradAngle: parseInt(thAngle.value, 10) });
});
// Keep slideThemeGradient import warm for the settings preview swatch row.
void slideThemeGradient;

// ---- Event meta ----
const metaEventNameEl     = document.getElementById('meta-event-name')     as HTMLInputElement;
const metaEventSubtitleEl = document.getElementById('meta-event-subtitle') as HTMLInputElement;
const metaEventDateEl     = document.getElementById('meta-event-date')     as HTMLInputElement;
const metaEventSaveBtn    = document.getElementById('meta-event-save')     as HTMLButtonElement;
async function putMeta(partial: any): Promise<void> {
  try {
    await fetch('/api/meta', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
  } catch {}
}
function applyEventMeta() {
  if (metaEventNameEl && document.activeElement !== metaEventNameEl)
    metaEventNameEl.value = EVENT_META.eventName || '';
  if (metaEventSubtitleEl && document.activeElement !== metaEventSubtitleEl)
    metaEventSubtitleEl.value = EVENT_META.eventSubtitle || '';
  if (metaEventDateEl && document.activeElement !== metaEventDateEl)
    metaEventDateEl.value = EVENT_META.eventDate || '';
}
metaEventSaveBtn?.addEventListener('click', () => {
  putMeta({
    eventName:     metaEventNameEl.value.trim() || null,
    eventSubtitle: metaEventSubtitleEl.value.trim() || null,
    eventDate:     metaEventDateEl.value || null,
  });
  toast('Event-info gemt');
});

// ---- Bid presets ----
const bidPresetsInput = document.getElementById('bid-presets') as HTMLInputElement;
const bidPresetsSave  = document.getElementById('bid-presets-save') as HTMLButtonElement;
bidPresetsSave.addEventListener('click', async () => {
  const parsed = bidPresetsInput.value
    .split(/[,\s]+/)
    .map(s => parseInt(s.replace(/\./g, ''), 10))
    .filter(n => Number.isFinite(n) && n > 0);
  if (!parsed.length) { toast('Mindst ét tal kræves'); return; }
  bidPresetsSave.disabled = true;
  try {
    const res = await fetch('/api/meta', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bidPresets: parsed }),
    });
    if (!res.ok) throw new Error('save failed');
    toast('Præsets gemt');
  } catch {
    toast('Kunne ikke gemme præsets');
  } finally {
    bidPresetsSave.disabled = false;
  }
});

// ---- Bonus donation panel ----
const bonusTeamListEl = document.getElementById('bonus-team-list');
function renderBonusPanel() {
  if (!bonusTeamListEl) return;
  const teams = EVENT_META.teams || [];
  if (!teams.length) { bonusTeamListEl.innerHTML = '<p class="pp-note">Ingen hold konfigureret endnu.</p>'; return; }
  bonusTeamListEl.innerHTML = teams.map(t => {
    const bonus = t.bonusAmount || 0;
    return `
      <div class="ctl-bonus-row" data-id="${t.id}">
        <span class="bonus-name">${(t.name || t.id)}</span>
        <input type="number" class="pp-input pp-input--mono bonus-amount" min="0" step="500" placeholder="kr" />
        <button class="pp-btn bonus-add">+ Tilføj</button>
        <span class="bonus-total pp-hint">${bonus ? `bonus: ${fmtKr(bonus)} kr` : ''}</span>
        ${bonus ? `<button class="pp-btn pp-btn--ghost bonus-reset" title="Nulstil bonus til 0">Nulstil</button>` : ''}
      </div>
    `;
  }).join('');
  bonusTeamListEl.querySelectorAll<HTMLElement>('.ctl-bonus-row').forEach(row => {
    const id = row.dataset.id!;
    const inp = row.querySelector<HTMLInputElement>('.bonus-amount')!;
    const btn = row.querySelector<HTMLButtonElement>('.bonus-add')!;
    const reset = row.querySelector<HTMLButtonElement>('.bonus-reset');
    btn.addEventListener('click', async () => {
      const add = parseInt(inp.value, 10) || 0;
      if (!add) return;
      btn.disabled = true;
      try {
        await fetch(`/api/meta/teams/${encodeURIComponent(id)}/bonus`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ add }),
        });
        inp.value = '';
      } catch {}
      btn.disabled = false;
    });
    reset?.addEventListener('click', async () => {
      if (!confirm(`Nulstil bonus for ${id} til 0?`)) return;
      try {
        await fetch(`/api/meta/teams/${encodeURIComponent(id)}/bonus`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ set: 0 }),
        });
      } catch {}
    });
  });
}

// ---- Sponsor ticker editor ----
const tickerEnabledEl = document.getElementById('ticker-enabled') as HTMLInputElement;
const tickerPrefixEl  = document.getElementById('ticker-prefix')  as HTMLInputElement;
const tickerSponsorsEl = document.getElementById('ticker-sponsors') as HTMLTextAreaElement;
const tickerSpeedEl   = document.getElementById('ticker-speed')   as HTMLInputElement;
const tickerSaveBtn   = document.getElementById('ticker-save')    as HTMLButtonElement;
function loadTickerForm() {
  const t = EVENT_META.sponsorTicker || {};
  tickerEnabledEl.checked = !!t.enabled;
  tickerPrefixEl.value   = t.prefix ?? 'Vi takker vores dejlige sponsorer:';
  tickerSponsorsEl.value = (t.sponsors || []).join('\n');
  tickerSpeedEl.value    = String(t.speedSec ?? 60);
}
tickerSaveBtn.addEventListener('click', async () => {
  tickerSaveBtn.disabled = true;
  try {
    await fetch('/api/meta', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sponsorTicker: {
          enabled:  tickerEnabledEl.checked,
          prefix:   tickerPrefixEl.value,
          sponsors: tickerSponsorsEl.value.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean),
          speedSec: parseFloat(tickerSpeedEl.value) || 60,
        },
      }),
    });
    toast('Ticker gemt');
  } catch {}
  tickerSaveBtn.disabled = false;
});

// ---- Sound config (per-lot + defaults) ----
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

async function loadSoundFiles() {
  try {
    const res = await fetch('/api/sounds');
    const { files } = await res.json();
    for (const sel of [soundInitFileEl, soundHammerFileEl]) {
      const current = sel.value;
      sel.innerHTML = '<option value="">(ingen)</option>' +
        files.map((f: string) => `<option value="${f}">${f}</option>`).join('');
      if (files.includes(current)) sel.value = current;
    }
  } catch (e) { console.warn('failed loading sounds', e); }
}
soundRefreshBtn.addEventListener('click', loadSoundFiles);
loadSoundFiles();

function applySoundConfigToUI(lotNum: string | null) {
  soundLotNumEl.textContent = lotNum ? displayNumFor(lotNum) : '—';
  const cfg = (lotNum && lastState?.sounds?.[lotNum]) || {};
  if (document.activeElement !== soundInitFileEl) soundInitFileEl.value = cfg.initSound ?? '';
  if (document.activeElement !== soundHammerFileEl) soundHammerFileEl.value = cfg.hammerSound ?? '';
  const busy = (el: HTMLElement) => document.activeElement === el;
  const offset = cfg.initStartOffset ?? 0;
  if (!busy(soundInitKnobEl) && !busy(soundInitNumEl)) { soundInitKnobEl.value = String(offset); soundInitNumEl.value = String(offset); }
  const fadeIn = cfg.fadeInSec ?? 0;
  if (!busy(soundFadeInKnobEl) && !busy(soundFadeInNumEl)) { soundFadeInKnobEl.value = String(fadeIn); soundFadeInNumEl.value = String(fadeIn); }
  const fadeOut = cfg.fadeOutSec ?? 0;
  if (!busy(soundFadeOutKnobEl) && !busy(soundFadeOutNumEl)) { soundFadeOutKnobEl.value = String(fadeOut); soundFadeOutNumEl.value = String(fadeOut); }
  const initVol = Math.round((cfg.initVolume ?? 1) * 100);
  if (!busy(soundInitVolKnobEl) && !busy(soundInitVolNumEl)) { soundInitVolKnobEl.value = String(initVol); soundInitVolNumEl.value = String(initVol); }
  const hammerVol = Math.round((cfg.hammerVolume ?? 1) * 100);
  if (!busy(soundHammerVolKnobEl) && !busy(soundHammerVolNumEl)) { soundHammerVolKnobEl.value = String(hammerVol); soundHammerVolNumEl.value = String(hammerVol); }
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

async function uploadSound(file: File, which: 'init' | 'hammer', lotId: string | null) {
  const fd = new FormData();
  fd.append('kind', 'sound');
  fd.append('which', which);
  if (lotId) fd.append('lotId', lotId);
  fd.append('file', file);
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    await loadSoundFiles();
    if (lotId === currentLotNum && lotId) {
      if (which === 'init') { soundInitFileEl.value = data.filename; pushSoundConfig(); }
      else { soundHammerFileEl.value = data.filename; pushSoundConfig(); }
    }
    toast('Lyd uploadet');
  } catch (e) { console.warn('sound upload failed', e); }
}
const soundInitUploadEl   = document.getElementById('sound-init-upload')   as HTMLInputElement;
const soundHammerUploadEl = document.getElementById('sound-hammer-upload') as HTMLInputElement;
soundInitUploadEl.addEventListener('change', () => {
  if (soundInitUploadEl.files?.[0] && currentLotNum) uploadSound(soundInitUploadEl.files[0], 'init', currentLotNum);
  soundInitUploadEl.value = '';
});
soundHammerUploadEl.addEventListener('change', () => {
  if (soundHammerUploadEl.files?.[0] && currentLotNum) uploadSound(soundHammerUploadEl.files[0], 'hammer', currentLotNum);
  soundHammerUploadEl.value = '';
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
  defaultInitUploadEl.value = '';
});
defaultHammerUploadEl.addEventListener('change', () => {
  if (defaultHammerUploadEl.files?.[0]) uploadSound(defaultHammerUploadEl.files[0], 'hammer', null);
  defaultHammerUploadEl.value = '';
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

// ---- Sound countdown mirror ----
const ctrlSoundCountdownEl = document.getElementById('ctrl-sound-countdown')! as HTMLDivElement;
const ctrlSoundFileEl      = document.getElementById('ctrl-sound-file')!;
const ctrlSoundBarFillEl   = document.getElementById('ctrl-sound-bar-fill')! as HTMLDivElement;
const ctrlSoundRemainingEl = document.getElementById('ctrl-sound-remaining')!;
let ctrlCountdownRaf = 0;
let ctrlCountdownProbe: HTMLAudioElement | null = null;
function ctrlStopCountdown() {
  if (ctrlCountdownRaf) { cancelAnimationFrame(ctrlCountdownRaf); ctrlCountdownRaf = 0; }
  if (ctrlCountdownProbe) { try { ctrlCountdownProbe.pause(); } catch {} ctrlCountdownProbe = null; }
  ctrlSoundCountdownEl.classList.remove('open');
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

// ---- Open windows + QR ----
document.querySelectorAll<HTMLButtonElement>('#open-buttons button').forEach(btn => {
  btn.addEventListener('click', () => {
    const url = new URL(btn.dataset.open!, window.location.origin).toString();
    window.open(url, '_blank', 'noopener,noreferrer');
  });
});
document.querySelectorAll<HTMLButtonElement>('.share-bar').forEach(bar => {
  const path = bar.dataset.share!;
  const panel = document.getElementById(bar.dataset.target!)!;
  const canvas = panel.querySelector<HTMLCanvasElement>('.qr-canvas')!;
  const urlEl = panel.querySelector<HTMLDivElement>('.qr-url')!;
  const url = new URL(path, window.location.origin).toString();
  urlEl.textContent = url;
  QRCode.toCanvas(canvas, url, { width: 256, margin: 2, color: { dark: '#000', light: '#fff' } });
  bar.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('open');
  });
  panel.addEventListener('click', () => panel.classList.remove('open'));
});

// ---- Topbar tabs ----
document.getElementById('tab-generator')!.addEventListener('click', () => {
  window.location.href = '/generator.html';
});
document.getElementById('tab-output')!.addEventListener('click', () => {
  window.open('/', '_blank', 'noopener,noreferrer');
});
document.getElementById('tab-auctioneer')!.addEventListener('click', () => {
  window.open('/auctioneer.html', '_blank', 'noopener,noreferrer');
});

// ---- Clocks ----
const auctClockMirror = document.getElementById('auct-clock-mirror')!;
function tickClock() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const t = `${hh}:${mm}:${ss}`;
  ctlClockEl.textContent = t;
  auctClockMirror.textContent = t;
}
tickClock();
setInterval(tickClock, 1000);

// ---- Resize ----
window.addEventListener('resize', () => {
  if (opLayout === 'konsol') sizeCards();
  refitAll();
});

// ---- Boot ----
renderPresetChips();
buildItemList();
buildTiles();
syncThemeUI();
applyOpLayout();
sizeCards();
