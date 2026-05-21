// Slide rendering — real templates per layout. Lot 25 (user-added video
// slide) is not modelled here; the web app starts from the 24-slide deck.

import { LOTS, SLIDES, lotByNum, type Slide } from './slides';
import { lotLayout, isMirrored, photoFocal, HORIZON_TITLE_SIZE_OVERRIDE } from './layout';

const SLIDE_W_IN = 13.333;
const SLIDE_H_IN = 7.5;

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

function bulletsHtml(lot: ReturnType<typeof lotByNum>, twoCol: boolean): string {
  if (!lot) return '';
  if (!twoCol) {
    return `<ul class="bullets">${lot.bullets.map(b => `<li>${b}</li>`).join('')}</ul>`;
  }
  const half = Math.ceil(lot.bullets.length / 2);
  const left = lot.bullets.slice(0, half);
  const right = lot.bullets.slice(half);
  return `
    <div class="bullets-2col">
      <ul class="bullets">${left.map(b => `<li>${b}</li>`).join('')}</ul>
      <ul class="bullets">${right.map(b => `<li>${b}</li>`).join('')}</ul>
    </div>
  `;
}

function sponsorBlockHtml(lot: ReturnType<typeof lotByNum>): string {
  if (!lot) return '';
  const isPrivate = /^doneret/i.test(lot.sponsor);
  if (isPrivate) {
    return `<div class="sponsor-block sponsor-private">Doneret af privat person</div>`;
  }
  if (lot.donorNames && lot.donorNames.length) {
    return `
      <div class="sponsor-block sponsor-names">
        <div class="doneret-af">DONERET AF</div>
        ${lot.donorNames.map(n => `<div class="donor-name">${n.toUpperCase()}</div>`).join('')}
      </div>
    `;
  }
  return `
    <div class="sponsor-block">
      <div class="doneret-af">DONERET AF</div>
      <img class="sponsor-logo" src="/assets/logo/logo-lot-${lot.num}.png" alt="${lot.sponsor}" />
    </div>
  `;
}

function renderHorizonLot(lot: ReturnType<typeof lotByNum>): string {
  if (!lot) return '';
  const twoCol = lot.bullets.length >= 5;
  const titleSize = titleSizePt(lot, 'horizon');
  const focal = photoFocal(lot.num);
  return `
    <div class="hero-area">
      <img class="hero-img" src="/assets/hero/lot-${lot.num}_FINAL.jpg" style="object-position: ${focal}" alt="" />
      <div class="lot-num">${lot.num}</div>
    </div>
    <div class="caption-strip">
      <div class="caption-rule"></div>
      <h2 class="lot-title" style="font-size:${titleSize}pt">${titleHtml(lot)}</h2>
      <p class="lot-subtitle">${lot.subtitle}</p>
      ${bulletsHtml(lot, twoCol)}
      ${sponsorBlockHtml(lot)}
    </div>
  `;
}

function renderProfileLot(lot: ReturnType<typeof lotByNum>): string {
  if (!lot) return '';
  const mirrored = isMirrored(lot.num);
  const titleSize = titleSizePt(lot, 'profile');
  const focal = photoFocal(lot.num);
  return `
    <div class="profile ${mirrored ? 'mirrored' : ''}">
      <div class="photo-side">
        <img class="hero-img" src="/assets/hero/lot-${lot.num}_FINAL.jpg" style="object-position: ${focal}" alt="" />
      </div>
      <div class="text-side">
        <div class="lot-num">${lot.num}</div>
        <h2 class="lot-title" style="font-size:${titleSize}pt">${titleHtml(lot)}</h2>
        <p class="lot-subtitle">${lot.subtitle}</p>
        <ul class="bullets">${lot.bullets.map(b => `<li>${b}</li>`).join('')}</ul>
        ${sponsorBlockHtml(lot)}
      </div>
    </div>
  `;
}

export function renderSlide(slide: Slide): HTMLElement {
  const root = document.createElement('div');
  root.className = `slide-canvas slide-${slide.kind}`;
  if (slide.kind === 'cover') {
    root.innerHTML = `
      <img src="/assets/logo/kidsaid.png" class="cover-kidsaid" alt="KidsAid" onerror="this.style.display='none'" />
      <div class="cover-content">
        <h1>AUKTION</h1>
        <div class="accent-line"></div>
        <p class="cover-sub">STJERNEGOLF 2026</p>
        <p class="cover-attr">AUKTION VED KASPER NIELSEN</p>
        <img src="/assets/artsolo-logo.png" class="cover-artsolo" alt="artsolo" />
      </div>
    `;
  } else if (slide.kind === 'sponsor-index') {
    const grid = LOTS.map(l => `
      <div class="sponsor-cell">
        <div class="sponsor-cell-num">${l.num}</div>
        <img class="sponsor-cell-logo" src="/assets/logo/logo-lot-${l.num}.png" alt="" />
      </div>
    `).join('');
    root.innerHTML = `
      <h1 class="closing-title">AUKTIONENS SPONSORER</h1>
      <div class="closing-rule"></div>
      <div class="sponsor-grid">${grid}</div>
    `;
  } else if (slide.kind === 'lot') {
    const lot = lotByNum(slide.lotNum!);
    root.classList.add(lotLayout(slide.lotNum!) === 'horizon' ? 'layout-horizon' : 'layout-profile');
    if (isMirrored(slide.lotNum!)) root.classList.add('layout-mirrored');
    root.innerHTML = lotLayout(slide.lotNum!) === 'horizon' ? renderHorizonLot(lot) : renderProfileLot(lot);
  } else if (slide.kind === 'closing') {
    root.innerHTML = `
      <h1 class="closing-title">TAK TIL ALLE VORES SPONSORER</h1>
      <div class="closing-rule"></div>
      <div class="closing-grid">
        <!-- TODO populate at render-time by listing /assets/closing/*.png -->
      </div>
    `;
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
