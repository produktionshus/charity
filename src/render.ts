// Slide rendering with build-in animations (see handoff).
// Each animated element carries class="build-item" and an inline
// transition-delay derived from its build group + in-group index.

import { LOTS, SLIDES, lotById, displayNumFor, type Slide, type Lot } from './slides';
import { lotLayout, isMirrored, photoFocal, HORIZON_TITLE_SIZE_OVERRIDE } from './layout';

const SLIDE_W_IN = 13.333;
const SLIDE_H_IN = 7.5;
const GROUP_STAGGER = 200;
const INGROUP_STAGGER = 60;

function delay(group: number, index = 0): number {
  return group * GROUP_STAGGER + index * INGROUP_STAGGER;
}

// Hero transform: combine object-position (cover-fit pan) with a scale+translate
// transform so focal X/Y visibly moves the image even when its aspect matches
// the container. translate offsets are computed so the focal point stays at
// the center of the visible frame as scale grows.
// Hero as a background-image on a sized div. background-size + position
// give us reliable pan + zoom: at scale=1 the image cover-fits (no zoom),
// and at scale > 1 the image is sized larger than the container so
// background-position genuinely shifts the visible window.
function heroBgStyle(srcUrl: string, focal: string, scale: number): string {
  // background-size: cover keeps the source aspect; transform: scale zooms.
  // transform-origin at focal makes the zoom pivot around the focal point,
  // and background-position adds pan within any cover-fit slack at scale=1.
  return `background-image: url('${srcUrl}'); background-size: cover; background-position: ${focal}; background-repeat: no-repeat; transform-origin: ${focal}; transform: scale(${scale});`;
}

function titleHtml(lot: Lot): string {
  const parts = lot.titleParts && lot.titleParts.length
    ? lot.titleParts
    : [{ text: lot.title, bold: true } as { text: string; bold?: boolean; break?: boolean }];
  return parts.map(p => {
    const text = p.text.toUpperCase().replace(/\n/g, '<br />');
    const wrap = p.bold ? `<b>${text}</b>` : text;
    return p.break ? wrap + '<br />' : wrap;
  }).join('');
}

function titleSizePt(lot: Lot, layout: 'profile' | 'horizon'): number {
  const len = lot.title.length;
  if (layout === 'horizon') {
    const override = HORIZON_TITLE_SIZE_OVERRIDE[lot.id];
    if (override) return override;
    return len > 56 ? 18 : len > 42 ? 20 : 22;
  }
  return len > 56 ? 24 : len > 42 ? 26 : 28;
}

// ---- Horizon (Type A) builds ----
function renderHorizonLot(lot: Lot, displayNum: string): string {
  const twoCol = lot.bullets.length >= 5;
  const titleSize = titleSizePt(lot, 'horizon');
  const focal = lot.focal ?? photoFocal(lot.id);
  const scale = lot.heroScale ?? 1;
  const heroBg = heroBgStyle(`/assets/hero/lot-${lot.id}_FINAL.${lot.heroExt || 'jpg'}`, focal, scale);

  const bulletsInner = twoCol
    ? (() => {
        const half = Math.ceil(lot.bullets.length / 2);
        const left = lot.bullets.slice(0, half).map(b => `<li>${b}</li>`).join('');
        const right = lot.bullets.slice(half).map(b => `<li>${b}</li>`).join('');
        return `
          <div class="bullets-2col">
            <ul class="bullets build-item" style="transition-delay:${delay(4, 0)}ms">${left}</ul>
            <ul class="bullets build-item" style="transition-delay:${delay(4, 1)}ms">${right}</ul>
          </div>
        `;
      })()
    : `<ul class="bullets build-item" style="transition-delay:${delay(4, 0)}ms">${lot.bullets.map(b => `<li>${b}</li>`).join('')}</ul>`;

  return `
    <div class="hero-area">
      <div class="hero-img build-item" style="${heroBg} transition-delay:${delay(0, 0)}ms"></div>
      <div class="lot-num build-item" style="transition-delay:${delay(1, 0)}ms">${displayNum}</div>
    </div>
    <div class="caption-strip">
      <div class="caption-rule build-item" style="transition-delay:${delay(0, 1)}ms"></div>
      <h2 class="lot-title build-item" style="font-size:${titleSize}pt; transition-delay:${delay(2, 0)}ms">${titleHtml(lot)}</h2>
      <p class="lot-subtitle build-item" style="transition-delay:${delay(3, 0)}ms">${lot.subtitle}</p>
      ${bulletsInner}
      ${sponsorBlockHtml(lot, 5)}
    </div>
  `;
}

// ---- Profile / mirrored (Type B) builds ----
function renderProfileLot(lot: Lot, displayNum: string): string {
  const mirrored = lot.mirrored ?? isMirrored(lot.id);
  const titleSize = titleSizePt(lot, 'profile');
  const focal = lot.focal ?? photoFocal(lot.id);
  const scale = lot.heroScale ?? 1;
  const heroBg = heroBgStyle(`/assets/hero/lot-${lot.id}_FINAL.${lot.heroExt || 'jpg'}`, focal, scale);
  return `
    <div class="profile ${mirrored ? 'mirrored' : ''}">
      <div class="photo-side">
        <div class="hero-img build-item" style="${heroBg} transition-delay:${delay(0, 0)}ms"></div>
      </div>
      <div class="text-side">
        <div class="lot-num build-item" style="transition-delay:${delay(0, 1)}ms">${displayNum}</div>
        <h2 class="lot-title build-item" style="font-size:${titleSize}pt; transition-delay:${delay(1, 0)}ms">${titleHtml(lot)}</h2>
        <p class="lot-subtitle build-item" style="transition-delay:${delay(2, 0)}ms">${lot.subtitle}</p>
        <ul class="bullets build-item" style="transition-delay:${delay(3, 0)}ms">${lot.bullets.map(b => `<li>${b}</li>`).join('')}</ul>
        ${sponsorBlockHtml(lot, 4, true)}
      </div>
    </div>
  `;
}

function sponsorBlockHtml(lot: Lot, donorLabelGroup: number, _profile = false): string {
  const isPrivate = /^doneret/i.test(lot.sponsor);
  if (isPrivate) {
    return `<div class="sponsor-block sponsor-private build-item" style="transition-delay:${delay(donorLabelGroup, 0)}ms">Doneret af privat person</div>`;
  }
  if (lot.donorNames && lot.donorNames.length) {
    const names = lot.donorNames
      .map((n, i) => `<div class="donor-name build-item" style="transition-delay:${delay(donorLabelGroup + i, 0)}ms">${n.toUpperCase()}</div>`)
      .join('');
    return `
      <div class="sponsor-block sponsor-names">
        ${names}
      </div>
    `;
  }
  return `
    <div class="sponsor-block">
      <img class="sponsor-logo build-item" style="transition-delay:${delay(donorLabelGroup, 0)}ms" src="/assets/logo/logo-lot-${lot.id}.png" alt="${lot.sponsor}" />
    </div>
  `;
}

// ---- Sponsor index (slide 2) — custom staggers ----
// Animation order: title → outer grid frame → each lot cell sequentially.
// Solve for the (cols, rows) layout that best fits N sponsor cells into the
// available grid area. Optimises:
//   - minimal empty cells (cols*rows - N)
//   - cell aspect close to ~1.5:1
//   - cell size within sane bounds
// Returns inline CSS variables consumed by the .sponsor-cell rules.
function chooseSponsorLayout(n: number): { cols: number; rows: number; cw: number; ch: number } {
  // Inner grid area: slide width minus side-margin (0.5in × 2) minus padding
  // (0.22in × 2) and the matching vertical region between title + footer.
  const gridW = 13.333 - 1.0;          // slide width minus left/right padding
  // Cells-and-gaps budget inside the green frame.
  const gridH = 5.5;
  const gap = 0.22;            // must match the CSS gap on .sponsor-grid
  const TARGET_ASPECT = 1.5;
  let best = { cols: 7, rows: 3, cw: 1.5, ch: 1.4, score: -Infinity };
  for (let cols = 3; cols <= 10; cols++) {
    const rows = Math.ceil(n / cols);
    if (rows < 1 || rows > 6) continue;
    const cw = (gridW - (cols - 1) * gap) / cols;
    const ch = (gridH - (rows - 1) * gap) / rows;
    if (cw < 0.95 || ch < 0.70) continue;
    if (cw > 2.2 || ch > 1.9) continue;
    const aspect = cw / ch;
    const empties = cols * rows - n;
    // Score: fewer empties + closer to target aspect = better.
    const score = -empties * 3 - Math.abs(aspect - TARGET_ASPECT) * 4;
    if (score > best.score) best = { cols, rows, cw, ch, score };
  }
  return best;
}

function renderSponsorIndex(): string {
  const FRAME_DELAY = 300;
  const FIRST_CELL = 750;
  const CELL_STAGGER = 130;
  const L = chooseSponsorLayout(LOTS.length);
  const logoCap = Math.max(0.5, L.ch - 0.50);   // leave room for the lot-num + padding
  const numSize = L.cw < 1.25 ? 11 : L.cw < 1.4 ? 12 : 14;
  const cells = LOTS.map((l, i) => {
    const t = FIRST_CELL + i * CELL_STAGGER;
    const dn = displayNumFor(l.id);
    return `
      <div class="sponsor-cell build-item" data-lot="${l.id}" style="transition-delay:${t}ms">
        <div class="sponsor-cell-num">${dn}</div>
        <img class="sponsor-cell-logo" src="/assets/logo/logo-lot-${l.id}.png" alt="" />
      </div>
    `;
  }).join('');
  const gridStyle = `--cell-w:${L.cw.toFixed(3)}in;--cell-h:${L.ch.toFixed(3)}in;--cell-logo-cap:${logoCap.toFixed(3)}in;--cell-num-size:${numSize}pt; transition-delay:${FRAME_DELAY}ms`;
  return `
    <h1 class="closing-title build-item" style="transition-delay:0ms">AUKTIONENS SPONSORER</h1>
    <div class="closing-rule build-item" style="transition-delay:150ms"></div>
    <div class="sponsor-grid build-item" style="${gridStyle}">${cells}</div>
  `;
}

// ---- Closing (slide 24) — sponsor wall per handoff spec ----
// 8 columns x 5 rows = 40 cells, 2:1 aspect each.
function renderClosing(): string {
  const fileList = [
    'closing-L-01.png','closing-L-02.png','closing-L-03.png','closing-L-04.png',
    'closing-L-05.png','closing-L-06.png','closing-L-07.png','closing-R-01.png',
    'closing-L-09.png','closing-L-10.png','closing-L-11.png','closing-R-10.png',
    'closing-L-13.png','closing-M-01.png','closing-M-02.png','closing-M-03.png',
    'closing-M-04.png','closing-M-05.png','closing-M-06.png','closing-M-07.png',
    'closing-M-08.png','closing-M-09.png','closing-M-10.png','closing-M-11.png',
    'closing-M-12.png','closing-M-13.png','closing-M-14.png','closing-L-12.png',
    'closing-R-02.png','closing-R-03.png','closing-R-04.png','closing-R-05.png',
    'closing-R-06.png','closing-R-07.png','closing-R-08.png','closing-R-09.png',
    'closing-L-08.png','closing-R-11.png','closing-R-12.png','closing-R-13.png',
  ];
  const WORDMARKS = new Set([
    'closing-L-04.png','closing-L-05.png','closing-L-09.png','closing-L-10.png',
    'closing-L-12.png','closing-L-13.png','closing-M-02.png','closing-M-07.png',
    'closing-M-08.png','closing-M-09.png','closing-M-11.png','closing-M-12.png',
    'closing-M-14.png','closing-R-02.png','closing-R-05.png','closing-R-06.png',
    'closing-R-12.png',
  ]);
  const COLS = 8;
  const ROW_PAUSE = 250;
  const LOGO_STAGGER = 80;
  const rowsStart = 400;
  const cells = fileList.map((f, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const t = rowsStart + row * (ROW_PAUSE + COLS * LOGO_STAGGER) + col * LOGO_STAGGER;
    const kind = WORDMARKS.has(f) ? 'wordmark' : 'stacked';
    return `<div class="closing-cell closing-cell--${kind}"><img class="build-item" style="transition-delay:${t}ms" src="/assets/closing/${f}" alt="" /></div>`;
  }).join('');
  const rows = Math.ceil(fileList.length / COLS);
  const tailDelay = rowsStart + rows * (ROW_PAUSE + COLS * LOGO_STAGGER);
  return `
    <h1 class="closing-title build-item" style="transition-delay:0ms">TAK TIL ALLE VORES SPONSORER</h1>
    <div class="closing-rule build-item" style="transition-delay:100ms"></div>
    <div class="closing-grid">${cells}</div>
    <div class="closing-rule closing-bottom-rule build-item" style="transition-delay:${tailDelay}ms"></div>
    <div class="closing-tagline build-item" style="transition-delay:${tailDelay + 100}ms">@KIDSAIDDK · KIDSAID DANMARK</div>
  `;
}

// ---- Cover ----
function renderCover(): string {
  return `
    <div class="cover-content">
      <h1 class="cover-title build-item" style="transition-delay:${delay(0)}ms">AUKTION</h1>
      <div class="accent-line build-item" style="transition-delay:${delay(1)}ms"></div>
      <p class="cover-sub build-item" style="transition-delay:${delay(2)}ms">STJERNEGOLF 2026</p>
      <p class="cover-attr build-item" style="transition-delay:${delay(3)}ms">AUKTION VED KASPER NIELSEN</p>
      <img class="cover-artsolo build-item" style="transition-delay:${delay(4)}ms" src="/assets/artsolo-logo.png" alt="artsolo" />
    </div>
  `;
}

// Optional lot override lets the generator render edits live without
// roundtripping through lots.json / bundled imports.
export function renderSlide(slide: Slide, lotOverride?: Lot, displayNumOverride?: string): HTMLElement {
  const root = document.createElement('div');
  root.className = `slide-canvas slide-${slide.kind}`;
  if (slide.kind === 'cover') {
    root.innerHTML = renderCover();
  } else if (slide.kind === 'sponsor-index') {
    root.innerHTML = renderSponsorIndex();
  } else if (slide.kind === 'lot') {
    const lot = lotOverride ?? lotById(slide.lotId!);
    if (!lot) return root;
    const layout = lot.layout || lotLayout(lot.id);
    const displayNum = displayNumOverride ?? slide.displayNum ?? displayNumFor(slide.lotId!);
    root.classList.add(layout === 'horizon' ? 'layout-horizon' : 'layout-profile');
    const mirrored = lot.mirrored ?? isMirrored(lot.id);
    if (mirrored) root.classList.add('layout-mirrored');
    root.innerHTML = layout === 'horizon' ? renderHorizonLot(lot, displayNum) : renderProfileLot(lot, displayNum);
  } else if (slide.kind === 'closing') {
    root.innerHTML = renderClosing();
  }
  return root;
}

export function fitToViewport(stage: HTMLElement, slide: HTMLElement) {
  const aspect = SLIDE_W_IN / SLIDE_H_IN;
  const vw = stage.clientWidth;
  const vh = stage.clientHeight;
  const vAspect = vw / vh;
  const scale = vAspect > aspect
    ? vh / (SLIDE_H_IN * 96)
    : vw / (SLIDE_W_IN * 96);
  slide.style.transform = `translate(-50%, -50%) scale(${scale})`;
}
