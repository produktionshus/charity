// Slide rendering with build-in animations (see handoff).
// Each animated element carries class="build-item" and an inline
// transition-delay derived from its build group + in-group index.

import { LOTS, SLIDES, EVENT_META, DEFAULT_SLIDE_THEME, lotById, bordplanById, coverById, closingById, sponsorIndexById, wishLoopById, mediaById, auctionDisplayById, carouselById, contestById, displayNumFor, type Slide, type Lot, type CoverItem, type ClosingItem, type SponsorIndexItem, type WishLoopItem, type MediaItem, type AuctionDisplayItem, type CarouselItem, type ContestItem, type SlideTheme } from './slides';
import { lotLayout, isMirrored, photoFocal, HORIZON_TITLE_SIZE_OVERRIDE } from './layout';
import { renderBordplanSlide } from './render-bordplan';

const SLIDE_W_IN = 13.333;
const SLIDE_H_IN = 7.5;
const GROUP_STAGGER = 200;
const INGROUP_STAGGER = 60;

function delay(group: number, index = 0): number {
  return group * GROUP_STAGGER + index * INGROUP_STAGGER;
}

// ---- Slide theme (meta.slideTheme) ----
// Resolved theme + the CSS custom properties consumed by slides.css lot
// rules. Applied on every lot slide root so preview/konsol/launchpad/viewer
// all render identical pixels from the same data.
export function resolvedSlideTheme(override?: SlideTheme) {
  return { ...DEFAULT_SLIDE_THEME, ...(EVENT_META.slideTheme || {}), ...(override || {}) };
}
export function slideThemeFontStack(font: string | undefined): string {
  if (font === 'serif') return "Georgia, 'Iowan Old Style', 'Times New Roman', serif";
  if (font === 'system') return 'system-ui, -apple-system, sans-serif';
  return "'Plus Jakarta Sans', system-ui, sans-serif";
}
export function slideThemeGradient(th: ReturnType<typeof resolvedSlideTheme>): string {
  return th.gradType === 'radial'
    ? `radial-gradient(120% 110% at 50% 0%, ${th.gradA} 0%, ${th.gradB} 100%)`
    : `linear-gradient(${th.gradAngle}deg, ${th.gradA} 0%, ${th.gradB} 100%)`;
}
export function applySlideTheme(root: HTMLElement, override?: SlideTheme) {
  const th = resolvedSlideTheme(override);
  root.style.setProperty('--th-num', th.numColor);
  root.style.setProperty('--th-accent', th.accentColor);
  root.style.setProperty('--th-bg', slideThemeGradient(th));
  root.style.setProperty('--th-font', slideThemeFontStack(th.font));
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

// Resolve the ordered list of hero images for a lot: primary first, then any
// additional images. Single-image lots return a one-element list.
function collectHeroImages(lot: Lot): Array<{ url: string; focal: string; scale: number }> {
  const primary = {
    url: `/assets/hero/lot-${lot.id}_FINAL.${lot.heroExt || 'jpg'}`,
    focal: lot.focal ?? photoFocal(lot.id),
    scale: lot.heroScale ?? 1,
  };
  const extras = (lot.heroImages || []).map((im, i) => ({
    url: `/assets/hero/lot-${lot.id}_FINAL${i + 2}.${im.ext || 'jpg'}`,
    focal: im.focal ?? '50% 50%',
    scale: im.scale ?? 1,
  }));
  return [primary, ...extras];
}

// Build the hero markup for a lot. A flex container of panes (row for
// horizon, column for profile); each pane clips its own .hero-img and shows
// a hatched cream placeholder while the image loads / is missing. Panes are
// separated by a thin theme-gradient gap (v2 spec) instead of green rules.
function heroPanelsHtml(lot: Lot, direction: 'row' | 'column'): string {
  const imgs = collectHeroImages(lot);
  const weights = lot.heroSplit && lot.heroSplit.length === imgs.length
    ? lot.heroSplit
    : imgs.map(() => 1);
  const panels = imgs.map((im, i) => `
      <div class="lotv2-pane" data-pane="${i}" style="flex:${weights[i]} 1 0">
        <div class="hero-img build-item" style="${heroBgStyle(im.url, im.focal, im.scale)} transition-delay:${delay(0, i)}ms"></div>
      </div>`).join('');
  return `<div class="lotv2-hero lotv2-hero--${direction}">${panels}</div>`;
}

// Title segments: **bold** parts (titleParts.bold) render in the theme's
// num/accent color at weight 800. NBSP-protect spaces at segment boundaries
// so wrapping never eats the gap between a bold and regular run.
function titleSegsHtml(lot: Lot): string {
  const parts = lot.titleParts && lot.titleParts.length
    ? lot.titleParts
    : [{ text: lot.title, bold: true } as { text: string; bold?: boolean; break?: boolean }];
  return parts.map(p => {
    const text = p.text
      .replace(/^ /, ' ').replace(/ $/, ' ')
      .replace(/\n/g, '<br />');
    const span = p.bold ? `<span class="seg-bold">${text}</span>` : `<span>${text}</span>`;
    return p.break ? span + '<br />' : span;
  }).join('');
}

// Title size in canvas px (1280-wide canvas = 1920-spec px / 1.5).
// titleSizePt override maps like the prototype: pt × 1.9 in 1920-space.
function titleSizePx(lot: Lot, layout: 'profile' | 'horizon'): number {
  const override = lot.titleSizePt ?? HORIZON_TITLE_SIZE_OVERRIDE[lot.id];
  if (override) return (override * 1.9) / 1.5;
  return (layout === 'horizon' ? 52 : 46) / 1.5;
}

// Ordered sponsor-logo list. sponsorLogos (v2) wins when the field exists —
// an explicit empty list means "text fallback". Legacy lots resolve the old
// sponsorLogoSrc / default-path / extraSponsorLogos chain.
export function effectiveSponsorLogos(lot: Lot): string[] {
  if (lot.sponsorLogos) return lot.sponsorLogos;
  const isPrivate = /^doneret/i.test(lot.sponsor || '');
  const hasNames = !!(lot.donorNames && lot.donorNames.length);
  const out: string[] = [];
  if (lot.sponsorLogoSrc) out.push(lot.sponsorLogoSrc);
  else if (!hasNames && !isPrivate) out.push(`/assets/logo/logo-lot-${lot.id}.png`);
  out.push(...(lot.extraSponsorLogos || []));
  return out;
}

// Sponsor block (v2): "DONERET AF" eyebrow in the theme accent, then either
// the logo row (logos are primary, side by side) or the text fallback
// (donor names / sponsor string) when no logos are configured.
function sponsorBlockHtml(lot: Lot, group: number): string {
  const logos = effectiveSponsorLogos(lot);
  let inner: string;
  if (logos.length) {
    const w = ((logos.length > 1 ? 260 : 380) / 1.5).toFixed(1);
    // Legacy lots (no v2 sponsorLogos field) keep their interleaved text
    // names after the logos; v2 lots use names only as the no-logo fallback.
    const legacyNames = (!lot.sponsorLogos && lot.donorNames && lot.donorNames.length)
      ? lot.donorNames.map((n, i) =>
          `<span class="lotv2-sponsor-text lotv2-sponsor-text--inline build-item" style="transition-delay:${delay(group, logos.length + i + 1)}ms">${n}</span>`
        ).join('')
      : '';
    inner = `<div class="lotv2-logos">${logos.map((src, i) =>
      `<div class="lotv2-logo build-item" style="width:${w}px; background-image:url('${src}'); transition-delay:${delay(group, i + 1)}ms"></div>`
    ).join('')}${legacyNames}</div>`;
  } else {
    const isPrivate = /^doneret/i.test(lot.sponsor || '');
    const names = (lot.donorNames && lot.donorNames.length)
      ? lot.donorNames
      : [isPrivate ? (lot.sponsor.replace(/^doneret af\s*/i, '').trim() || 'Privat person') : (lot.sponsor || '')];
    inner = names.filter(Boolean).map((n, i) =>
      `<span class="lotv2-sponsor-text build-item" style="transition-delay:${delay(group, i + 1)}ms">${n}</span>`
    ).join('');
  }
  return `
    <div class="lotv2-sponsor">
      <span class="lotv2-donated build-item" style="transition-delay:${delay(group, 0)}ms">DONERET AF</span>
      ${inner}
    </div>
  `;
}

function bulletsHtml(lot: Lot): string {
  return lot.bullets.map(b =>
    `<div class="lotv2-bullet"><span class="lotv2-bullet-dot">·</span><span>${b}</span></div>`
  ).join('');
}

// ---- Horizon (Type A): hero across the top, caption row along the bottom ----
function renderHorizonLot(lot: Lot, displayNum: string): string {
  return `
    <div class="lotv2 lotv2--horizon">
      ${heroPanelsHtml(lot, 'row')}
      <div class="lotv2-caption">
        <div class="lotv2-num build-item" style="transition-delay:${delay(1, 0)}ms">${displayNum}</div>
        <div class="lotv2-body">
          <div class="lotv2-title build-item" style="font-size:${titleSizePx(lot, 'horizon').toFixed(2)}px; transition-delay:${delay(2, 0)}ms">${titleSegsHtml(lot)}</div>
          ${lot.subtitle ? `<div class="lotv2-subtitle build-item" style="transition-delay:${delay(3, 0)}ms">${lot.subtitle}</div>` : ''}
          <div class="lotv2-bullets build-item" style="transition-delay:${delay(4, 0)}ms">${bulletsHtml(lot)}</div>
        </div>
        ${sponsorBlockHtml(lot, 5)}
      </div>
    </div>
  `;
}

// ---- Profile (Type B): photo fills one side, caption column beside it ----
function renderProfileLot(lot: Lot, displayNum: string): string {
  const mirrored = lot.mirrored ?? isMirrored(lot.id);
  return `
    <div class="lotv2 lotv2--profile${mirrored ? ' lotv2--mirrored' : ''}">
      <div class="lotv2-photo">
        ${heroPanelsHtml(lot, 'column')}
      </div>
      <div class="lotv2-caption">
        <div class="lotv2-num build-item" style="transition-delay:${delay(0, 1)}ms">${displayNum}</div>
        <div class="lotv2-title build-item" style="font-size:${titleSizePx(lot, 'profile').toFixed(2)}px; transition-delay:${delay(1, 0)}ms">${titleSegsHtml(lot)}</div>
        ${lot.subtitle ? `<div class="lotv2-subtitle build-item" style="transition-delay:${delay(2, 0)}ms">${lot.subtitle}</div>` : ''}
        <div class="lotv2-bullets build-item" style="transition-delay:${delay(3, 0)}ms">${bulletsHtml(lot)}</div>
        ${sponsorBlockHtml(lot, 4)}
      </div>
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

export function renderSponsorIndex(item?: SponsorIndexItem): string {
  const FRAME_DELAY = 300;
  const FIRST_CELL = 750;
  const CELL_STAGGER = 130;
  const title = item?.title ?? 'AUKTIONENS SPONSORER';
  // Hide lots flagged as "extra" — they break the main numbering and
  // shouldn't appear in the sponsor index next to the canonical lots.
  const indexLots = LOTS.filter(l => !l.extra);
  const L = chooseSponsorLayout(indexLots.length);
  const logoCap = Math.max(0.5, L.ch - 0.50);   // leave room for the lot-num + padding
  const numSize = L.cw < 1.25 ? 11 : L.cw < 1.4 ? 12 : 14;
  const cells = indexLots.map((l, i) => {
    const t = FIRST_CELL + i * CELL_STAGGER;
    const dn = displayNumFor(l.id);
    // Mirror the lot slide's sponsor logic: the effective logo list is
    // primary; text-only donor names appear when the lot has no logos.
    const logos = effectiveSponsorLogos(l);
    const hasNames = !!(l.donorNames && l.donorNames.length);
    const items: string[] = [];
    for (const src of logos) {
      items.push(`<img class="sponsor-cell-logo" src="${src}" alt="" />`);
    }
    // Legacy lots (no v2 sponsorLogos field) interleave logos + names as
    // before; v2 lots treat names purely as the no-logo fallback.
    if (hasNames && (!l.sponsorLogos || !logos.length)) {
      for (const n of l.donorNames!) {
        items.push(`<span class="sponsor-cell-name">${n.toUpperCase()}</span>`);
      }
    }
    return `
      <div class="sponsor-cell build-item${items.length > 1 ? ' sponsor-cell--multi' : ''}" data-lot="${l.id}" style="transition-delay:${t}ms">
        <div class="sponsor-cell-num">${dn}</div>
        <div class="sponsor-cell-logos">${items.join('')}</div>
      </div>
    `;
  }).join('');
  const gridStyle = `--cell-w:${L.cw.toFixed(3)}in;--cell-h:${L.ch.toFixed(3)}in;--cell-logo-cap:${logoCap.toFixed(3)}in;--cell-num-size:${numSize}pt; transition-delay:${FRAME_DELAY}ms`;
  return `
    <h1 class="closing-title build-item" style="transition-delay:0ms">${title}</h1>
    <div class="closing-rule build-item" style="transition-delay:150ms"></div>
    <div class="sponsor-grid build-item" style="${gridStyle}">${cells}</div>
  `;
}

// ---- Closing (slide 24) — sponsor wall per handoff spec ----
// 8 columns x 5 rows = 40 cells, 2:1 aspect each.
const DEFAULT_CLOSING_LOGOS: ClosingItem['logos'] = [
  { file: 'closing-L-01.png' }, { file: 'closing-L-02.png' }, { file: 'closing-L-03.png' }, { file: 'closing-L-04.png', kind: 'wordmark' },
  { file: 'closing-L-05.png', kind: 'wordmark' }, { file: 'closing-L-06.png' }, { file: 'closing-L-07.png' }, { file: 'closing-R-01.png' },
  { file: 'closing-L-09.png', kind: 'wordmark' }, { file: 'closing-L-10.png', kind: 'wordmark' }, { file: 'closing-L-11.png' }, { file: 'closing-R-10.png' },
  { file: 'closing-L-13.png', kind: 'wordmark' }, { file: 'closing-M-01.png' }, { file: 'closing-M-02.png', kind: 'wordmark' }, { file: 'closing-M-03.png' },
  { file: 'closing-M-04.png' }, { file: 'closing-M-05.png' }, { file: 'closing-M-06.png' }, { file: 'closing-M-07.png', kind: 'wordmark' },
  { file: 'closing-M-08.png', kind: 'wordmark' }, { file: 'closing-M-09.png', kind: 'wordmark' }, { file: 'closing-M-10.png' }, { file: 'closing-M-11.png', kind: 'wordmark' },
  { file: 'closing-M-12.png', kind: 'wordmark' }, { file: 'closing-M-13.png' }, { file: 'closing-M-14.png' }, { file: 'closing-L-12.png', kind: 'wordmark' },
  { file: 'closing-R-02.png', kind: 'wordmark' }, { file: 'closing-R-03.png' }, { file: 'closing-R-04.png' }, { file: 'closing-R-05.png', kind: 'wordmark' },
  { file: 'closing-R-06.png', kind: 'wordmark' }, { file: 'closing-R-07.png' }, { file: 'closing-R-08.png' }, { file: 'closing-R-09.png' },
  { file: 'closing-L-08.png' }, { file: 'closing-R-11.png' }, { file: 'closing-R-12.png', kind: 'wordmark' }, { file: 'closing-R-13.png' },
];

export function renderClosing(item?: ClosingItem): string {
  const title    = item?.title    ?? 'TAK TIL ALLE VORES SPONSORER';
  const tagline  = item?.tagline  ?? '@KIDSAIDDK · KIDSAID DANMARK';
  const COLS     = item?.cols     ?? 8;
  const logos    = (item?.logos && item.logos.length) ? item.logos : DEFAULT_CLOSING_LOGOS;
  const ROW_PAUSE = 250;
  const LOGO_STAGGER = 80;
  const rowsStart = 400;
  const cells = logos.map((entry, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const t = rowsStart + row * (ROW_PAUSE + COLS * LOGO_STAGGER) + col * LOGO_STAGGER;
    const kind = entry.kind === 'wordmark' ? 'wordmark' : 'stacked';
    return `<div class="closing-cell closing-cell--${kind}"><img class="build-item" style="transition-delay:${t}ms" src="/assets/closing/${entry.file}" alt="" /></div>`;
  }).join('');
  const rows = Math.ceil(logos.length / COLS);
  const tailDelay = rowsStart + rows * (ROW_PAUSE + COLS * LOGO_STAGGER);
  return `
    <h1 class="closing-title build-item" style="transition-delay:0ms">${title}</h1>
    <div class="closing-rule build-item" style="transition-delay:100ms"></div>
    <div class="closing-grid" style="${(() => {
      // Compute cell size that keeps the whole grid + tagline inside the
      // 13.333×7.5in slide. Available area: ~12.5in wide × 5.6in tall.
      const numRows = Math.ceil(logos.length / COLS) || 1;
      const colGap = 0.07, rowGap = 0.10;
      const maxW = (12.5 - (COLS - 1) * colGap) / COLS;
      const maxH = (5.6  - (numRows - 1) * rowGap) / numRows;
      const aspect = 1.6;
      const baseColW = Math.min(1.5, maxW, maxH * aspect);
      const baseRowH = baseColW / aspect;
      // Flex layout (not grid) so the final partial row centers itself
      // instead of left-aligning. Each cell carries the computed width.
      return `--cell-w:${baseColW.toFixed(3)}in;--cell-h:${baseRowH.toFixed(3)}in`;
    })()}">${cells}</div>
    <div class="closing-rule closing-bottom-rule build-item" style="transition-delay:${tailDelay}ms"></div>
    <div class="closing-tagline build-item" style="transition-delay:${tailDelay + 100}ms">${tagline}</div>
  `;
}

// ---- Media (generic 16:9 image or video slide, fullscreen) ----
export function renderMedia(item?: MediaItem): string {
  if (!item || !item.src) {
    return `<div style="width:100%;height:100%;background:#000;color:#888;display:grid;place-items:center;font-family:'Plus Jakarta Sans',sans-serif">Media (no source)</div>`;
  }
  const bg = item.bgColor || '#000';
  const fit = item.fit === 'contain' ? 'contain' : 'cover';
  if (item.mode === 'video') {
    const wantsUnmuted = item.videoMuted === false;
    const loop = item.videoLoop === true;          // default 1-shot
    const autoplay = item.videoAutoplay !== false; // default true
    // Always start muted so the browser allows autoplay on screens without
    // user interaction (the viewer/projector screen). If the operator
    // wants sound, a click-to-unmute hint is shown until the page gets a
    // user gesture, then the video un-mutes automatically.
    return `<div style="width:100%;height:100%;background:${bg};position:relative;overflow:hidden">
      <video src="${item.src}" ${autoplay ? 'autoplay' : ''} muted ${loop ? 'loop' : ''} playsinline data-wants-unmuted="${wantsUnmuted ? '1' : '0'}" style="width:100%;height:100%;object-fit:${fit};display:block"></video>
    </div>`;
  }
  return `<div style="width:100%;height:100%;background:${bg};position:relative;overflow:hidden">
    <img src="${item.src}" alt="${(item.alt || '').replace(/"/g, '&quot;')}" style="width:100%;height:100%;object-fit:${fit};display:block" />
  </div>`;
}

// ---- Auction Display (4-team bar competition) ----
// Standalone iframe module mounted from /auction-display/. Initial config
// (teams + screen state) is encoded into the URL hash; live updates flow
// from parent → iframe via postMessage (handled by the host view).
export function renderAuctionDisplay(item?: AuctionDisplayItem): string {
  const teams = EVENT_META.teams || [];
  const state = {
    screen: item?.screen ?? 'intro',
    revealCount: item?.revealCount ?? 0,
    activeLot: item?.activeLot ?? 0,
    ranking: item?.ranking ?? false,
    namesVisible: item?.namesVisible ?? true,
    showBaseLabel: item?.showBaseLabel ?? true,
  };
  const cfg = { teams, state };
  const cfgEncoded = encodeURIComponent(JSON.stringify(cfg));
  let h = 0;
  for (let i = 0; i < cfgEncoded.length; i++) {
    h = ((h << 5) - h + cfgEncoded.charCodeAt(i)) | 0;
  }
  return `<iframe src="/auction-display/index.html?v=${(h >>> 0).toString(36)}#cfg=${cfgEncoded}" style="border:0;width:100%;height:100%;background:#3fa34d" title="Auktion"></iframe>`;
}

// Effective lot bindings for a team — supports both legacy single lotId
// and the new lotIds[] array.
export function teamLotIds(t: { lotId?: string; lotIds?: string[] }): string[] {
  const list: string[] = [];
  if (t.lotIds && t.lotIds.length) list.push(...t.lotIds);
  if (t.lotId && !list.includes(t.lotId)) list.push(t.lotId);
  return list.filter(Boolean);
}

// ---- Lot bar-overlay (compact 4-team strip when lot is bound to a team) ----
// Renders inline strip over the lot photo when the current lot.id matches
// one of the configured teams' lots. Active team is highlighted.
export function renderTeamBarOverlay(currentLotId: string): string {
  const teams = EVENT_META.teams || [];
  if (!teams.length) return '';
  const activeTeam = teams.find(t => teamLotIds(t).includes(currentLotId));
  if (!activeTeam) return '';
  const FALLBACK: Record<string, { base: string; live: string }> = {
    A: { base: '#1f6e34', live: '#3ed170' },
    B: { base: '#a06a14', live: '#f0b048' },
    C: { base: '#9a2b1f', live: '#e85a44' },
    D: { base: '#2a5a9e', live: '#6aa9e8' },
  };
  const maxTotal = Math.max(1, ...teams.map(t => (t.preAmount || 0)));
  const rows = teams.map(t => {
    const fb = FALLBACK[t.palette || t.id] || FALLBACK.A;
    const pal = { base: t.baseColor || fb.base, live: t.liveColor || fb.live };
    const isActive = t === activeTeam;
    const pre = t.preAmount || 0;
    const preW = (pre / maxTotal) * 100;
    return `
      <div class="tb-row${isActive ? ' tb-row--active' : ''}" data-team-id="${t.id}" data-lot-id="${t.lotId || ''}" style="--tb-base:${pal.base};--tb-live:${pal.live};">
        <span class="tb-name">${(t.name || '').toUpperCase()}</span>
        <div class="tb-bar">
          <div class="tb-pre" style="width:${preW}%"></div>
          <div class="tb-live" style="left:${preW}%;width:0%"></div>
          <div class="tb-dividers"></div>
        </div>
        <span class="tb-amount">kr ${pre.toLocaleString('da-DK').replace(/,/g, '.')}</span>
      </div>
    `;
  }).join('');
  return `<div class="team-bar-overlay" data-max="${maxTotal}">${rows}</div>`;
}

// ---- Wish Loop ----
// Embeds the standalone /wish-loop/ static module in an iframe. The host
// passes the item's config via the iframe src query string so the loop has
// data on first load; postMessage handles runtime tweaks if needed.
export function renderWishLoop(item?: WishLoopItem): string {
  if (!item) {
    return `<div style="background:#06100a;color:#F4ECD8;display:grid;place-items:center;width:100%;height:100%;font-family:'Plus Jakarta Sans',sans-serif">Wish Loop (no config)</div>`;
  }
  const cfg = {
    videoSrc: item.videoSrc || '',
    cards: item.cards || [],
    direction: item.direction,
    perCardSeconds: item.perCardSeconds,
    stackDepth: item.stackDepth,
    pauseOnHover: item.pauseOnHover,
    videoBlur: item.videoBlur,
    videoDarken: item.videoDarken,
    chrome: item.chrome,
    eyebrowPretitle: item.eyebrowPretitle,
    eyebrowTitle: item.eyebrowTitle,
    sponsorEnabled: item.sponsorEnabled,
    sponsorPretitle: item.sponsorPretitle,
    sponsorMode: item.sponsorMode,
    sponsorMark: item.sponsorMark,
    sponsorLogo: item.sponsorLogo,
  };
  const cfgEncoded = encodeURIComponent(JSON.stringify(cfg));
  // Hash the cfg so the iframe URL only changes when the config actually
  // changes. That prevents constant remounts (which restart the apple
  // preload + loop) when the surrounding state broadcasts come in.
  let h = 0;
  for (let i = 0; i < cfgEncoded.length; i++) {
    h = ((h << 5) - h + cfgEncoded.charCodeAt(i)) | 0;
  }
  return `<iframe src="/wish-loop/index.html?v=${(h >>> 0).toString(36)}#cfg=${cfgEncoded}" style="border:0;width:100%;height:100%;background:#06100a" allow="autoplay" title="Ønske-loop"></iframe>`;
}

// ---- Carousel (cross-fading fullscreen images) ----
// Pure-CSS loop: every image gets one shared-duration keyframe animation
// with a per-image delay, so variable hold times work without a JS timer
// (renderSlide output must stay inert HTML). Keyframes are generated per
// item since the fade fractions depend on the configured hold times.
let carouselSeq = 0;
export function renderCarousel(item?: CarouselItem): string {
  const imgs = (item?.images || []).filter(im => im && im.src);
  if (!imgs.length) {
    return `<div style="width:100%;height:100%;background:#000;color:#888;display:grid;place-items:center;font-family:'Plus Jakarta Sans',sans-serif">Billedkarrusel (ingen billeder)</div>`;
  }
  if (imgs.length === 1) {
    return `<div style="width:100%;height:100%;background:#000"><img src="${imgs[0].src}" alt="" style="width:100%;height:100%;object-fit:cover;display:block" /></div>`;
  }
  const fade = Math.max(0.2, (item?.fadeMs ?? 2000) / 1000);
  const holds = imgs.map(im => Math.max(1, im.seconds ?? item?.defaultSeconds ?? 10));
  const total = holds.reduce((a, b) => a + b, 0);
  const cls = `carfade-${++carouselSeq}`;
  let t = 0;
  const pct = (sec: number) => ((sec / total) * 100).toFixed(3);
  const frames: string[] = [];
  const layers = imgs.map((im, i) => {
    const start = t;                 // fade-in begins
    const visibleEnd = t + holds[i]; // fade-out completes at visibleEnd + fade
    t = visibleEnd;
    frames.push(`@keyframes ${cls}-${i} {
      0% { opacity: ${i === 0 ? 1 : 0}; }
      ${pct(start)}% { opacity: ${i === 0 ? 1 : 0}; }
      ${i === 0 ? '' : `${pct(Math.min(start + fade, total))}% { opacity: 1; }`}
      ${pct(visibleEnd)}% { opacity: 1; }
      ${pct(Math.min(visibleEnd + fade, total))}% { opacity: 0; }
      ${i === 0 ? `${pct(Math.max(total - fade, 0))}% { opacity: 0; } 100% { opacity: 1; }` : '100% { opacity: 0; }'}
    }`);
    return `<img src="${im.src}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;animation:${cls}-${i} ${total}s linear infinite" />`;
  }).join('');
  return `<style>${frames.join('\n')}</style><div style="position:absolute;inset:0;background:#000;overflow:hidden">${layers}</div>`;
}

// ---- Contest (1-4 blocks with image + heading + info lines) ----
export function renderContest(item?: ContestItem): string {
  const title = item?.title || 'KONKURRENCE';
  const blocks = (item?.blocks || []).slice(0, 4);
  const blocksHtml = blocks.map((b, i) => `
    <div class="contest-block build-item" style="transition-delay:${delay(2, i)}ms">
      <div class="contest-img" style="${b.src ? `background-image:url('${b.src}')` : ''}"></div>
      ${b.heading ? `<div class="contest-heading">${b.heading}</div>` : ''}
      ${(b.lines || []).map(l => `<div class="contest-line">${l}</div>`).join('')}
    </div>
  `).join('');
  return `
    <div class="contest-wrap">
      <h1 class="contest-title build-item" style="transition-delay:${delay(0)}ms">${title}</h1>
      ${item?.subtitle ? `<p class="contest-subtitle build-item" style="transition-delay:${delay(1)}ms">${item.subtitle}</p>` : ''}
      <div class="contest-blocks">${blocksHtml || '<div class="contest-empty">Ingen blokke endnu</div>'}</div>
    </div>
  `;
}

// ---- Cover ----
export function renderCover(item?: CoverItem): string {
  const title = item?.title ?? 'AUKTION';
  const sub   = item?.subtitle ?? 'STJERNEGOLF 2026';
  const attr  = item?.attribution ?? 'AUKTION VED KASPER NIELSEN';
  const logo  = item?.logoFile ?? 'artsolo-logo.png';
  return `
    <div class="cover-content">
      <h1 class="cover-title build-item" style="transition-delay:${delay(0)}ms">${title}</h1>
      <div class="accent-line build-item" style="transition-delay:${delay(1)}ms"></div>
      <p class="cover-sub build-item" style="transition-delay:${delay(2)}ms">${sub}</p>
      <p class="cover-attr build-item" style="transition-delay:${delay(3)}ms">${attr}</p>
      ${logo ? `<img class="cover-artsolo build-item" style="transition-delay:${delay(4)}ms" src="/assets/${logo}" alt="" />` : ''}
    </div>
  `;
}

// Optional lot override lets the generator render edits live without
// roundtripping through lots.json / bundled imports.
export function renderSlide(slide: Slide, lotOverride?: Lot, displayNumOverride?: string): HTMLElement {
  const root = document.createElement('div');
  root.className = `slide-canvas slide-${slide.kind}`;
  if (slide.kind === 'cover') {
    const item = slide.itemId ? coverById(slide.itemId) : undefined;
    root.innerHTML = renderCover(item);
  } else if (slide.kind === 'sponsor-index') {
    const item = slide.itemId ? sponsorIndexById(slide.itemId) : undefined;
    root.innerHTML = renderSponsorIndex(item);
  } else if (slide.kind === 'lot') {
    const lot = lotOverride ?? lotById(slide.lotId!);
    if (!lot) return root;
    const layout = lot.layout || lotLayout(lot.id);
    const displayNum = displayNumOverride ?? slide.displayNum ?? displayNumFor(slide.lotId!);
    root.classList.add(layout === 'horizon' ? 'layout-horizon' : 'layout-profile');
    const mirrored = lot.mirrored ?? isMirrored(lot.id);
    if (mirrored) root.classList.add('layout-mirrored');
    // Event slide theme — gradient bg, accents, font (meta.slideTheme).
    applySlideTheme(root);
    // Per-lot layout tweaks
    if (layout === 'horizon' && typeof lot.horizonCaptionIn === 'number') {
      root.style.setProperty('--horizon-caption-h', `${lot.horizonCaptionIn}in`);
    }
    if (layout === 'profile' && typeof lot.profilePhotoIn === 'number') {
      root.style.setProperty('--profile-photo-w', `${lot.profilePhotoIn}in`);
    }
    root.innerHTML = layout === 'horizon' ? renderHorizonLot(lot, displayNum) : renderProfileLot(lot, displayNum);
    // Hybrid overlay: if this lot is bound to a team, show the bar strip.
    const overlay = renderTeamBarOverlay(lot.id);
    if (overlay) root.insertAdjacentHTML('beforeend', overlay);
  } else if (slide.kind === 'closing') {
    const item = slide.itemId ? closingById(slide.itemId) : undefined;
    root.innerHTML = renderClosing(item);
  } else if (slide.kind === 'wish-loop') {
    const item = slide.itemId ? wishLoopById(slide.itemId) : undefined;
    root.innerHTML = renderWishLoop(item);
  } else if (slide.kind === 'media') {
    const item = slide.itemId ? mediaById(slide.itemId) : undefined;
    root.innerHTML = renderMedia(item);
  } else if (slide.kind === 'auction-display') {
    const item = slide.itemId ? auctionDisplayById(slide.itemId) : undefined;
    root.innerHTML = renderAuctionDisplay(item);
  } else if (slide.kind === 'carousel') {
    const item = slide.itemId ? carouselById(slide.itemId) : undefined;
    root.innerHTML = renderCarousel(item);
  } else if (slide.kind === 'contest') {
    const item = slide.itemId ? contestById(slide.itemId) : undefined;
    applySlideTheme(root);
    root.innerHTML = renderContest(item);
  } else if (slide.kind === 'bordplan') {
    const item = bordplanById(slide.itemId!);
    if (!item) return root;
    root.innerHTML = renderBordplanSlide(item.config, {
      eventName: item.eventName,
      org: item.org,
      overrides: item.overrides,
    });
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
