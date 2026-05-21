// Slide rendering with build-in animations (see handoff).
// Each animated element carries class="build-item" and an inline
// transition-delay derived from its build group + in-group index.

import { LOTS, SLIDES, lotByNum, type Slide } from './slides';
import { lotLayout, isMirrored, photoFocal, HORIZON_TITLE_SIZE_OVERRIDE } from './layout';

const SLIDE_W_IN = 13.333;
const SLIDE_H_IN = 7.5;
const GROUP_STAGGER = 200;
const INGROUP_STAGGER = 60;

function delay(group: number, index = 0): number {
  return group * GROUP_STAGGER + index * INGROUP_STAGGER;
}

function titleHtml(lot: ReturnType<typeof lotByNum>): string {
  if (!lot) return '';
  const parts = lot.titleParts && lot.titleParts.length
    ? lot.titleParts
    : [{ text: lot.title, bold: true } as { text: string; bold?: boolean; break?: boolean }];
  return parts.map(p => {
    const text = p.text.toUpperCase().replace(/\n/g, '<br />');
    const wrap = p.bold ? `<b>${text}</b>` : text;
    return p.break ? wrap + '<br />' : wrap;
  }).join('');
}

function titleSizePt(lot: ReturnType<typeof lotByNum>, layout: 'profile' | 'horizon'): number {
  const len = lot?.title.length ?? 0;
  if (layout === 'horizon') {
    if (HORIZON_TITLE_SIZE_OVERRIDE[lot!.num]) return HORIZON_TITLE_SIZE_OVERRIDE[lot!.num];
    return len > 56 ? 18 : len > 42 ? 20 : 22;
  }
  return len > 56 ? 24 : len > 42 ? 26 : 28;
}

// ---- Horizon (Type A) builds ----
function renderHorizonLot(lot: ReturnType<typeof lotByNum>): string {
  if (!lot) return '';
  const twoCol = lot.bullets.length >= 5;
  const titleSize = titleSizePt(lot, 'horizon');
  const focal = photoFocal(lot.num);

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
      <img class="hero-img build-item" style="object-position:${focal}; transition-delay:${delay(0, 0)}ms" src="/assets/hero/lot-${lot.num}_FINAL.jpg" alt="" />
      <div class="lot-num build-item" style="transition-delay:${delay(1, 0)}ms">${lot.num}</div>
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
function renderProfileLot(lot: ReturnType<typeof lotByNum>): string {
  if (!lot) return '';
  const mirrored = isMirrored(lot.num);
  const titleSize = titleSizePt(lot, 'profile');
  const focal = photoFocal(lot.num);
  return `
    <div class="profile ${mirrored ? 'mirrored' : ''}">
      <div class="photo-side">
        <img class="hero-img build-item" style="object-position:${focal}; transition-delay:${delay(0, 0)}ms" src="/assets/hero/lot-${lot.num}_FINAL.jpg" alt="" />
      </div>
      <div class="text-side">
        <div class="lot-num build-item" style="transition-delay:${delay(0, 1)}ms">${lot.num}</div>
        <h2 class="lot-title build-item" style="font-size:${titleSize}pt; transition-delay:${delay(1, 0)}ms">${titleHtml(lot)}</h2>
        <p class="lot-subtitle build-item" style="transition-delay:${delay(2, 0)}ms">${lot.subtitle}</p>
        <ul class="bullets build-item" style="transition-delay:${delay(3, 0)}ms">${lot.bullets.map(b => `<li>${b}</li>`).join('')}</ul>
        ${sponsorBlockHtml(lot, 4, true)}
      </div>
    </div>
  `;
}

function sponsorBlockHtml(lot: ReturnType<typeof lotByNum>, donorLabelGroup: number, _profile = false): string {
  if (!lot) return '';
  const isPrivate = /^doneret/i.test(lot.sponsor);
  if (isPrivate) {
    return `<div class="sponsor-block sponsor-private build-item" style="transition-delay:${delay(donorLabelGroup, 0)}ms">Doneret af privat person</div>`;
  }
  if (lot.donorNames && lot.donorNames.length) {
    const names = lot.donorNames
      .map((n, i) => `<div class="donor-name build-item" style="transition-delay:${delay(donorLabelGroup + 1 + i, 0)}ms">${n.toUpperCase()}</div>`)
      .join('');
    return `
      <div class="sponsor-block sponsor-names">
        <div class="doneret-af build-item" style="transition-delay:${delay(donorLabelGroup, 0)}ms">DONERET AF</div>
        ${names}
      </div>
    `;
  }
  return `
    <div class="sponsor-block">
      <div class="doneret-af build-item" style="transition-delay:${delay(donorLabelGroup, 0)}ms">DONERET AF</div>
      <img class="sponsor-logo build-item" style="transition-delay:${delay(donorLabelGroup + 1, 0)}ms" src="/assets/logo/logo-lot-${lot.num}.png" alt="${lot.sponsor}" />
    </div>
  `;
}

// ---- Sponsor index (slide 2) — custom staggers ----
function renderSponsorIndex(): string {
  const COLS = 7;
  const ROW_PAUSE = 250;
  const CELL_STAGGER = 100;
  const LOGO_OFFSET = 60;
  const rowsStart = 400;
  const cells = LOTS.map((l, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const cellStart = rowsStart + row * (ROW_PAUSE + COLS * CELL_STAGGER) + col * CELL_STAGGER;
    return `
      <div class="sponsor-cell">
        <div class="sponsor-cell-num build-item" style="transition-delay:${cellStart}ms">${l.num}</div>
        <img class="sponsor-cell-logo build-item" style="transition-delay:${cellStart + LOGO_OFFSET}ms" src="/assets/logo/logo-lot-${l.num}.png" alt="" />
      </div>
    `;
  }).join('');
  return `
    <h1 class="closing-title build-item" style="transition-delay:0ms">AUKTIONENS SPONSORER</h1>
    <div class="closing-rule build-item" style="transition-delay:100ms"></div>
    <div class="sponsor-grid">${cells}</div>
  `;
}

// ---- Closing (slide 24) — custom staggers ----
function renderClosing(): string {
  const fileList = [
    'closing-L-01.png','closing-L-02.png','closing-L-03.png','closing-L-04.png',
    'closing-L-05.png','closing-L-06.png','closing-L-07.png','closing-L-08.png',
    'closing-L-09.png','closing-L-10.png','closing-L-11.png','closing-L-12.png',
    'closing-L-13.png',
    'closing-M-01.png','closing-M-02.png','closing-M-03.png','closing-M-04.png',
    'closing-M-05.png','closing-M-06.png','closing-M-07.png','closing-M-08.png',
    'closing-M-09.png','closing-M-10.png','closing-M-11.png','closing-M-12.png',
    'closing-M-13.png','closing-M-14.png',
    'closing-R-01.png','closing-R-02.png','closing-R-03.png','closing-R-04.png',
    'closing-R-05.png','closing-R-06.png','closing-R-07.png','closing-R-08.png',
    'closing-R-09.png','closing-R-10.png','closing-R-11.png','closing-R-12.png',
    'closing-R-13.png',
  ];
  const COLS = 8;
  const ROW_PAUSE = 250;
  const LOGO_STAGGER = 80;
  const rowsStart = 400;
  const cells = fileList.map((f, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const t = rowsStart + row * (ROW_PAUSE + COLS * LOGO_STAGGER) + col * LOGO_STAGGER;
    return `<div class="closing-cell"><img class="build-item" style="transition-delay:${t}ms" src="/assets/closing/${f}" alt="" /></div>`;
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

export function renderSlide(slide: Slide): HTMLElement {
  const root = document.createElement('div');
  root.className = `slide-canvas slide-${slide.kind}`;
  if (slide.kind === 'cover') {
    root.innerHTML = renderCover();
  } else if (slide.kind === 'sponsor-index') {
    root.innerHTML = renderSponsorIndex();
  } else if (slide.kind === 'lot') {
    const lot = lotByNum(slide.lotNum!);
    const layout = lotLayout(slide.lotNum!);
    root.classList.add(layout === 'horizon' ? 'layout-horizon' : 'layout-profile');
    if (isMirrored(slide.lotNum!)) root.classList.add('layout-mirrored');
    root.innerHTML = layout === 'horizon' ? renderHorizonLot(lot) : renderProfileLot(lot);
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
