// Lot Generator — operator UI for editing the lot bank live.
// Reads + writes through /api/lots; broadcasts ws 'lots-updated' so the
// viewer / auctioneer / controller refresh themselves on save.

import { renderSlide, renderCover, renderClosing, renderSponsorIndex, renderWishLoop, renderMedia, renderAuctionDisplay, renderContest, renderCarousel, fitToViewport } from './render';
import { EVENT_META } from './slides';
import type { Lot, BordplanItem, CoverItem, ClosingItem, SponsorIndexItem, WishLoopItem, MediaItem, AuctionDisplayItem, ContestItem, ContestBlock, AuctionTeam, AuctionDisplayState, DeckItem } from './slides';
import { renderBordplanSlide } from './render-bordplan';
import type { FloorPlanConfig } from './bordplan-engine';

// Mirror controller's saved theme for visual consistency.
const savedTheme = localStorage.getItem('controller.theme') || 'forest';
document.body.classList.add(`theme-${savedTheme}`);

// ---- DOM ----
const statusEl   = document.getElementById('gen-status')!;
const listMeta   = document.getElementById('gen-list-meta')!;
const listRows   = document.getElementById('gen-list-rows')!;
const newLotBtn  = document.getElementById('new-lot')!;
const openCtrlBtn = document.getElementById('open-controller')!;
const editIdEl   = document.getElementById('edit-id')!;
const editDisplayNumEl = document.getElementById('edit-display-num')!;
const deleteBtn  = document.getElementById('delete-lot') as HTMLButtonElement;
const duplicateBtn = document.getElementById('duplicate-lot') as HTMLButtonElement;
const resetFocalBtn = document.getElementById('reset-focal') as HTMLButtonElement;
const saveBtn    = document.getElementById('save-lot')!;
const saveMeta   = document.getElementById('gen-save-meta')!;
const previewFrame = document.getElementById('gen-preview-frame')!;
const previewMeta  = document.getElementById('preview-meta')!;

const fActive    = document.getElementById('f-active')   as HTMLInputElement;
const fExtra     = document.getElementById('f-extra')    as HTMLInputElement;
const rowExtraSuffix = document.getElementById('row-extra-suffix')!;
const fExtraSuffix = document.getElementById('f-extra-suffix') as HTMLInputElement;
const fTitle     = document.getElementById('f-title')    as HTMLTextAreaElement;
const fSubtitle  = document.getElementById('f-subtitle') as HTMLInputElement;
const fSponsor   = document.getElementById('f-sponsor')  as HTMLInputElement;
const fBullets   = document.getElementById('f-bullets')  as HTMLTextAreaElement;
const fDonorNames = document.getElementById('f-donor-names') as HTMLTextAreaElement;
const fLayout    = document.getElementById('f-layout')   as HTMLSelectElement;
const fMirrored  = document.getElementById('f-mirrored') as HTMLInputElement;
const fFocalX    = document.getElementById('f-focal-x')  as HTMLInputElement;
const fFocalY    = document.getElementById('f-focal-y')  as HTMLInputElement;
const fFocalXVal = document.getElementById('f-focal-x-val')!;
const fFocalYVal = document.getElementById('f-focal-y-val')!;
const fScale     = document.getElementById('f-scale')      as HTMLInputElement;
const fScaleVal  = document.getElementById('f-scale-val')!;
const fTitleSize = document.getElementById('f-title-size') as HTMLInputElement;
const fHorizonCap    = document.getElementById('f-horizon-caption')     as HTMLInputElement;
const fHorizonCapVal = document.getElementById('f-horizon-caption-val')!;
const fProfilePhoto  = document.getElementById('f-profile-photo')       as HTMLInputElement;
const fProfilePhotoVal = document.getElementById('f-profile-photo-val')!;
const rowHorizonCap = document.getElementById('row-horizon-caption')!;
const rowProfilePhoto = document.getElementById('row-profile-photo')!;
const fHero      = document.getElementById('f-hero')     as HTMLInputElement;
const fLogo      = document.getElementById('f-logo')     as HTMLInputElement;
const fExtraLogoUploadEl = document.getElementById('f-extra-logo-upload') as HTMLInputElement;
const extraLogoListEl    = document.getElementById('extra-logo-list')!;
const fSponsorStack      = document.getElementById('f-sponsor-stack') as HTMLSelectElement;
const heroPreview = document.getElementById('hero-preview') as HTMLImageElement;
const logoPreview = document.getElementById('logo-preview') as HTMLImageElement;

// ---- Multi-image hero controls (up to 3) ----
// Index 0 reuses the primary-image element refs above; 2 & 3 are looked up
// fresh. Driving them through one array lets populate/read/wire loop uniformly.
const fImgCount = document.getElementById('f-img-count') as HTMLSelectElement;
const fImgCountHint = document.getElementById('f-img-count-hint')!;
interface HeroCtl {
  block: HTMLElement;
  upload: HTMLInputElement; preview: HTMLImageElement;
  fx: HTMLInputElement; fxVal: HTMLElement;
  fy: HTMLInputElement; fyVal: HTMLElement;
  scale: HTMLInputElement; scaleVal: HTMLElement;
  split: HTMLInputElement; splitVal: HTMLElement; splitRow: HTMLElement;
}
function heroCtlN(n: number): HeroCtl {
  const s = `-${n}`;
  const split = document.getElementById(`f-split-${n}`) as HTMLInputElement;
  return {
    block: document.getElementById(`hero-img-${n}`)!,
    upload: document.getElementById(`f-hero${s}`) as HTMLInputElement,
    preview: document.getElementById(`hero-preview${s}`) as HTMLImageElement,
    fx: document.getElementById(`f-focal-x${s}`) as HTMLInputElement,
    fxVal: document.getElementById(`f-focal-x${s}-val`)!,
    fy: document.getElementById(`f-focal-y${s}`) as HTMLInputElement,
    fyVal: document.getElementById(`f-focal-y${s}-val`)!,
    scale: document.getElementById(`f-scale${s}`) as HTMLInputElement,
    scaleVal: document.getElementById(`f-scale${s}-val`)!,
    split, splitVal: document.getElementById(`f-split-${n}-val`)!,
    splitRow: split.closest('.hero-split-row') as HTMLElement,
  };
}
const split1 = document.getElementById('f-split-1') as HTMLInputElement;
const heroCtls: HeroCtl[] = [
  {
    block: document.getElementById('hero-img-1')!,
    upload: fHero, preview: heroPreview,
    fx: fFocalX, fxVal: fFocalXVal, fy: fFocalY, fyVal: fFocalYVal,
    scale: fScale, scaleVal: fScaleVal,
    split: split1, splitVal: document.getElementById('f-split-1-val')!,
    splitRow: split1.closest('.hero-split-row') as HTMLElement,
  },
  heroCtlN(2), heroCtlN(3),
];
function applyImgCount(n: number) {
  heroCtls.forEach((c, i) => {
    const visible = i < n;
    c.block.style.display = visible ? '' : 'none';
    c.splitRow.style.display = (visible && n > 1) ? '' : 'none';
  });
  fImgCountHint.textContent = n > 1
    ? (fLayout.value === 'horizon' ? 'side-om-side' : 'stablet')
    : '';
}

// ---- State ----
// itemsBank holds the full deck: lots + bordplan items (potentially other
// types later). Keep lotsBank alias for the existing UI code paths.
let itemsBank: DeckItem[] = [];
let lotsBank: Lot[] = [];     // filtered alias = items where kind!=='bordplan'
let selectedId: string | null = sessionStorage.getItem('gen.selectedId');
let dirty = false;

function itemKind(item: DeckItem | undefined): 'lot' | 'bordplan' | 'cover' | 'closing' | 'sponsor-index' | 'wish-loop' | 'media' | 'auction-display' | 'contest' | 'carousel' {
  if (item && (item as any).kind === 'bordplan') return 'bordplan';
  if (item && (item as any).kind === 'cover') return 'cover';
  if (item && (item as any).kind === 'closing') return 'closing';
  if (item && (item as any).kind === 'sponsor-index') return 'sponsor-index';
  if (item && (item as any).kind === 'wish-loop') return 'wish-loop';
  if (item && (item as any).kind === 'media') return 'media';
  if (item && (item as any).kind === 'auction-display') return 'auction-display';
  if (item && (item as any).kind === 'contest') return 'contest';
  if (item && (item as any).kind === 'carousel') return 'carousel';
  return 'lot';
}
function isBordplanItem(item: DeckItem | undefined): item is BordplanItem {
  return !!item && (item as any).kind === 'bordplan';
}
function isCoverItem(item: DeckItem | undefined): item is CoverItem {
  return !!item && (item as any).kind === 'cover';
}
function isClosingItem(item: DeckItem | undefined): item is ClosingItem {
  return !!item && (item as any).kind === 'closing';
}
function isSponsorIndexItem(item: DeckItem | undefined): item is SponsorIndexItem {
  return !!item && (item as any).kind === 'sponsor-index';
}
function isWishLoopItem(item: DeckItem | undefined): item is WishLoopItem {
  return !!item && (item as any).kind === 'wish-loop';
}
function isMediaItem(item: DeckItem | undefined): item is MediaItem {
  return !!item && (item as any).kind === 'media';
}
function isAuctionDisplayItem(item: DeckItem | undefined): item is AuctionDisplayItem {
  return !!item && (item as any).kind === 'auction-display';
}
function isContestItem(item: DeckItem | undefined): item is ContestItem {
  return !!item && (item as any).kind === 'contest';
}

// ---- Bordplan form DOM ----
const formLot = document.getElementById('gen-form')!;
const formBordplan = document.getElementById('gen-form-bordplan')!;
const formCover = document.getElementById('gen-form-cover')!;
const formClosing = document.getElementById('gen-form-closing')!;
const clActiveEl    = document.getElementById('cl-active')   as HTMLInputElement;
const clLabelEl     = document.getElementById('cl-label')    as HTMLInputElement;
const clTitleEl     = document.getElementById('cl-title')    as HTMLInputElement;
const clTaglineEl   = document.getElementById('cl-tagline')  as HTMLInputElement;
const clColsEl      = document.getElementById('cl-cols')     as HTMLInputElement;
const clLogoListEl  = document.getElementById('cl-logo-list')!;
const clLogoUploadEl = document.getElementById('cl-logo-upload') as HTMLInputElement;
const clSaveBtn     = document.getElementById('cl-save')!;
let clLogos: ClosingItem['logos'] = [];

const formWishLoop = document.getElementById('gen-form-wishloop')!;
const wlActiveEl     = document.getElementById('wl-active')      as HTMLInputElement;
const wlLabelEl      = document.getElementById('wl-label')       as HTMLInputElement;
const wlSponsorEl    = document.getElementById('wl-sponsor')     as HTMLInputElement;
const wlEyebrowPreEl    = document.getElementById('wl-eyebrow-pre')    as HTMLInputElement;
const wlEyebrowTitleEl  = document.getElementById('wl-eyebrow-title')  as HTMLInputElement;
const wlSponsorEnabledEl = document.getElementById('wl-sponsor-enabled') as HTMLInputElement;
const wlSponsorPreEl    = document.getElementById('wl-sponsor-pre')    as HTMLInputElement;
const wlSponsorModeEl   = document.getElementById('wl-sponsor-mode')   as HTMLSelectElement;
const wlSponsorLogoEl   = document.getElementById('wl-sponsor-logo')   as HTMLInputElement;
const wlSponsorLogoUploadEl = document.getElementById('wl-sponsor-logo-upload') as HTMLInputElement;
const wlVideoSrcEl   = document.getElementById('wl-video-src')   as HTMLInputElement;
const wlVideoUploadEl = document.getElementById('wl-video-upload') as HTMLInputElement;
const wlDirectionEl  = document.getElementById('wl-direction')   as HTMLSelectElement;
const wlStackDepthEl = document.getElementById('wl-stack-depth') as HTMLInputElement;
const wlPerCardEl    = document.getElementById('wl-per-card')    as HTMLInputElement;
const wlPerCardValEl = document.getElementById('wl-per-card-val')!;
const wlBlurEl       = document.getElementById('wl-blur')        as HTMLInputElement;
const wlBlurValEl    = document.getElementById('wl-blur-val')!;
const wlDarkenEl     = document.getElementById('wl-darken')      as HTMLInputElement;
const wlDarkenValEl  = document.getElementById('wl-darken-val')!;
const wlChromeEl     = document.getElementById('wl-chrome')      as HTMLInputElement;
const wlPauseHoverEl = document.getElementById('wl-pause-hover') as HTMLInputElement;
const wlShowTickerEl = document.getElementById('wl-show-ticker') as HTMLInputElement;
const wlAppleListEl  = document.getElementById('wl-apple-list')!;
const wlAppleUploadEl = document.getElementById('wl-apple-upload') as HTMLInputElement;
const wlSaveBtn      = document.getElementById('wl-save')!;
let wlApplePool: string[] = [];     // alle filer i /assets/apples/
let wlSelectedCards: Array<{ id: number | string; src: string | null; alt?: string }> = [];

const formAuctionDisplay = document.getElementById('gen-form-auctiondisplay')!;
const adActiveEl    = document.getElementById('ad-active')         as HTMLInputElement;
const adLabelEl     = document.getElementById('ad-label')          as HTMLInputElement;
const adScreenEl = document.getElementById('ad-screen') as HTMLSelectElement;
const adTeamsListEl = document.getElementById('ad-teams-list')!;
const adActiveLotEl = document.getElementById('ad-active-lot')     as HTMLSelectElement;
const adRevealCountEl = document.getElementById('ad-reveal-count') as HTMLInputElement;
const adRankingEl   = document.getElementById('ad-ranking')        as HTMLInputElement;
const adNamesVisibleEl = document.getElementById('ad-names-visible') as HTMLInputElement;
const adShowBaseLabelEl = document.getElementById('ad-show-base-label') as HTMLInputElement;
const adSaveBtn     = document.getElementById('ad-save')!;

const formMedia = document.getElementById('gen-form-media')!;
const mdActiveEl   = document.getElementById('md-active')   as HTMLInputElement;
const mdLabelEl    = document.getElementById('md-label')    as HTMLInputElement;
const mdModeEl     = document.getElementById('md-mode')     as HTMLSelectElement;
const mdSrcEl      = document.getElementById('md-src')      as HTMLInputElement;
const mdUploadEl   = document.getElementById('md-upload')   as HTMLInputElement;
const mdAltEl      = document.getElementById('md-alt')      as HTMLInputElement;
const mdFitEl      = document.getElementById('md-fit')      as HTMLSelectElement;
const mdBgEl       = document.getElementById('md-bg')       as HTMLInputElement;
const mdAutoplayEl = document.getElementById('md-autoplay') as HTMLInputElement;
const mdLoopEl     = document.getElementById('md-loop')     as HTMLInputElement;
const mdMutedEl    = document.getElementById('md-muted')    as HTMLInputElement;
const mdShowTickerEl = document.getElementById('md-show-ticker') as HTMLInputElement;
const mdVideoOptsEl = document.getElementById('md-video-opts')!;
const mdSaveBtn    = document.getElementById('md-save')!;

const formCarousel = document.getElementById('gen-form-carousel')!;
const crActiveEl         = document.getElementById('cr-active')          as HTMLInputElement;
const crLabelEl          = document.getElementById('cr-label')           as HTMLInputElement;
const crFadeMsEl         = document.getElementById('cr-fade-ms')         as HTMLInputElement;
const crDefaultSecondsEl = document.getElementById('cr-default-seconds') as HTMLInputElement;
const crBgColorEl        = document.getElementById('cr-bg-color')        as HTMLInputElement;
const crShowTickerEl     = document.getElementById('cr-show-ticker')     as HTMLInputElement;
const crImageListEl      = document.getElementById('cr-image-list')!;
const crImageUploadEl    = document.getElementById('cr-image-upload')    as HTMLInputElement;
const crSaveBtn          = document.getElementById('cr-save')!;
// Live edit copy of the carousel's image list. Renders to the list view on
// every change; readCarouselForm flattens this into the saved payload.
let crImagesDraft: Array<{ src: string; seconds?: number; alt?: string }> = [];

const formSponsorIndex = document.getElementById('gen-form-sponsorindex')!;
const siActiveEl   = document.getElementById('si-active') as HTMLInputElement;
const siLabelEl    = document.getElementById('si-label')  as HTMLInputElement;
const siTitleEl    = document.getElementById('si-title')  as HTMLInputElement;
const siSaveBtn    = document.getElementById('si-save')!;
const covLabelEl       = document.getElementById('cov-label')      as HTMLInputElement;
const covTitleEl       = document.getElementById('cov-title')      as HTMLInputElement;
const covSubtitleEl    = document.getElementById('cov-subtitle')   as HTMLInputElement;
const covAttributionEl = document.getElementById('cov-attribution') as HTMLInputElement;
const covLogoFileEl    = document.getElementById('cov-logo-file')  as HTMLInputElement;
const covLogoUploadEl  = document.getElementById('cov-logo-upload') as HTMLInputElement;
const covLogoPreviewEl = document.getElementById('cov-logo-preview') as HTMLImageElement;
const covLogoScaleEl   = document.getElementById('cov-logo-scale') as HTMLInputElement;
const covLogoScaleVal  = document.getElementById('cov-logo-scale-val')!;
const covActiveEl      = document.getElementById('cov-active')     as HTMLInputElement;
const covSaveBtn       = document.getElementById('cov-save')!;
const formContest    = document.getElementById('gen-form-contest')!;
const ctActiveEl     = document.getElementById('ct-active')    as HTMLInputElement;
const ctLabelEl      = document.getElementById('ct-label')     as HTMLInputElement;
const ctTitleEl      = document.getElementById('ct-title')     as HTMLInputElement;
const ctSubtitleEl   = document.getElementById('ct-subtitle')  as HTMLInputElement;
const ctBlockListEl  = document.getElementById('ct-block-list')!;
const ctAddBlockBtn  = document.getElementById('ct-add-block') as HTMLButtonElement;
const ctSaveBtn      = document.getElementById('ct-save')!;
let ctBlocks: ContestBlock[] = [];
const bpLabelEl     = document.getElementById('bp-label')      as HTMLInputElement;
const bpEventNameEl = document.getElementById('bp-event-name') as HTMLInputElement;
const bpColsEl      = document.getElementById('bp-cols')       as HTMLInputElement;
const bpRowsEl      = document.getElementById('bp-rows')       as HTMLInputElement;
const bpSeatsEl     = document.getElementById('bp-seats')      as HTMLInputElement;
const bpColAislesEl = document.getElementById('bp-col-aisles') as HTMLInputElement;
const bpRowAislesEl = document.getElementById('bp-row-aisles') as HTMLInputElement;
const bpRemovedEl   = document.getElementById('bp-removed')    as HTMLTextAreaElement;
const bpNumModeEl   = document.getElementById('bp-num-mode')   as HTMLSelectElement;
const bpNumOriginEl = document.getElementById('bp-num-origin') as HTMLSelectElement;
const bpNumDirEl    = document.getElementById('bp-num-dir')    as HTMLSelectElement;
const bpNumClusterDirEl = document.getElementById('bp-num-clusterdir') as HTMLSelectElement;
const bpNumStartEl  = document.getElementById('bp-num-start')  as HTMLInputElement;
const bpNumPrefixEl = document.getElementById('bp-num-prefix') as HTMLInputElement;
const bpNumSkipEl   = document.getElementById('bp-num-skip')   as HTMLInputElement;
const bpOverridesListEl = document.getElementById('bp-overrides-list')!;
const bpOverridesResetBtn = document.getElementById('bp-overrides-reset')!;
const bpActiveEl    = document.getElementById('bp-active')     as HTMLInputElement;
const bpSaveBtn     = document.getElementById('bp-save')!;
const bpSaveMetaEl  = document.getElementById('bp-save-meta')!;

function parseIntList(str: string): number[] {
  if (!str.trim()) return [];
  return str.split(/[,\s]+/).map(s => parseInt(s, 10)).filter(n => Number.isFinite(n));
}
function parseIntList1(str: string): number[] {
  return parseIntList(str).map(n => n - 1);
}
function parseCellList1(str: string): Array<{ col: number; row: number }> {
  if (!str.trim()) return [];
  return str.split(/[;\n]+/).map(pair => {
    const p = pair.split(/[,\s]+/).map(s => parseInt(s, 10)).filter(n => Number.isFinite(n));
    if (p.length < 2) return null;
    return { col: p[0] - 1, row: p[1] - 1 };
  }).filter(Boolean) as Array<{ col: number; row: number }>;
}
function formatIntList1(arr: number[]): string {
  return (arr || []).map(n => n + 1).join(', ');
}
function formatCellList1(arr: Array<{ col: number; row: number }>): string {
  return (arr || []).map(c => `${c.col + 1},${c.row + 1}`).join('; ');
}

// ---- Title <-> markdown conversion (bold via **...**, break via newline) ----
function partsToMarkdown(parts: Lot['titleParts']): string {
  if (!parts || !parts.length) return '';
  let out = '';
  parts.forEach((p, i) => {
    const t = p.bold ? `**${p.text}**` : p.text;
    out += t;
    if (p.break && i < parts.length - 1) out += '\n';
  });
  return out;
}
function markdownToParts(md: string): NonNullable<Lot['titleParts']> | undefined {
  if (!md) return undefined;
  const parts: NonNullable<Lot['titleParts']> = [];
  const lines = md.split('\n');
  lines.forEach((line, lineIdx) => {
    const tokens = line.split(/(\*\*[^*]+?\*\*)/);
    tokens.forEach(tok => {
      if (!tok) return;
      if (tok.startsWith('**') && tok.endsWith('**')) {
        parts.push({ text: tok.slice(2, -2), bold: true });
      } else {
        parts.push({ text: tok, bold: false });
      }
    });
    if (lineIdx < lines.length - 1 && parts.length) {
      parts[parts.length - 1].break = true;
    }
  });
  return parts.length ? parts : undefined;
}
function partsToPlainText(parts: NonNullable<Lot['titleParts']>): string {
  return parts.map(p => p.text + (p.break ? '\n' : '')).join('');
}

// ---- API ----
async function api(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function loadBank() {
  statusEl.textContent = 'Henter…';
  try {
    const data = await api('/api/lots');
    itemsBank = data.lots;
    lotsBank = itemsBank.filter(i => itemKind(i) === 'lot') as Lot[];
    // Refresh EVENT_META mirror so meta-driven editors (auction-display
    // team config, sponsor ticker, ...) reflect server state instead of
    // the stale lots.json snapshot imported at boot.
    if (data.meta) {
      for (const k of Object.keys(EVENT_META)) delete (EVENT_META as any)[k];
      Object.assign(EVENT_META, data.meta);
    }
    statusEl.textContent = `${itemsBank.length} items indlæst (${lotsBank.length} lots)`;
    renderList();
    // Restore selection across reload — sessionStorage survives Vite's
    // auto-reload triggered by lots.json writes in dev.
    const stillExists = selectedId && itemsBank.some(i => i.id === selectedId);
    if (stillExists) selectLot(selectedId!);
    else if (itemsBank.length) selectLot(itemsBank[0].id);
  } catch (e: any) {
    statusEl.textContent = 'Fejl: ' + e.message;
  }
}

// ---- Display num computation (mirrors slides.ts) ----
function computeDisplayNums(): Map<string, string> {
  const m = new Map<string, string>();
  let mainIdx = 0, lastMain = 0, extraLetterIdx = 0;
  for (const lot of lotsBank) {
    if (!lot.active) continue;
    if (lot.extra) {
      const suffix = (lot.extraSuffix ?? '').trim();
      if (suffix) m.set(lot.id, suffix);
      else {
        const letter = String.fromCharCode(65 + extraLetterIdx);
        m.set(lot.id, `${String(lastMain).padStart(2, '0')}${letter}`);
        extraLetterIdx += 1;
      }
    } else {
      mainIdx += 1; lastMain = mainIdx; extraLetterIdx = 0;
      m.set(lot.id, String(mainIdx).padStart(2, '0'));
    }
  }
  return m;
}

// ---- List rendering + drag-drop ----
function renderList() {
  const displayNums = computeDisplayNums();
  listRows.innerHTML = '';
  const activeCount = itemsBank.filter(i => i.active).length;
  listMeta.textContent = `${activeCount} aktive · ${itemsBank.length} total`;
  for (const item of itemsBank) {
    const row = document.createElement('div');
    row.className = 'gen-row';
    row.dataset.id = item.id;
    row.draggable = true;
    if (item.id === selectedId) row.classList.add('selected');
    if (!item.active) row.classList.add('inactive');
    const kind = itemKind(item);
    row.classList.add(`kind-${kind}`);
    let dn = '—';
    let title = '';
    let badge = !item.active ? 'INACTIVE' : '';
    if (kind === 'lot') {
      const lot = item as Lot;
      if (lot.extra) row.classList.add('extra');
      dn = displayNums.get(lot.id) ?? '—';
      title = lot.title || '(uden titel)';
      badge = !lot.active ? 'INACTIVE' : lot.extra ? 'EXTRA' : '';
    } else if (isBordplanItem(item)) {
      dn = 'BP';
      title = item.label || item.eventName || '(uden navn)';
      badge = !item.active ? 'INACTIVE' : 'BORDPLAN';
    } else if (isCoverItem(item)) {
      dn = 'CV';
      title = item.label || item.title || '(uden navn)';
      badge = !item.active ? 'INACTIVE' : 'COVER';
    } else if (isClosingItem(item)) {
      dn = 'CL';
      title = item.label || item.title || '(uden navn)';
      badge = !item.active ? 'INACTIVE' : 'CLOSING';
    } else if (isSponsorIndexItem(item)) {
      dn = 'SP';
      title = item.label || item.title || '(uden navn)';
      badge = !item.active ? 'INACTIVE' : 'SPONSOR-INDEKS';
    } else if (isWishLoopItem(item)) {
      dn = 'ØT';
      title = item.label || '(uden navn)';
      badge = !item.active ? 'INACTIVE' : `ØNSKE-LOOP · ${item.cards.length}`;
    } else if (isMediaItem(item)) {
      dn = 'MD';
      title = item.label || '(uden navn)';
      badge = !item.active ? 'INACTIVE' : `MEDIA · ${item.mode}`;
    } else if (isAuctionDisplayItem(item)) {
      dn = 'AD';
      title = item.label || '(uden navn)';
      badge = !item.active ? 'INACTIVE' : `AUKTION-DISPLAY · ${item.screen || 'intro'}`;
    } else if (kind === 'carousel') {
      dn = 'CR';
      const car = item as any;
      title = car.label || '(uden navn)';
      const count = Array.isArray(car.images) ? car.images.length : 0;
      badge = !car.active ? 'INACTIVE' : `BILLEDKARRUSEL · ${count}`;
    }
    row.innerHTML = `
      <span class="drag-handle">⋮⋮</span>
      <span class="gen-row-num">${dn}</span>
      <span class="gen-row-title">${escapeHtml(title)}</span>
      <span class="gen-row-badge">${badge}</span>
    `;
    row.addEventListener('click', () => selectLot(item.id));
    row.addEventListener('dragstart', onDragStart);
    row.addEventListener('dragover', onDragOver);
    row.addEventListener('drop', onDrop);
    row.addEventListener('dragend', onDragEnd);
    listRows.appendChild(row);
  }
}

let draggingId: string | null = null;
function clearDropMarkers() {
  listRows.querySelectorAll('.drop-above, .drop-below').forEach(el => {
    el.classList.remove('drop-above', 'drop-below');
  });
}
function onDragStart(e: DragEvent) {
  const row = e.currentTarget as HTMLElement;
  draggingId = row.dataset.id!;
  row.classList.add('is-dragging');
  e.dataTransfer!.effectAllowed = 'move';
  e.dataTransfer!.setData('text/plain', draggingId);
}
function onDragOver(e: DragEvent) {
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'move';
  const target = e.currentTarget as HTMLElement;
  if (!draggingId || target.dataset.id === draggingId) return;
  const rect = target.getBoundingClientRect();
  const before = e.clientY < rect.top + rect.height / 2;
  clearDropMarkers();
  target.classList.add(before ? 'drop-above' : 'drop-below');
  // Auto-scroll the list when dragging near top/bottom edges
  const scroller = listRows;
  const sRect = scroller.getBoundingClientRect();
  const margin = 36;
  if (e.clientY < sRect.top + margin) scroller.scrollBy({ top: -10 });
  else if (e.clientY > sRect.bottom - margin) scroller.scrollBy({ top: 10 });
}
async function onDrop(e: DragEvent) {
  e.preventDefault();
  if (!draggingId) return;
  const target = e.currentTarget as HTMLElement;
  if (target.dataset.id !== draggingId) {
    // Move source row in DOM to drop position before computing order
    const before = target.classList.contains('drop-above');
    const dragRow = listRows.querySelector(`[data-id="${draggingId}"]`);
    if (dragRow) {
      if (before) target.parentElement!.insertBefore(dragRow, target);
      else target.parentElement!.insertBefore(dragRow, target.nextSibling);
    }
  }
  clearDropMarkers();
  const order = Array.from(listRows.querySelectorAll<HTMLElement>('.gen-row'))
    .map(el => el.dataset.id!);
  const byId = new Map(itemsBank.map(i => [i.id, i]));
  itemsBank = order.map(id => byId.get(id)!).filter(Boolean);
  lotsBank = itemsBank.filter(i => itemKind(i) === 'lot') as Lot[];
  try {
    await api('/api/lots/reorder', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order }),
    });
    renderList();
    refreshPreview();
  } catch (e: any) {
    statusEl.textContent = 'Reorder failed: ' + e.message;
  }
}
function onDragEnd(e: DragEvent) {
  (e.currentTarget as HTMLElement).classList.remove('is-dragging');
  clearDropMarkers();
  draggingId = null;
}

// ---- Select + form binding ----
function selectLot(id: string) {
  if (dirty && id !== selectedId) {
    if (!confirm('Du har ugemte ændringer. Skift item og kassér?')) return;
  }
  selectedId = id;
  sessionStorage.setItem('gen.selectedId', id);
  const item = itemsBank.find(i => i.id === id);
  if (!item) return;
  const kind = itemKind(item);
  formLot.style.display = 'none';
  formBordplan.style.display = 'none';
  formCover.style.display = 'none';
  formClosing.style.display = 'none';
  formSponsorIndex.style.display = 'none';
  formWishLoop.style.display = 'none';
  formMedia.style.display = 'none';
  formAuctionDisplay.style.display = 'none';
  formContest.style.display = 'none';
  formCarousel.style.display = 'none';
  if (kind === 'carousel') {
    formCarousel.style.display = 'flex';
    populateCarouselForm(item as any);
  } else if (kind === 'contest') {
    formContest.style.display = 'flex';
    populateContestForm(item as ContestItem);
  } else if (kind === 'auction-display') {
    formAuctionDisplay.style.display = 'flex';
    populateAuctionDisplayForm(item as AuctionDisplayItem);
  } else if (kind === 'media') {
    formMedia.style.display = 'flex';
    populateMediaForm(item as MediaItem);
  } else if (kind === 'bordplan') {
    formBordplan.style.display = 'flex';
    populateBordplanForm(item as BordplanItem);
  } else if (kind === 'cover') {
    formCover.style.display = 'flex';
    populateCoverForm(item as CoverItem);
  } else if (kind === 'closing') {
    formClosing.style.display = 'flex';
    populateClosingForm(item as ClosingItem);
  } else if (kind === 'sponsor-index') {
    formSponsorIndex.style.display = 'flex';
    populateSponsorIndexForm(item as SponsorIndexItem);
  } else if (kind === 'wish-loop') {
    formWishLoop.style.display = 'flex';
    populateWishLoopForm(item as WishLoopItem);
  } else {
    formLot.style.display = 'flex';
    populateForm(item as Lot);
  }
  refreshPreview();
  renderList();
  setDirty(false);
  renderValidation();
}

function populateForm(lot: Lot) {
  editIdEl.textContent = lot.id;
  editDisplayNumEl.textContent = computeDisplayNums().get(lot.id) ?? '—';
  deleteBtn.style.display = 'inline-flex';
  duplicateBtn.style.display = 'inline-flex';
  resetFocalBtn.style.display = 'inline-flex';
  fActive.checked = !!lot.active;
  fExtra.checked  = !!lot.extra;
  rowExtraSuffix.style.display = lot.extra ? '' : 'none';
  fExtraSuffix.value = lot.extraSuffix ?? '';
  fTitle.value = lot.titleParts && lot.titleParts.length ? partsToMarkdown(lot.titleParts) : (lot.title || '');
  fSubtitle.value = lot.subtitle || '';
  fSponsor.value = lot.sponsor || '';
  fBullets.value = (lot.bullets || []).join('\n');
  fDonorNames.value = (lot.donorNames || []).join('\n');
  fLayout.value = lot.layout || 'horizon';
  fMirrored.checked = !!lot.mirrored;
  const focal = (lot.focal || '50% 50%').replace(/%/g, '').split(/\s+/).map(s => parseInt(s, 10));
  // Use Number.isFinite so a legitimate 0% (hard-left / hard-top crop) survives
  // — `0 || 50` would silently rewrite it to 50 on reload and the next save
  // would persist the fallback.
  const fxVal = Number.isFinite(focal[0]) ? focal[0] : 50;
  const fyVal = Number.isFinite(focal[1]) ? focal[1] : 50;
  fFocalX.value = String(fxVal); fFocalXVal.textContent = `${fxVal}%`;
  fFocalY.value = String(fyVal); fFocalYVal.textContent = `${fyVal}%`;
  const scalePct = Math.round((lot.heroScale ?? 1) * 100);
  fScale.value = String(scalePct);
  fScaleVal.textContent = `${scalePct}%`;
  fTitleSize.value = lot.titleSizePt ? String(lot.titleSizePt) : '';
  const horizonCap = lot.horizonCaptionIn ?? 2.25;
  fHorizonCap.value = String(horizonCap);
  fHorizonCapVal.textContent = `${horizonCap}in`;
  const profilePhoto = lot.profilePhotoIn ?? 5.8;
  fProfilePhoto.value = String(profilePhoto);
  fProfilePhotoVal.textContent = `${profilePhoto}in`;
  const isHorizon = (lot.layout || 'horizon') === 'horizon';
  rowHorizonCap.style.display = isHorizon ? '' : 'none';
  rowProfilePhoto.style.display = isHorizon ? 'none' : '';
  heroPreview.src = `/assets/hero/lot-${lot.id}_FINAL.${lot.heroExt || 'jpg'}?v=${Date.now()}`;
  const mainLogoUrl = lot.sponsorLogoSrc || `/assets/logo/logo-lot-${lot.id}.png`;
  logoPreview.src = `${mainLogoUrl}?v=${Date.now()}`;
  renderExtraLogoList(lot.extraSponsorLogos || []);
  fSponsorStack.value = lot.sponsorStack ?? 'auto';
  // Multi-image: image 1 focal/scale/preview set above. Populate extras 2 & 3,
  // split weights, count selector, then show/hide blocks.
  const heroImages = lot.heroImages || [];
  const count = Math.min(3, 1 + heroImages.length);
  fImgCount.value = String(count);
  const splits = lot.heroSplit && lot.heroSplit.length === count ? lot.heroSplit : null;
  const v = Date.now();
  heroCtls.forEach((c, i) => {
    if (i > 0) {
      const im = heroImages[i - 1];
      const f = ((im?.focal) || '50% 50%').replace(/%/g, '').split(/\s+/).map(s => parseInt(s, 10));
      // Same 0-vs-missing fix as image 1's focal sliders above.
      const exFx = Number.isFinite(f[0]) ? f[0] : 50;
      const exFy = Number.isFinite(f[1]) ? f[1] : 50;
      c.fx.value = String(exFx); c.fxVal.textContent = `${exFx}%`;
      c.fy.value = String(exFy); c.fyVal.textContent = `${exFy}%`;
      const sp = Math.round(((im?.scale) ?? 1) * 100);
      c.scale.value = String(sp); c.scaleVal.textContent = `${sp}%`;
      c.preview.src = `/assets/hero/lot-${lot.id}_FINAL${i + 1}.${im?.ext || 'jpg'}?v=${v}`;
    }
    const w = splits ? splits[i] : 50;
    c.split.value = String(w); c.splitVal.textContent = String(w);
  });
  applyImgCount(count);
}

function renderExtraLogoList(logos: string[]) {
  extraLogoListEl.innerHTML = '';
  if (!logos.length) {
    const empty = document.createElement('li');
    empty.style.cssText = 'font-style:italic;color:rgba(228,223,200,0.7);padding:4px 8px;background:transparent;border:0';
    empty.textContent = '(ingen ekstra logos)';
    extraLogoListEl.appendChild(empty);
    return;
  }
  logos.forEach((src, idx) => {
    const li = document.createElement('li');
    const fname = src.split('/').pop() || src;
    li.innerHTML = `
      <img src="${src}" alt="" />
      <span class="extra-fname">${fname}</span>
      <button type="button" class="extra-del" data-idx="${idx}" title="Fjern">✕</button>
    `;
    extraLogoListEl.appendChild(li);
  });
}
async function persistExtraLogos(logos: string[]) {
  if (!selectedId) return;
  try {
    const updated = await api(`/api/lots/${encodeURIComponent(selectedId)}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ extraSponsorLogos: logos }),
    });
    const idx = itemsBank.findIndex(i => i.id === selectedId);
    if (idx >= 0) itemsBank[idx] = updated;
    const lotIdx = lotsBank.findIndex(l => l.id === selectedId);
    if (lotIdx >= 0) lotsBank[lotIdx] = updated;
    renderExtraLogoList(updated.extraSponsorLogos || []);
    refreshPreview();
  } catch (e: any) { statusEl.textContent = 'Extra-logo save failed: ' + e.message; }
}
extraLogoListEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button.extra-del');
  if (!btn || !selectedId) return;
  const lot = lotsBank.find(l => l.id === selectedId);
  if (!lot) return;
  const idx = parseInt(btn.dataset.idx!, 10);
  const current = [...(lot.extraSponsorLogos || [])];
  current.splice(idx, 1);
  persistExtraLogos(current);
});
fExtraLogoUploadEl.addEventListener('change', async () => {
  const files = Array.from(fExtraLogoUploadEl.files || []);
  if (!files.length || !selectedId) return;
  const lot = lotsBank.find(l => l.id === selectedId);
  const current = [...(lot?.extraSponsorLogos || [])];
  for (const file of files) {
    const fd = new FormData();
    fd.append('kind', 'extra-logo');
    fd.append('lotId', selectedId);
    fd.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data?.filename) current.push(`/assets/logo/${data.filename}`);
    } catch (e: any) { statusEl.textContent = 'Extra-logo upload failed: ' + e.message; }
  }
  fExtraLogoUploadEl.value = '';
  persistExtraLogos(current);
});

function readForm(): Partial<Lot> {
  // Parse the title field as markdown — **bold** segments + newline for
  // forced line break. Plain title becomes the concatenated text.
  const titleParts = markdownToParts(fTitle.value);
  const plainTitle = titleParts ? partsToPlainText(titleParts).replace(/\n/g, ' ').trim() : fTitle.value.trim();
  // Multi-image: collect extras (images 2..N) + split weights. ext is set on
  // upload and preserved from the in-memory lot here so it survives a save.
  const imgCount = Math.min(3, Math.max(1, parseInt(fImgCount.value, 10) || 1));
  const curImgs = (lotsBank.find(l => l.id === selectedId)?.heroImages) || [];
  const heroImages = heroCtls.slice(1, imgCount).map((c, idx) => ({
    ext: curImgs[idx]?.ext,
    focal: `${c.fx.value}% ${c.fy.value}%`,
    scale: parseInt(c.scale.value, 10) / 100,
  }));
  const heroSplit = imgCount > 1
    ? heroCtls.slice(0, imgCount).map(c => parseInt(c.split.value, 10) || 1)
    : undefined;
  return {
    heroImages,
    heroSplit,
    active: fActive.checked,
    extra:  fExtra.checked,
    extraSuffix: fExtraSuffix.value.trim() || null,
    title: plainTitle,
    titleParts: titleParts && titleParts.length > 1 ? titleParts : undefined,
    subtitle: fSubtitle.value,
    sponsor: fSponsor.value,
    bullets: fBullets.value.split('\n').map(s => s.trim()).filter(Boolean),
    donorNames: fDonorNames.value.split('\n').map(s => s.trim()).filter(Boolean),
    layout: fLayout.value as 'horizon' | 'profile',
    mirrored: fMirrored.checked,
    focal: `${fFocalX.value}% ${fFocalY.value}%`,
    heroScale: parseInt(fScale.value, 10) / 100,
    titleSizePt: fTitleSize.value ? parseInt(fTitleSize.value, 10) : undefined,
    horizonCaptionIn: parseFloat(fHorizonCap.value) || undefined,
    profilePhotoIn:   parseFloat(fProfilePhoto.value) || undefined,
    sponsorStack: fSponsorStack.value === 'auto'
      ? null
      : (fSponsorStack.value as 'vertical' | 'horizontal'),
  };
}

const savePillEl = document.getElementById('gen-save-pill')!;
const validationEl = document.getElementById('gen-validation')!;

function validateForm(): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const title = fTitle.value.trim();
  if (fActive.checked && !title) errors.push('Lot er active men har ingen titel.');
  if (fExtra.checked && !fExtraSuffix.value.trim()) {
    warnings.push('Ekstra-lot uden suffix — auto-tildeles (fx 03A).');
  }
  const bulletCount = fBullets.value.split('\n').map(s => s.trim()).filter(Boolean).length;
  if (fLayout.value === 'horizon' && bulletCount > 8) {
    warnings.push(`${bulletCount} bullets passer muligvis ikke i 2-col horizon layout.`);
  }
  return { errors, warnings };
}

function renderValidation() {
  const { errors, warnings } = validateForm();
  validationEl.innerHTML = '';
  validationEl.classList.toggle('warn-only', errors.length === 0 && warnings.length > 0);
  for (const e of errors) {
    const el = document.createElement('div'); el.className = 'v-error'; el.textContent = '✗ ' + e;
    validationEl.appendChild(el);
  }
  for (const w of warnings) {
    const el = document.createElement('div'); el.className = 'v-warn'; el.textContent = '! ' + w;
    validationEl.appendChild(el);
  }
  return errors.length === 0;
}
function setDirty(v: boolean) {
  dirty = v;
  saveMeta.className = 'gen-save-meta' + (v ? ' dirty' : ' saved');
  saveMeta.textContent = v ? 'UGEMTE ÆNDRINGER' : 'GEMT';
  if (!v && !selectedId) saveMeta.textContent = '';
  // Topbar pill mirror
  savePillEl.className = 'gen-save-pill ' + (selectedId ? (v ? 'dirty' : 'saved') : '');
  savePillEl.textContent = selectedId ? (v ? '● Ugemt' : '✓ Gemt') : '';
}

// ---- Preview ----
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
}

function refreshPreview() {
  if (!selectedId) return;
  const item = itemsBank.find(i => i.id === selectedId);
  if (!item) return;
  previewFrame.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'slide-frame';
  previewFrame.appendChild(wrap);
  if (isBordplanItem(item)) {
    const merged: BordplanItem = { ...item, ...readBordplanForm() };
    const slideEl = document.createElement('div');
    slideEl.className = 'slide-canvas slide-bordplan';
    slideEl.classList.add('is-visible', 'no-build');
    slideEl.innerHTML = renderBordplanSlide(merged.config, {
      eventName: merged.eventName, org: merged.org, overrides: merged.overrides,
    });
    wrap.appendChild(slideEl);
    requestAnimationFrame(() => fitToViewport(wrap, slideEl));
    previewMeta.textContent = `bordplan · ${merged.config.cols}×${merged.config.rows}`;
    wireBordplanTableClicks(slideEl);
    renderOverridesList(merged.overrides || {});
    return;
  }
  if (isCoverItem(item)) {
    const merged: CoverItem = { ...item, ...readCoverForm() };
    const slideEl = document.createElement('div');
    slideEl.className = 'slide-canvas slide-cover';
    slideEl.classList.add('is-visible', 'no-build');
    slideEl.innerHTML = renderCover(merged);
    wrap.appendChild(slideEl);
    requestAnimationFrame(() => fitToViewport(wrap, slideEl));
    previewMeta.textContent = 'cover slide';
    return;
  }
  if (isClosingItem(item)) {
    const merged: ClosingItem = { ...item, ...readClosingForm() };
    const slideEl = document.createElement('div');
    slideEl.className = 'slide-canvas slide-closing';
    slideEl.classList.add('is-visible', 'no-build');
    slideEl.innerHTML = renderClosing(merged);
    wrap.appendChild(slideEl);
    requestAnimationFrame(() => fitToViewport(wrap, slideEl));
    previewMeta.textContent = `closing · ${merged.logos.length} logos`;
    return;
  }
  if (isSponsorIndexItem(item)) {
    const merged: SponsorIndexItem = { ...item, ...readSponsorIndexForm() };
    const slideEl = document.createElement('div');
    slideEl.className = 'slide-canvas slide-sponsor-index';
    slideEl.classList.add('is-visible', 'no-build');
    slideEl.innerHTML = renderSponsorIndex(merged);
    wrap.appendChild(slideEl);
    requestAnimationFrame(() => fitToViewport(wrap, slideEl));
    previewMeta.textContent = 'sponsor-index';
    return;
  }
  if (isContestItem(item)) {
    const merged: ContestItem = { ...item, ...readContestForm() };
    const slideEl = document.createElement('div');
    slideEl.className = 'slide-canvas slide-contest';
    slideEl.classList.add('is-visible', 'no-build');
    slideEl.innerHTML = renderContest(merged);
    wrap.appendChild(slideEl);
    requestAnimationFrame(() => fitToViewport(wrap, slideEl));
    previewMeta.textContent = `konkurrence · ${merged.blocks.length} blok(ke)`;
    return;
  }
  if (itemKind(item) === 'carousel') {
    const merged: any = { ...item, ...readCarouselForm() };
    const slideEl = document.createElement('div');
    slideEl.className = 'slide-canvas slide-carousel';
    slideEl.classList.add('is-visible', 'no-build');
    slideEl.innerHTML = renderCarousel(merged);
    wrap.appendChild(slideEl);
    requestAnimationFrame(() => fitToViewport(wrap, slideEl));
    previewMeta.textContent = `billedkarrusel · ${merged.images.length} billed${merged.images.length === 1 ? '' : 'er'}`;
    return;
  }
  if (isAuctionDisplayItem(item)) {
    const slideEl = document.createElement('div');
    slideEl.className = 'slide-canvas slide-auction-display';
    slideEl.classList.add('is-visible', 'no-build');
    slideEl.innerHTML = renderAuctionDisplay(item);
    wrap.appendChild(slideEl);
    requestAnimationFrame(() => fitToViewport(wrap, slideEl));
    previewMeta.textContent = `auktion-display · ${(item as AuctionDisplayItem).screen || 'intro'}`;
    return;
  }
  if (isMediaItem(item)) {
    const merged: MediaItem = { ...item, ...readMediaForm() } as MediaItem;
    const slideEl = document.createElement('div');
    slideEl.className = 'slide-canvas slide-media';
    slideEl.classList.add('is-visible', 'no-build');
    slideEl.innerHTML = renderMedia(merged);
    // Generator preview is a preview, never an audio source — mute any
    // mounted video regardless of the item's videoMuted setting.
    slideEl.querySelectorAll<HTMLVideoElement>('video').forEach(v => { v.muted = true; v.volume = 0; });
    wrap.appendChild(slideEl);
    requestAnimationFrame(() => fitToViewport(wrap, slideEl));
    previewMeta.textContent = `media · ${merged.mode}`;
    return;
  }
  if (isWishLoopItem(item)) {
    const merged: WishLoopItem = { ...item, ...readWishLoopForm() };
    const slideEl = document.createElement('div');
    slideEl.className = 'slide-canvas slide-wish-loop';
    slideEl.classList.add('is-visible', 'no-build');
    slideEl.innerHTML = renderWishLoop(merged);
    wrap.appendChild(slideEl);
    requestAnimationFrame(() => fitToViewport(wrap, slideEl));
    previewMeta.textContent = `wish-loop · ${merged.cards.length}/${wlApplePool.length} kort`;
    return;
  }
  const baseLot = item as Lot;
  const livePatch = readForm();
  const merged: Lot = { ...baseLot, ...livePatch } as Lot;
  const slide = { id: `lot-${merged.id}`, kind: 'lot' as const, lotId: merged.id };
  const dn = computeDisplayNums().get(merged.id) ?? '—';
  previewMeta.textContent = `${merged.layout || 'horizon'}${merged.mirrored ? ' · mirror' : ''} · vises som ${dn}`;
  const slideEl = renderSlide(slide, merged, dn);
  slideEl.classList.add('is-visible', 'no-build');
  wrap.appendChild(slideEl);
  requestAnimationFrame(() => fitToViewport(wrap, slideEl));
}

// ---- Bordplan form ----
function populateBordplanForm(item: BordplanItem) {
  editIdEl.textContent = item.id;
  editDisplayNumEl.textContent = 'BP';
  deleteBtn.style.display = 'inline-flex';
  duplicateBtn.style.display = 'inline-flex';
  resetFocalBtn.style.display = 'none';
  bpActiveEl.checked = !!item.active;
  bpLabelEl.value = item.label ?? '';
  bpEventNameEl.value = item.eventName ?? '';
  const c = item.config;
  bpColsEl.value = String(c.cols);
  bpRowsEl.value = String(c.rows);
  bpSeatsEl.value = String(c.seatsPerTable);
  bpColAislesEl.value = formatIntList1(c.colAislesAfter || []);
  bpRowAislesEl.value = formatIntList1(c.rowAislesAfter || []);
  bpRemovedEl.value = formatCellList1(c.removedCells || []);
  bpNumModeEl.value = c.numbering.mode;
  bpNumOriginEl.value = c.numbering.origin;
  bpNumDirEl.value = c.numbering.direction;
  bpNumClusterDirEl.value = c.numbering.clusterDirection || c.numbering.direction;
  bpNumStartEl.value = String(c.numbering.startAt ?? 1);
  bpNumPrefixEl.value = c.numbering.prefix ?? '';
  bpNumSkipEl.value = (c.numbering.skip || []).join(', ');
}

function readBordplanForm(): Partial<BordplanItem> {
  const baseItem = itemsBank.find(i => i.id === selectedId);
  const existingOverrides = isBordplanItem(baseItem) ? (baseItem.overrides || {}) : {};
  const config: FloorPlanConfig = {
    cols: parseInt(bpColsEl.value, 10) || 1,
    rows: parseInt(bpRowsEl.value, 10) || 1,
    seatsPerTable: parseInt(bpSeatsEl.value, 10) || 4,
    colAislesAfter: parseIntList1(bpColAislesEl.value),
    rowAislesAfter: parseIntList1(bpRowAislesEl.value),
    removedCells: parseCellList1(bpRemovedEl.value),
    numbering: {
      mode: bpNumModeEl.value as any,
      origin: bpNumOriginEl.value as any,
      direction: bpNumDirEl.value as any,
      clusterDirection: bpNumClusterDirEl.value as any,
      startAt: parseInt(bpNumStartEl.value, 10) || 1,
      prefix: bpNumPrefixEl.value || '',
      skip: parseIntList(bpNumSkipEl.value),
    },
  };
  return {
    active: bpActiveEl.checked,
    label: bpLabelEl.value,
    eventName: bpEventNameEl.value,
    config,
    overrides: existingOverrides,
  };
}

// ---- Overrides list + popover ----
function renderOverridesList(overrides: Record<string, { label?: string; active?: boolean }>) {
  bpOverridesListEl.innerHTML = '';
  const entries = Object.entries(overrides);
  if (!entries.length) {
    bpOverridesListEl.innerHTML = '<li class="ov-empty">Ingen overrides.</li>';
    return;
  }
  for (const [id, ov] of entries) {
    const li = document.createElement('li');
    const desc = [];
    if (ov.label != null) desc.push(`omdøbt: "${escapeHtml(ov.label)}"`);
    if (ov.active === false) desc.push('deaktiveret');
    li.innerHTML = `<span><code>${id}</code> — ${desc.join(', ') || '—'}</span><button class="ov-clear" data-id="${id}">Ryd</button>`;
    bpOverridesListEl.appendChild(li);
  }
  bpOverridesListEl.querySelectorAll<HTMLButtonElement>('.ov-clear').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id!;
      const baseItem = itemsBank.find(i => i.id === selectedId);
      if (!isBordplanItem(baseItem)) return;
      baseItem.overrides = baseItem.overrides || {};
      delete baseItem.overrides[id];
      setDirty(true);
      refreshPreview();
    });
  });
}

bpOverridesResetBtn.addEventListener('click', () => {
  const baseItem = itemsBank.find(i => i.id === selectedId);
  if (!isBordplanItem(baseItem)) return;
  if (!confirm('Nulstil alle bord-overrides for denne plan?')) return;
  baseItem.overrides = {};
  setDirty(true);
  refreshPreview();
});

let popoverEl: HTMLElement | null = null;
function closePopover() {
  if (popoverEl) { popoverEl.remove(); popoverEl = null; }
}
document.addEventListener('click', (e) => {
  if (popoverEl && !(e.target as HTMLElement).closest('.bp-override-pop, .bp-table')) {
    closePopover();
  }
});

function wireBordplanTableClicks(slideEl: HTMLElement) {
  slideEl.querySelectorAll<HTMLElement>('.bp-table').forEach(cell => {
    cell.addEventListener('click', (e) => {
      e.stopPropagation();
      const tableId = cell.dataset.tableId!;
      openOverridePopover(cell, tableId);
    });
  });
}

function openOverridePopover(anchor: HTMLElement, tableId: string) {
  closePopover();
  const baseItem = itemsBank.find(i => i.id === selectedId);
  if (!isBordplanItem(baseItem)) return;
  const overrides = baseItem.overrides || {};
  const current = overrides[tableId] || {};
  const isGhost = anchor.classList.contains('bp-ghost');

  const pop = document.createElement('div');
  pop.className = 'bp-override-pop';
  const rect = anchor.getBoundingClientRect();
  // Mount on document.body so the preview-frame's overflow:hidden
  // doesn't clip the popover (and so high z-index is meaningful).
  pop.style.position = 'fixed';
  pop.style.left = `${rect.right + 8}px`;
  pop.style.top  = `${rect.top}px`;
  pop.innerHTML = `
    <span class="pop-id">${tableId}</span>
    ${isGhost
      ? `<span style="font-size:11px;color:var(--text-c2)">Ghost-celle. Gendan?</span>
         <div class="pop-actions"><button class="pop-restore">Gendan bord</button></div>`
      : `<input type="text" placeholder="label-override (fx VIP)" value="${escapeHtml(current.label ?? '')}" />
         <div class="pop-actions">
           <button class="pop-save">Gem label</button>
           <button class="pop-del">${current.active === false ? 'Aktiver' : 'Deaktiver'}</button>
         </div>`}
  `;
  document.body.appendChild(pop);
  popoverEl = pop;

  if (isGhost) {
    pop.querySelector('.pop-restore')!.addEventListener('click', () => {
      // A cell can be a ghost two ways: listed in config.removedCells, or
      // deactivated via an override (active:false). Restore must clear both.
      const cellMatch = /^c(\d+)r(\d+)$/.exec(tableId);
      if (cellMatch) {
        const c = parseInt(cellMatch[1], 10);
        const r = parseInt(cellMatch[2], 10);
        baseItem.config.removedCells = (baseItem.config.removedCells || [])
          .filter(cc => !(cc.col === c && cc.row === r));
        bpRemovedEl.value = formatCellList1(baseItem.config.removedCells);
      }
      const ov = baseItem.overrides?.[tableId];
      if (ov && ov.active === false) {
        if (ov.label == null) delete baseItem.overrides![tableId];
        else delete ov.active;
      }
      closePopover();
      setDirty(true);
      refreshPreview();
    });
    return;
  }

  const input = pop.querySelector<HTMLInputElement>('input')!;
  pop.querySelector('.pop-save')!.addEventListener('click', () => {
    baseItem.overrides = baseItem.overrides || {};
    const next = { ...(baseItem.overrides[tableId] || {}) };
    next.label = input.value.trim() || undefined;
    if (next.label == null && next.active === undefined) delete baseItem.overrides[tableId];
    else baseItem.overrides[tableId] = next;
    closePopover();
    setDirty(true);
    refreshPreview();
  });
  pop.querySelector('.pop-del')!.addEventListener('click', () => {
    baseItem.overrides = baseItem.overrides || {};
    const next = { ...(baseItem.overrides[tableId] || {}) };
    next.active = next.active === false ? true : false;
    if (next.active === true && next.label == null) delete baseItem.overrides[tableId];
    else baseItem.overrides[tableId] = next;
    closePopover();
    setDirty(true);
    refreshPreview();
  });
}

// Bordplan form change handlers
[bpActiveEl, bpLabelEl, bpEventNameEl, bpColsEl, bpRowsEl, bpSeatsEl, bpColAislesEl, bpRowAislesEl, bpRemovedEl, bpNumModeEl, bpNumOriginEl, bpNumDirEl, bpNumClusterDirEl, bpNumStartEl, bpNumPrefixEl, bpNumSkipEl]
  .forEach(el => el.addEventListener('input', () => { setDirty(true); refreshPreview(); }));

// ---- Cover form ----
function populateCoverForm(item: CoverItem) {
  editIdEl.textContent = item.id;
  editDisplayNumEl.textContent = 'COVER';
  deleteBtn.style.display = 'inline-flex';
  duplicateBtn.style.display = 'inline-flex';
  resetFocalBtn.style.display = 'none';
  covActiveEl.checked = !!item.active;
  covLabelEl.value = item.label ?? '';
  covTitleEl.value = item.title ?? '';
  covSubtitleEl.value = item.subtitle ?? '';
  covAttributionEl.value = item.attribution ?? '';
  covLogoFileEl.value = item.logoFile ?? '';
  updateCoverLogoPreview();
  const scalePct = Math.round((item.logoScale ?? 1) * 100);
  covLogoScaleEl.value = String(scalePct);
  covLogoScaleVal.textContent = scalePct + '%';
}
function readCoverForm(): Partial<CoverItem> {
  const scale = Number(covLogoScaleEl.value) / 100;
  return {
    active: covActiveEl.checked,
    label: covLabelEl.value,
    title: covTitleEl.value,
    subtitle: covSubtitleEl.value,
    attribution: covAttributionEl.value,
    logoFile: covLogoFileEl.value || undefined,
    logoScale: scale === 1 ? undefined : scale,
  };
}
function updateCoverLogoPreview() {
  const f = covLogoFileEl.value.trim();
  covLogoPreviewEl.src = f ? `/assets/${f}?v=${Date.now()}` : '';
  covLogoPreviewEl.style.display = f ? '' : 'none';
}
async function uploadCoverLogo(file: File) {
  const fd = new FormData();
  fd.append('kind', 'cover-logo');
  fd.append('file', file);
  try {
    statusEl.textContent = 'Uploader logo…';
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!data.filename) throw new Error('no filename');
    covLogoFileEl.value = `cover/${data.filename}`;
    updateCoverLogoPreview();
    setDirty(true);
    refreshPreview();
    statusEl.textContent = 'Logo uploadet';
  } catch (e: any) {
    statusEl.textContent = 'Upload failed: ' + e.message;
  }
}
covLogoUploadEl.addEventListener('change', () => {
  if (covLogoUploadEl.files?.[0]) uploadCoverLogo(covLogoUploadEl.files[0]);
});
covLogoFileEl.addEventListener('input', updateCoverLogoPreview);
covLogoScaleEl.addEventListener('input', () => {
  covLogoScaleVal.textContent = covLogoScaleEl.value + '%';
});
[covActiveEl, covLabelEl, covTitleEl, covSubtitleEl, covAttributionEl, covLogoFileEl, covLogoScaleEl]
  .forEach(el => el.addEventListener('input', () => { setDirty(true); refreshPreview(); }));
covSaveBtn.addEventListener('click', async () => {
  if (!selectedId) return;
  const patch = readCoverForm();
  try {
    statusEl.textContent = 'Gemmer cover…';
    const updated = await api(`/api/lots/${encodeURIComponent(selectedId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const idx = itemsBank.findIndex(i => i.id === selectedId);
    if (idx >= 0) itemsBank[idx] = updated;
    setDirty(false);
    renderList();
    refreshPreview();
    statusEl.textContent = 'Gemt';
  } catch (e: any) {
    statusEl.textContent = 'Save failed: ' + e.message;
  }
});

// ---- Closing form ----
function populateClosingForm(item: ClosingItem) {
  editIdEl.textContent = item.id;
  editDisplayNumEl.textContent = 'CLOSING';
  deleteBtn.style.display = 'inline-flex';
  duplicateBtn.style.display = 'inline-flex';
  resetFocalBtn.style.display = 'none';
  clActiveEl.checked = !!item.active;
  clLabelEl.value   = item.label   ?? '';
  clTitleEl.value   = item.title   ?? '';
  clTaglineEl.value = item.tagline ?? '';
  clColsEl.value    = String(item.cols ?? 8);
  clLogos = (item.logos || []).map(l => ({ file: l.file, kind: l.kind }));
  renderClosingLogoList();
}
function readClosingForm(): Partial<ClosingItem> {
  return {
    active:  clActiveEl.checked,
    label:   clLabelEl.value,
    title:   clTitleEl.value,
    tagline: clTaglineEl.value,
    cols:    parseInt(clColsEl.value, 10) || 8,
    logos:   clLogos,
  };
}
function renderClosingLogoList() {
  clLogoListEl.innerHTML = '';
  clLogos.forEach((entry, idx) => {
    const li = document.createElement('li');
    li.draggable = true;
    li.dataset.idx = String(idx);
    const isWordmark = entry.kind === 'wordmark';
    li.innerHTML = `
      <img src="/assets/closing/${entry.file}" alt="" onerror="this.style.opacity=0.2" />
      <div class="cl-fname">${entry.file}</div>
      <div class="cl-row">
        <button type="button" class="cl-kind-btn ${isWordmark ? 'active' : ''}" data-action="kind-w">W</button>
        <button type="button" class="cl-kind-btn ${!isWordmark ? 'active' : ''}" data-action="kind-s">S</button>
        <button type="button" class="cl-del-btn" data-action="del" title="Fjern">✕</button>
      </div>
    `;
    clLogoListEl.appendChild(li);
  });
  if (!clLogos.length) {
    const empty = document.createElement('li');
    empty.className = 'ov-empty';
    empty.style.gridColumn = '1 / -1';
    empty.textContent = '(Ingen logos — upload nogen nedenfor)';
    clLogoListEl.appendChild(empty);
  }
}
function onClosingChange() { setDirty(true); refreshPreview(); }
clLogoListEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
  if (!btn) return;
  const li = btn.closest('li')!;
  const idx = parseInt(li.dataset.idx!, 10);
  const entry = clLogos[idx];
  if (!entry) return;
  const a = btn.dataset.action!;
  if (a === 'kind-w') entry.kind = 'wordmark';
  else if (a === 'kind-s') entry.kind = 'stacked';
  else if (a === 'del') clLogos.splice(idx, 1);
  renderClosingLogoList();
  onClosingChange();
});
// Drag-reorder
let clDragIdx: number | null = null;
clLogoListEl.addEventListener('dragstart', (e) => {
  const li = (e.target as HTMLElement).closest<HTMLLIElement>('li');
  if (!li || li.dataset.idx === undefined) return;
  clDragIdx = parseInt(li.dataset.idx!, 10);
  li.classList.add('dragging');
  e.dataTransfer?.setData('text/plain', String(clDragIdx));
});
clLogoListEl.addEventListener('dragover', (e) => {
  e.preventDefault();
  const li = (e.target as HTMLElement).closest<HTMLLIElement>('li');
  clLogoListEl.querySelectorAll('li.drag-over').forEach(el => el.classList.remove('drag-over'));
  if (li && li.dataset.idx !== undefined) li.classList.add('drag-over');
});
clLogoListEl.addEventListener('dragend', () => {
  clLogoListEl.querySelectorAll('li').forEach(el => el.classList.remove('dragging', 'drag-over'));
  clDragIdx = null;
});
clLogoListEl.addEventListener('drop', (e) => {
  e.preventDefault();
  const targetLi = (e.target as HTMLElement).closest<HTMLLIElement>('li');
  if (!targetLi || targetLi.dataset.idx === undefined || clDragIdx === null) return;
  const targetIdx = parseInt(targetLi.dataset.idx!, 10);
  if (targetIdx === clDragIdx) return;
  const [moved] = clLogos.splice(clDragIdx, 1);
  clLogos.splice(targetIdx, 0, moved);
  clDragIdx = null;
  renderClosingLogoList();
  onClosingChange();
});
// Upload
clLogoUploadEl.addEventListener('change', async () => {
  const files = Array.from(clLogoUploadEl.files || []);
  if (!files.length) return;
  for (const file of files) {
    const fd = new FormData();
    fd.append('kind', 'closing');
    fd.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data && data.filename) clLogos.push({ file: data.filename });
    } catch (e: any) {
      statusEl.textContent = 'Upload failed: ' + e.message;
    }
  }
  clLogoUploadEl.value = '';
  renderClosingLogoList();
  onClosingChange();
});
[clActiveEl, clLabelEl, clTitleEl, clTaglineEl, clColsEl]
  .forEach(el => el.addEventListener('input', onClosingChange));
clSaveBtn.addEventListener('click', async () => {
  if (!selectedId) return;
  const patch = readClosingForm();
  try {
    statusEl.textContent = 'Gemmer closing…';
    const updated = await api(`/api/lots/${encodeURIComponent(selectedId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const idx = itemsBank.findIndex(i => i.id === selectedId);
    if (idx >= 0) itemsBank[idx] = updated;
    setDirty(false);
    renderList();
    refreshPreview();
    statusEl.textContent = 'Gemt';
  } catch (e: any) {
    statusEl.textContent = 'Save failed: ' + e.message;
  }
});

// ---- Contest / lodtrækning form ----
const CONTEST_MAX_BLOCKS = 4;
function populateContestForm(item: ContestItem) {
  editIdEl.textContent = item.id;
  editDisplayNumEl.textContent = 'KONKURRENCE';
  deleteBtn.style.display = 'inline-flex';
  duplicateBtn.style.display = 'inline-flex';
  resetFocalBtn.style.display = 'none';
  ctActiveEl.checked = !!item.active;
  ctLabelEl.value    = item.label    ?? '';
  ctTitleEl.value    = item.title    ?? '';
  ctSubtitleEl.value = item.subtitle ?? '';
  ctBlocks = (item.blocks || []).map(b => ({
    src: b.src ?? null,
    heading: b.heading ?? '',
    lines: Array.isArray(b.lines) ? b.lines.slice(0, 3) : [],
  }));
  renderContestBlockList();
}
function readContestForm(): Partial<ContestItem> {
  return {
    active:   ctActiveEl.checked,
    label:    ctLabelEl.value,
    title:    ctTitleEl.value,
    subtitle: ctSubtitleEl.value,
    blocks:   ctBlocks.map(b => ({
      src: b.src ?? null,
      heading: b.heading || undefined,
      lines: (b.lines || []).map(l => l.trim()).filter(Boolean).slice(0, 3),
    })),
  };
}
function renderContestBlockList() {
  ctBlockListEl.innerHTML = '';
  ctBlocks.forEach((b, idx) => {
    const card = document.createElement('div');
    card.className = 'ct-block-card';
    card.draggable = true;
    card.dataset.idx = String(idx);
    const lines = b.lines || [];
    const imgInner = b.src
      ? `<img src="${escapeHtml(b.src)}" alt="" onerror="this.style.opacity=0.2" />`
      : `<span class="ct-block-empty">Intet billede</span>`;
    card.innerHTML = `
      <div class="ct-block-head"><span class="ct-block-num">Blok ${idx + 1}</span>
        <button type="button" class="cl-del-btn" data-action="del" title="Fjern blok">✕</button>
      </div>
      <div class="ct-block-imgwrap">${imgInner}</div>
      <label class="ct-block-upload">
        <input type="file" data-action="img" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
        <span>Skift billede/logo</span>
      </label>
      <input type="text" class="ct-block-field" data-field="heading" placeholder="Overskrift" value="${escapeHtml(b.heading || '')}" />
      <input type="text" class="ct-block-field" data-field="line0" placeholder="Info linje 1" value="${escapeHtml(lines[0] || '')}" />
      <input type="text" class="ct-block-field" data-field="line1" placeholder="Info linje 2" value="${escapeHtml(lines[1] || '')}" />
      <input type="text" class="ct-block-field" data-field="line2" placeholder="Info linje 3" value="${escapeHtml(lines[2] || '')}" />
    `;
    ctBlockListEl.appendChild(card);
  });
  if (!ctBlocks.length) {
    const empty = document.createElement('div');
    empty.className = 'ov-empty';
    empty.textContent = '(Ingen blokke — tilføj 1–4 nedenfor)';
    ctBlockListEl.appendChild(empty);
  }
  ctAddBlockBtn.disabled = ctBlocks.length >= CONTEST_MAX_BLOCKS;
}
function onContestChange() { setDirty(true); refreshPreview(); }
ctBlockListEl.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  const field = el.dataset.field;
  if (!field) return;
  const card = el.closest<HTMLElement>('.ct-block-card');
  if (!card) return;
  const idx = parseInt(card.dataset.idx!, 10);
  const b = ctBlocks[idx];
  if (!b) return;
  if (field === 'heading') {
    b.heading = el.value;
  } else if (field.startsWith('line')) {
    const li = parseInt(field.slice(4), 10);
    if (!b.lines) b.lines = [];
    b.lines[li] = el.value;
  }
  onContestChange();
});
ctBlockListEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action="del"]');
  if (!btn) return;
  const card = btn.closest<HTMLElement>('.ct-block-card');
  if (!card) return;
  const idx = parseInt(card.dataset.idx!, 10);
  ctBlocks.splice(idx, 1);
  renderContestBlockList();
  onContestChange();
});
ctBlockListEl.addEventListener('change', async (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.action !== 'img' || !el.files?.[0]) return;
  const card = el.closest<HTMLElement>('.ct-block-card');
  if (!card) return;
  const idx = parseInt(card.dataset.idx!, 10);
  const b = ctBlocks[idx];
  if (!b) return;
  const fd = new FormData();
  fd.append('kind', 'contest');
  fd.append('file', el.files[0]);
  try {
    statusEl.textContent = 'Uploader billede…';
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!data.filename) throw new Error('no filename');
    b.src = `/assets/contest/${data.filename}`;
    renderContestBlockList();
    onContestChange();
    statusEl.textContent = 'Billede uploadet';
  } catch (err: any) {
    statusEl.textContent = 'Upload failed: ' + err.message;
  }
});
let ctDragIdx: number | null = null;
ctBlockListEl.addEventListener('dragstart', (e) => {
  const card = (e.target as HTMLElement).closest<HTMLElement>('.ct-block-card');
  if (!card || card.dataset.idx === undefined) return;
  ctDragIdx = parseInt(card.dataset.idx!, 10);
  card.classList.add('dragging');
});
ctBlockListEl.addEventListener('dragover', (e) => {
  e.preventDefault();
  const card = (e.target as HTMLElement).closest<HTMLElement>('.ct-block-card');
  ctBlockListEl.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  if (card && card.dataset.idx !== undefined) card.classList.add('drag-over');
});
ctBlockListEl.addEventListener('dragend', () => {
  ctBlockListEl.querySelectorAll('.ct-block-card').forEach(el => el.classList.remove('dragging', 'drag-over'));
  ctDragIdx = null;
});
ctBlockListEl.addEventListener('drop', (e) => {
  e.preventDefault();
  const card = (e.target as HTMLElement).closest<HTMLElement>('.ct-block-card');
  if (!card || card.dataset.idx === undefined || ctDragIdx === null) return;
  const targetIdx = parseInt(card.dataset.idx!, 10);
  if (targetIdx === ctDragIdx) return;
  const [moved] = ctBlocks.splice(ctDragIdx, 1);
  ctBlocks.splice(targetIdx, 0, moved);
  ctDragIdx = null;
  renderContestBlockList();
  onContestChange();
});
ctAddBlockBtn.addEventListener('click', () => {
  if (ctBlocks.length >= CONTEST_MAX_BLOCKS) return;
  ctBlocks.push({ src: null, heading: '', lines: [] });
  renderContestBlockList();
  onContestChange();
});
[ctActiveEl, ctLabelEl, ctTitleEl, ctSubtitleEl]
  .forEach(el => el.addEventListener('input', onContestChange));
ctSaveBtn.addEventListener('click', async () => {
  if (!selectedId) return;
  const patch = readContestForm();
  try {
    statusEl.textContent = 'Gemmer konkurrence…';
    const updated = await api(`/api/lots/${encodeURIComponent(selectedId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const idx = itemsBank.findIndex(i => i.id === selectedId);
    if (idx >= 0) itemsBank[idx] = updated;
    setDirty(false);
    renderList();
    refreshPreview();
    statusEl.textContent = 'Gemt';
  } catch (e: any) {
    statusEl.textContent = 'Save failed: ' + e.message;
  }
});

// ---- Auction-display form (item-level + global team-config) ----
const DEFAULT_TEAM_COLORS: Record<string, { base: string; live: string }> = {
  A: { base: '#1f6e34', live: '#3ed170' },
  B: { base: '#a06a14', live: '#f0b048' },
  C: { base: '#9a2b1f', live: '#e85a44' },
  D: { base: '#2a5a9e', live: '#6aa9e8' },
};
let adTeamsDraft: AuctionTeam[] = [];
function defaultTeams(): AuctionTeam[] {
  return ['A','B','C','D'].map(id => ({
    id: id as any, name: `Hold ${id}`,
    baseColor: DEFAULT_TEAM_COLORS[id].base,
    liveColor: DEFAULT_TEAM_COLORS[id].live,
    preAmount: 0, lotId: undefined, lot: { title: '', description: '' },
  }));
}
function renderAdTeamsList() {
  const lots = lotsBank.filter(l => l.active).map(l => ({ id: l.id, title: l.title }));
  adTeamsListEl.innerHTML = '';
  adTeamsDraft.forEach((tm, idx) => {
    const fallback = DEFAULT_TEAM_COLORS[tm.palette || tm.id] || DEFAULT_TEAM_COLORS.A;
    const base = tm.baseColor || fallback.base;
    const live = tm.liveColor || fallback.live;
    const row = document.createElement('div');
    row.className = 'ad-team-row';
    row.innerHTML = `
      <div class="ad-palette-dot" style="background:linear-gradient(135deg,${base} 50%,${live} 50%)"></div>
      <input type="text" data-idx="${idx}" data-field="name" value="${(tm.name || '').replace(/"/g, '&quot;')}" placeholder="Hold-navn" />
      <span class="ad-color-pair">
        <input type="color" data-idx="${idx}" data-field="baseColor" value="${base}" title="Pre-event farve (mørk)" />
        <input type="color" data-idx="${idx}" data-field="liveColor" value="${live}" title="Live-auktion farve (lys)" />
      </span>
      <input type="number" data-idx="${idx}" data-field="preAmount" value="${tm.preAmount || 0}" min="0" step="500" placeholder="pre kr" />
      <span class="ad-lot-pair">
        ${(() => {
          const existing = tm.lotIds && tm.lotIds.length ? [...tm.lotIds] : (tm.lotId ? [tm.lotId] : []);
          // Render every existing lot + one trailing blank slot so the
          // operator can always add another. Cap to 12 to keep the row
          // tractable.
          const slotCount = Math.min(12, existing.length + 1);
          let out = '';
          for (let i = 0; i < slotCount; i++) {
            const current = existing[i] || '';
            out += `<select data-idx="${idx}" data-field="lotSlot" data-slot="${i}">
              <option value="">(lot ${i + 1})</option>
              ${lots.map(l => `<option value="${l.id}" ${current === l.id ? 'selected' : ''}>${(l.title || l.id).slice(0, 22)}</option>`).join('')}
            </select>`;
          }
          return out;
        })()}
      </span>
      <input type="text" class="ad-lot-title" data-idx="${idx}" data-field="lotTitle" value="${(tm.lot?.title || '').replace(/"/g, '&quot;')}" placeholder="Lot-titel (vises i pause/auction)" />
      <input type="text" class="ad-lot-desc" data-idx="${idx}" data-field="lotDesc" value="${(tm.lot?.description || '').replace(/"/g, '&quot;')}" placeholder="Lot-beskrivelse" />
    `;
    adTeamsListEl.appendChild(row);
  });
}
adTeamsListEl.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  const idx = parseInt(t.dataset.idx || '-1', 10);
  if (idx < 0 || !adTeamsDraft[idx]) return;
  const field = t.dataset.field!;
  const tm = adTeamsDraft[idx];
  if (field === 'name') tm.name = t.value;
  else if (field === 'baseColor') tm.baseColor = t.value;
  else if (field === 'liveColor') tm.liveColor = t.value;
  else if (field === 'preAmount') tm.preAmount = parseInt(t.value, 10) || 0;
  else if (field === 'lotSlot') {
    const slot = parseInt((t as HTMLSelectElement).dataset.slot || '0', 10);
    const current = tm.lotIds ? [...tm.lotIds] : (tm.lotId ? [tm.lotId] : []);
    while (current.length <= slot) current.push('');
    current[slot] = t.value;
    tm.lotIds = current.filter(Boolean);
    tm.lotId = undefined;     // migrate legacy field
    // Re-render so a fresh trailing empty slot appears once the operator
    // just picked the previously-blank one.
    renderAdTeamsList();
  }
  else if (field === 'lotId') tm.lotId = t.value || undefined;
  else if (field === 'lotTitle') { tm.lot = { ...(tm.lot || {}), title: t.value }; }
  else if (field === 'lotDesc') { tm.lot = { ...(tm.lot || {}), description: t.value }; }
  setDirty(true);
  // Don't re-render the whole list on every color tick — that would
  // destroy the active <input type="color"> popover. Just patch the
  // palette dot in place.
  if (field === 'baseColor' || field === 'liveColor') {
    const row = (t.closest('.ad-team-row') as HTMLElement | null);
    const dot = row?.querySelector('.ad-palette-dot') as HTMLElement | null;
    if (dot) {
      const base = tm.baseColor || '#888';
      const live = tm.liveColor || '#ccc';
      dot.style.background = `linear-gradient(135deg, ${base} 50%, ${live} 50%)`;
    }
  }
  refreshPreview();
});
function populateAuctionDisplayForm(item: AuctionDisplayItem) {
  editIdEl.textContent = item.id;
  editDisplayNumEl.textContent = 'AD';
  deleteBtn.style.display = 'inline-flex';
  duplicateBtn.style.display = 'inline-flex';
  resetFocalBtn.style.display = 'none';
  adActiveEl.checked = !!item.active;
  adLabelEl.value = item.label ?? '';
  adScreenEl.value = item.screen || 'intro';
  // Teams live globally in EVENT_META (shared across all AD slides).
  const teams = (EVENT_META.teams && EVENT_META.teams.length) ? EVENT_META.teams : defaultTeams();
  adTeamsDraft = teams.map(t => ({ ...t, lot: t.lot ? { ...t.lot } : { title: '', description: '' } }));
  renderAdTeamsList();
  // State now lives per-item.
  adActiveLotEl.value = String(item.activeLot ?? 0);
  adRevealCountEl.value = String(item.revealCount ?? 0);
  adRankingEl.checked = item.ranking ?? false;
  adNamesVisibleEl.checked = item.namesVisible ?? true;
  adShowBaseLabelEl.checked = item.showBaseLabel ?? true;
}
function readAuctionDisplayItem(): Partial<AuctionDisplayItem> {
  return {
    active: adActiveEl.checked,
    label: adLabelEl.value,
    screen: adScreenEl.value as any,
    activeLot: parseInt(adActiveLotEl.value, 10) || 0,
    revealCount: parseInt(adRevealCountEl.value, 10) || 0,
    ranking: adRankingEl.checked,
    namesVisible: adNamesVisibleEl.checked,
    showBaseLabel: adShowBaseLabelEl.checked,
  };
}
function readAuctionDisplayMeta(): { teams: AuctionTeam[] } {
  // State now lives on the item itself; meta only holds the global team
  // roster + lot bindings shared across every AD slide.
  return { teams: adTeamsDraft };
}
function adOnChange() { setDirty(true); refreshPreview(); }
[adActiveEl, adLabelEl, adScreenEl, adActiveLotEl, adRevealCountEl, adRankingEl, adNamesVisibleEl, adShowBaseLabelEl]
  .forEach(el => el.addEventListener('input', adOnChange));
adSaveBtn.addEventListener('click', async () => {
  if (!selectedId) return;
  try {
    statusEl.textContent = 'Gemmer auktion-display + hold-config…';
    // PUT item
    const updated = await api(`/api/lots/${encodeURIComponent(selectedId)}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(readAuctionDisplayItem()),
    });
    const idx = itemsBank.findIndex(i => i.id === selectedId);
    if (idx >= 0) itemsBank[idx] = updated;
    // PUT meta
    const meta = readAuctionDisplayMeta();
    console.log('[gen] PUT /api/meta teams', meta.teams.map(t => ({ id: t.id, base: t.baseColor, live: t.liveColor })));
    await fetch('/api/meta', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(meta),
    });
    // Update local EVENT_META mirror so preview/render stays fresh
    EVENT_META.teams = meta.teams;
    setDirty(false);
    renderList();
    refreshPreview();
    statusEl.textContent = 'Gemt';
  } catch (e: any) {
    statusEl.textContent = 'Save failed: ' + e.message;
  }
});

// ---- Media form ----
function populateMediaForm(item: MediaItem) {
  editIdEl.textContent = item.id;
  editDisplayNumEl.textContent = 'MD';
  deleteBtn.style.display = 'inline-flex';
  duplicateBtn.style.display = 'inline-flex';
  resetFocalBtn.style.display = 'none';
  mdActiveEl.checked = !!item.active;
  mdLabelEl.value    = item.label ?? '';
  mdModeEl.value     = item.mode  ?? 'image';
  mdSrcEl.value      = item.src   ?? '';
  mdAltEl.value      = item.alt   ?? '';
  mdFitEl.value      = item.fit   ?? 'cover';
  mdBgEl.value       = item.bgColor ?? '#000000';
  mdAutoplayEl.checked = item.videoAutoplay ?? true;
  mdLoopEl.checked     = item.videoLoop     ?? false;
  mdMutedEl.checked    = item.videoMuted    ?? true;
  mdShowTickerEl.checked = item.showTicker !== false;
  mdVideoOptsEl.style.display = mdModeEl.value === 'video' ? '' : 'none';
}
function readMediaForm(): Partial<MediaItem> {
  return {
    active: mdActiveEl.checked,
    label:  mdLabelEl.value,
    mode:   mdModeEl.value as any,
    src:    mdSrcEl.value,
    alt:    mdAltEl.value,
    fit:    mdFitEl.value as any,
    bgColor: mdBgEl.value,
    videoAutoplay: mdAutoplayEl.checked,
    videoLoop:     mdLoopEl.checked,
    videoMuted:    mdMutedEl.checked,
    showTicker:    mdShowTickerEl.checked,
  };
}
function mdOnChange() {
  mdVideoOptsEl.style.display = mdModeEl.value === 'video' ? '' : 'none';
  setDirty(true);
  refreshPreview();
}
[mdActiveEl, mdLabelEl, mdModeEl, mdSrcEl, mdAltEl, mdFitEl, mdBgEl, mdAutoplayEl, mdLoopEl, mdMutedEl, mdShowTickerEl]
  .forEach(el => el.addEventListener('input', mdOnChange));
mdUploadEl.addEventListener('change', async () => {
  const file = mdUploadEl.files?.[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('kind', 'media');
  fd.append('file', file);
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (data && data.filename) {
      mdSrcEl.value = `/assets/media/${data.filename}`;
      // Auto-detect mode by extension
      if (/\.(mp4|webm|mov|m4v|ogv)$/i.test(data.filename)) mdModeEl.value = 'video';
      else mdModeEl.value = 'image';
      mdOnChange();
    }
  } catch (e: any) { statusEl.textContent = 'Media upload failed: ' + e.message; }
  mdUploadEl.value = '';
});
mdSaveBtn.addEventListener('click', async () => {
  if (!selectedId) return;
  const patch = readMediaForm();
  try {
    statusEl.textContent = 'Gemmer media…';
    const updated = await api(`/api/lots/${encodeURIComponent(selectedId)}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const idx = itemsBank.findIndex(i => i.id === selectedId);
    if (idx >= 0) itemsBank[idx] = updated;
    setDirty(false);
    renderList();
    refreshPreview();
    statusEl.textContent = 'Gemt';
  } catch (e: any) {
    statusEl.textContent = 'Save failed: ' + e.message;
  }
});

// ---- Wish-loop form ----
async function loadApplePool() {
  try {
    const res = await fetch('/api/apples');
    const data = await res.json();
    wlApplePool = (data.files || []).sort();
  } catch { wlApplePool = []; }
}
function renderWishLoopAppleList() {
  wlAppleListEl.innerHTML = '';
  // Always render the pool in its native (alphabetical) order so tiles
  // stay put when clicked — selected state is signalled by colour + the
  // pick-index badge, not by reordering. Files that are selected but no
  // longer in the pool are appended at the end so they stay visible.
  const selectedFnames = wlSelectedCards.map(c => (c.src || '').split('/').pop() || '');
  const poolSet = new Set(wlApplePool);
  const orphanSelected = selectedFnames.filter(f => f && !poolSet.has(f));
  const ordered = [...wlApplePool, ...orphanSelected];
  ordered.forEach((fname) => {
    if (!fname) return;
    const pickIdx = selectedFnames.indexOf(fname);
    const selected = pickIdx >= 0;
    const li = document.createElement('li');
    li.dataset.fname = fname;
    if (selected) li.classList.add('selected');
    const m = fname.match(/^apple-(\d+)-(.+)\.png$/i);
    const num = m ? m[1] : '';
    const name = m ? m[2].replace(/_/g, ' ') : fname.replace(/\.png$/i, '');
    li.innerHTML = `
      <img src="/assets/apples/${encodeURIComponent(fname)}" alt="" />
      <div class="wl-fname"><span class="num">${num}</span>${name}</div>
      ${selected ? `<span class="wl-pick-idx">${pickIdx + 1}</span>` : ''}
    `;
    wlAppleListEl.appendChild(li);
  });
}
function populateWishLoopForm(item: WishLoopItem) {
  editIdEl.textContent = item.id;
  editDisplayNumEl.textContent = 'ØT';
  deleteBtn.style.display = 'inline-flex';
  duplicateBtn.style.display = 'inline-flex';
  resetFocalBtn.style.display = 'none';
  wlActiveEl.checked = !!item.active;
  wlLabelEl.value     = item.label     ?? '';
  wlSponsorEl.value   = item.sponsorMark ?? 'Ønskeskyen';
  wlEyebrowPreEl.value    = item.eyebrowPretitle ?? 'Stjernegolf 2026 · Auktion';
  wlEyebrowTitleEl.value  = item.eyebrowTitle    ?? 'Børnenes ønsker';
  wlSponsorEnabledEl.checked = item.sponsorEnabled ?? true;
  wlSponsorPreEl.value    = item.sponsorPretitle ?? 'Præsenteret af';
  wlSponsorModeEl.value   = item.sponsorMode     ?? 'text';
  wlSponsorLogoEl.value   = item.sponsorLogo     ?? '';
  wlVideoSrcEl.value  = item.videoSrc  ?? '';
  wlDirectionEl.value = item.direction ?? 'stack';
  wlStackDepthEl.value = String(item.stackDepth ?? 3);
  wlPerCardEl.value    = String(item.perCardSeconds ?? 5);
  wlPerCardValEl.textContent = `${wlPerCardEl.value}s`;
  wlBlurEl.value       = String(item.videoBlur ?? 36);
  wlBlurValEl.textContent = `${wlBlurEl.value}px`;
  wlDarkenEl.value     = String(item.videoDarken ?? 0.5);
  wlDarkenValEl.textContent = parseFloat(wlDarkenEl.value).toFixed(2);
  wlChromeEl.checked     = item.chrome ?? true;
  wlPauseHoverEl.checked = item.pauseOnHover ?? true;
  wlShowTickerEl.checked = item.showTicker !== false;
  wlSelectedCards = (item.cards || []).map(c => ({ ...c }));
  renderWishLoopAppleList();
}
function readWishLoopForm(): Partial<WishLoopItem> {
  return {
    active: wlActiveEl.checked,
    label:  wlLabelEl.value,
    sponsorMark: wlSponsorEl.value,
    eyebrowPretitle: wlEyebrowPreEl.value,
    eyebrowTitle:    wlEyebrowTitleEl.value,
    sponsorEnabled:  wlSponsorEnabledEl.checked,
    sponsorPretitle: wlSponsorPreEl.value,
    sponsorMode:     wlSponsorModeEl.value as any,
    sponsorLogo:     wlSponsorLogoEl.value,
    videoSrc: wlVideoSrcEl.value,
    direction: wlDirectionEl.value as any,
    stackDepth: parseInt(wlStackDepthEl.value, 10) || 3,
    perCardSeconds: parseInt(wlPerCardEl.value, 10) || 5,
    videoBlur: parseFloat(wlBlurEl.value) || 0,
    videoDarken: parseFloat(wlDarkenEl.value) || 0,
    chrome: wlChromeEl.checked,
    pauseOnHover: wlPauseHoverEl.checked,
    showTicker: wlShowTickerEl.checked,
    cards: wlSelectedCards,
  };
}
function wlOnChange() { setDirty(true); refreshPreview(); }
[wlActiveEl, wlLabelEl, wlSponsorEl, wlVideoSrcEl, wlDirectionEl, wlStackDepthEl, wlChromeEl, wlPauseHoverEl, wlShowTickerEl,
 wlEyebrowPreEl, wlEyebrowTitleEl, wlSponsorEnabledEl, wlSponsorPreEl, wlSponsorModeEl, wlSponsorLogoEl]
  .forEach(el => el.addEventListener('input', wlOnChange));
wlPerCardEl.addEventListener('input', () => { wlPerCardValEl.textContent = `${wlPerCardEl.value}s`; wlOnChange(); });
wlBlurEl.addEventListener('input', () => { wlBlurValEl.textContent = `${wlBlurEl.value}px`; wlOnChange(); });
wlDarkenEl.addEventListener('input', () => { wlDarkenValEl.textContent = parseFloat(wlDarkenEl.value).toFixed(2); wlOnChange(); });

// Apple tile click → toggle selection
wlAppleListEl.addEventListener('click', (e) => {
  const li = (e.target as HTMLElement).closest<HTMLLIElement>('li');
  if (!li || !li.dataset.fname) return;
  const fname = li.dataset.fname;
  const fnames = wlSelectedCards.map(c => (c.src || '').split('/').pop() || '');
  const idx = fnames.indexOf(fname);
  if (idx >= 0) {
    wlSelectedCards.splice(idx, 1);
  } else {
    const child = fname.replace(/^apple-\d+-/, '').replace(/\.png$/i, '').replace(/_/g, ' ');
    wlSelectedCards.push({
      id: wlSelectedCards.length + 1,
      src: `/assets/apples/${fname}`,
      alt: child,
    });
  }
  renderWishLoopAppleList();
  wlOnChange();
});
// Drag-reorder among selected tiles
let wlDragFname: string | null = null;
wlAppleListEl.addEventListener('dragstart', (e) => {
  const li = (e.target as HTMLElement).closest<HTMLLIElement>('li.selected');
  if (!li || !li.dataset.fname) return;
  wlDragFname = li.dataset.fname;
  li.classList.add('dragging');
  e.dataTransfer?.setData('text/plain', wlDragFname);
});
wlAppleListEl.addEventListener('dragover', (e) => {
  e.preventDefault();
  wlAppleListEl.querySelectorAll('li.drag-over').forEach(el => el.classList.remove('drag-over'));
  const li = (e.target as HTMLElement).closest<HTMLLIElement>('li.selected');
  if (li) li.classList.add('drag-over');
});
wlAppleListEl.addEventListener('dragend', () => {
  wlAppleListEl.querySelectorAll('li').forEach(el => el.classList.remove('dragging', 'drag-over'));
  wlDragFname = null;
});
wlAppleListEl.addEventListener('drop', (e) => {
  e.preventDefault();
  if (!wlDragFname) return;
  const targetLi = (e.target as HTMLElement).closest<HTMLLIElement>('li.selected');
  if (!targetLi || !targetLi.dataset.fname) return;
  const fnames = wlSelectedCards.map(c => (c.src || '').split('/').pop() || '');
  const fromIdx = fnames.indexOf(wlDragFname);
  const toIdx = fnames.indexOf(targetLi.dataset.fname);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
  const [moved] = wlSelectedCards.splice(fromIdx, 1);
  wlSelectedCards.splice(toIdx, 0, moved);
  wlDragFname = null;
  renderWishLoopAppleList();
  wlOnChange();
});
// Upload æbler til pool
wlAppleUploadEl.addEventListener('change', async () => {
  const files = Array.from(wlAppleUploadEl.files || []);
  if (!files.length) return;
  for (const file of files) {
    const fd = new FormData();
    fd.append('kind', 'apple');
    fd.append('file', file);
    try { await fetch('/api/upload', { method: 'POST', body: fd }); }
    catch (e: any) { statusEl.textContent = 'Apple upload failed: ' + e.message; }
  }
  wlAppleUploadEl.value = '';
  await loadApplePool();
  renderWishLoopAppleList();
});
// Upload sponsor-logo PNG / SVG (auto-saves to item)
wlSponsorLogoUploadEl.addEventListener('change', async () => {
  const file = wlSponsorLogoUploadEl.files?.[0];
  if (!file) return;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const fd = new FormData();
  // Multer's destination() runs as soon as the file part arrives; req.body
  // is only populated from fields parsed *before* the file. Append kind
  // first so multer sees req.body.kind when it picks a destination.
  fd.append('kind', 'wish-bg');
  fd.append('file', new File([file], safeName, { type: file.type }));
  statusEl.textContent = `Uploader logo (${safeName})…`;
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && data.filename) {
      const url = `/assets/wish-loop/${data.filename}`;
      wlSponsorLogoEl.value = url;
      wlSponsorModeEl.value = 'logo';
      // Persist immediately so the item carries the new logo across reloads.
      if (selectedId) {
        try {
          const updated = await api(`/api/lots/${encodeURIComponent(selectedId)}`, {
            method: 'PUT', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sponsorLogo: url, sponsorMode: 'logo' }),
          });
          const idx = itemsBank.findIndex(i => i.id === selectedId);
          if (idx >= 0) itemsBank[idx] = updated;
        } catch {}
      }
      refreshPreview();
      statusEl.textContent = `Logo gemt: ${data.filename}`;
    } else {
      statusEl.textContent = 'Logo upload: ingen filename i svar';
    }
  } catch (e: any) {
    statusEl.textContent = 'Logo upload failed: ' + (e?.message || e);
  }
  wlSponsorLogoUploadEl.value = '';
});

// Upload baggrundsvideo
wlVideoUploadEl.addEventListener('change', async () => {
  const file = wlVideoUploadEl.files?.[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('kind', 'wish-bg');
  fd.append('file', file);
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (data && data.filename) {
      wlVideoSrcEl.value = `/assets/wish-loop/${data.filename}`;
      wlOnChange();
    }
  } catch (e: any) { statusEl.textContent = 'Video upload failed: ' + e.message; }
  wlVideoUploadEl.value = '';
});
wlSaveBtn.addEventListener('click', async () => {
  if (!selectedId) return;
  const patch = readWishLoopForm();
  try {
    statusEl.textContent = 'Gemmer wish-loop…';
    const updated = await api(`/api/lots/${encodeURIComponent(selectedId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const idx = itemsBank.findIndex(i => i.id === selectedId);
    if (idx >= 0) itemsBank[idx] = updated;
    setDirty(false);
    renderList();
    refreshPreview();
    statusEl.textContent = 'Gemt';
  } catch (e: any) {
    statusEl.textContent = 'Save failed: ' + e.message;
  }
});
loadApplePool();

// ---- Sponsor-index form ----
function populateSponsorIndexForm(item: SponsorIndexItem) {
  editIdEl.textContent = item.id;
  editDisplayNumEl.textContent = 'SI';
  deleteBtn.style.display = 'inline-flex';
  duplicateBtn.style.display = 'inline-flex';
  resetFocalBtn.style.display = 'none';
  siActiveEl.checked = !!item.active;
  siLabelEl.value = item.label ?? '';
  siTitleEl.value = item.title ?? '';
}
function readSponsorIndexForm(): Partial<SponsorIndexItem> {
  return {
    active: siActiveEl.checked,
    label:  siLabelEl.value,
    title:  siTitleEl.value,
  };
}
[siActiveEl, siLabelEl, siTitleEl]
  .forEach(el => el.addEventListener('input', () => { setDirty(true); refreshPreview(); }));
siSaveBtn.addEventListener('click', async () => {
  if (!selectedId) return;
  const patch = readSponsorIndexForm();
  try {
    statusEl.textContent = 'Gemmer sponsor-indeks…';
    const updated = await api(`/api/lots/${encodeURIComponent(selectedId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const idx = itemsBank.findIndex(i => i.id === selectedId);
    if (idx >= 0) itemsBank[idx] = updated;
    setDirty(false);
    renderList();
    refreshPreview();
    statusEl.textContent = 'Gemt';
  } catch (e: any) {
    statusEl.textContent = 'Save failed: ' + e.message;
  }
});

bpSaveBtn.addEventListener('click', async () => {
  if (!selectedId) return;
  const patch = readBordplanForm();
  try {
    statusEl.textContent = 'Gemmer bordplan…';
    const updated = await api(`/api/lots/${encodeURIComponent(selectedId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const idx = itemsBank.findIndex(i => i.id === selectedId);
    if (idx >= 0) itemsBank[idx] = updated;
    setDirty(false);
    renderList();
    refreshPreview();
    statusEl.textContent = 'Gemt';
    bpSaveMetaEl.className = 'gen-save-meta saved';
    bpSaveMetaEl.textContent = 'GEMT';
  } catch (e: any) {
    statusEl.textContent = 'Save failed: ' + e.message;
  }
});

// ---- Form bindings ----
function onFormChange() {
  setDirty(true);
  refreshPreview();
  renderValidation();
}
[fActive, fExtra, fExtraSuffix, fTitle, fSubtitle, fSponsor, fBullets, fDonorNames, fLayout, fMirrored, fTitleSize, fSponsorStack]
  .forEach(el => el.addEventListener('input', onFormChange));
fExtra.addEventListener('change', () => {
  rowExtraSuffix.style.display = fExtra.checked ? '' : 'none';
});
[fFocalX, fFocalY].forEach(el => el.addEventListener('input', () => {
  fFocalXVal.textContent = fFocalX.value + '%';
  fFocalYVal.textContent = fFocalY.value + '%';
  onFormChange();
}));
fScale.addEventListener('input', () => {
  fScaleVal.textContent = fScale.value + '%';
  onFormChange();
});
// Multi-image: focal/scale/split for every image (image 1 also wired here for
// its split slider; its focal/scale are wired just above).
heroCtls.forEach((c, i) => {
  if (i > 0) {
    [c.fx, c.fy].forEach(el => el.addEventListener('input', () => {
      c.fxVal.textContent = c.fx.value + '%';
      c.fyVal.textContent = c.fy.value + '%';
      onFormChange();
    }));
    c.scale.addEventListener('input', () => { c.scaleVal.textContent = c.scale.value + '%'; onFormChange(); });
  }
  c.split.addEventListener('input', () => { c.splitVal.textContent = c.split.value; onFormChange(); });
});
fImgCount.addEventListener('change', () => {
  applyImgCount(parseInt(fImgCount.value, 10) || 1);
  onFormChange();
});
fHorizonCap.addEventListener('input', () => {
  fHorizonCapVal.textContent = `${fHorizonCap.value}in`;
  onFormChange();
});
fProfilePhoto.addEventListener('input', () => {
  fProfilePhotoVal.textContent = `${fProfilePhoto.value}in`;
  onFormChange();
});
// Toggle slider visibility when layout switches.
fLayout.addEventListener('change', () => {
  const isHorizon = fLayout.value === 'horizon';
  rowHorizonCap.style.display = isHorizon ? '' : 'none';
  rowProfilePhoto.style.display = isHorizon ? 'none' : '';
  applyImgCount(parseInt(fImgCount.value, 10) || 1);  // refresh side-om-side/stablet hint
});

// ---- Save ----
saveBtn.addEventListener('click', async () => {
  if (!selectedId) return;
  if (!renderValidation()) {
    statusEl.textContent = 'Kan ikke gemme — ret fejl først';
    return;
  }
  const patch = readForm();
  try {
    statusEl.textContent = 'Gemmer…';
    const updated = await api(`/api/lots/${encodeURIComponent(selectedId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    // Refresh BOTH banks — selection/populate reads itemsBank, so updating
    // only lotsBank left a stale copy that reverted edits on re-select.
    const lotIdx = lotsBank.findIndex(l => l.id === selectedId);
    if (lotIdx >= 0) lotsBank[lotIdx] = updated;
    const itemIdx = itemsBank.findIndex(i => i.id === selectedId);
    if (itemIdx >= 0) itemsBank[itemIdx] = updated;
    setDirty(false);
    renderList();
    refreshPreview();
    statusEl.textContent = 'Gemt';
  } catch (e: any) {
    statusEl.textContent = 'Save failed: ' + e.message;
  }
});

// ---- New / Delete ----
// ---- Carousel (billedkarrusel) editor ----
function populateCarouselForm(item: any) {
  crActiveEl.checked = item.active ?? true;
  crLabelEl.value = item.label ?? '';
  crFadeMsEl.value = String(item.fadeMs ?? 800);
  crDefaultSecondsEl.value = String(item.defaultSeconds ?? 5);
  crBgColorEl.value = (typeof item.bgColor === 'string' && /^#[0-9a-f]{6}$/i.test(item.bgColor))
    ? item.bgColor
    : '#000000';
  crShowTickerEl.checked = !!item.showTicker;
  crImagesDraft = Array.isArray(item.images)
    ? item.images.map((im: any) => ({ src: String(im.src || ''), seconds: Number(im.seconds) || undefined, alt: im.alt }))
    : [];
  renderCarouselImageList();
}
function readCarouselForm(): any {
  const fadeMs = parseInt(crFadeMsEl.value, 10);
  const defaultSec = parseFloat(crDefaultSecondsEl.value);
  return {
    active: crActiveEl.checked,
    label: crLabelEl.value.trim() || 'Billedkarrusel',
    fadeMs: Number.isFinite(fadeMs) && fadeMs > 0 ? fadeMs : 800,
    defaultSeconds: Number.isFinite(defaultSec) && defaultSec > 0 ? defaultSec : 5,
    bgColor: crBgColorEl.value || '#000',
    showTicker: crShowTickerEl.checked,
    images: crImagesDraft.map(im => ({
      src: im.src,
      ...(Number(im.seconds) > 0 ? { seconds: Number(im.seconds) } : {}),
      ...(im.alt ? { alt: im.alt } : {}),
    })),
  };
}
function renderCarouselImageList() {
  if (!crImagesDraft.length) {
    crImageListEl.innerHTML = '<div style="font-style:italic;color:rgba(228,223,200,0.7);padding:6px 4px">Ingen billeder endnu — upload nogle nedenfor.</div>';
    return;
  }
  crImageListEl.innerHTML = crImagesDraft.map((im, i) => `
    <div class="carousel-row" data-idx="${i}" style="display:flex;align-items:center;gap:8px;padding:4px;background:rgba(255,255,255,0.04);border-radius:6px">
      <img src="${im.src}" alt="" style="width:64px;height:40px;object-fit:contain;background:#000;border-radius:4px" />
      <span class="carousel-fname" style="flex:1;font-size:11px;opacity:0.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${im.src.split('/').pop() || im.src}</span>
      <label style="font-size:11px;opacity:0.8;display:flex;align-items:center;gap:4px">sek
        <input type="number" class="carousel-seconds" min="0" max="120" step="0.5" value="${im.seconds ?? ''}" placeholder="auto" style="width:60px" />
      </label>
      <button type="button" class="link-btn carousel-up" title="Op">↑</button>
      <button type="button" class="link-btn carousel-down" title="Ned">↓</button>
      <button type="button" class="drawer-danger carousel-del" title="Slet">✕</button>
    </div>
  `).join('');
}
crImageListEl.addEventListener('input', (e) => {
  const target = e.target as HTMLElement;
  if (!target.classList.contains('carousel-seconds')) return;
  const row = target.closest<HTMLElement>('.carousel-row');
  if (!row) return;
  const idx = parseInt(row.dataset.idx || '0', 10);
  const v = parseFloat((target as HTMLInputElement).value);
  crImagesDraft[idx].seconds = Number.isFinite(v) && v > 0 ? v : undefined;
  setDirty(true);
  refreshPreview();
});
crImageListEl.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const row = t.closest<HTMLElement>('.carousel-row');
  if (!row) return;
  const idx = parseInt(row.dataset.idx || '0', 10);
  if (t.classList.contains('carousel-del')) {
    crImagesDraft.splice(idx, 1);
  } else if (t.classList.contains('carousel-up') && idx > 0) {
    [crImagesDraft[idx - 1], crImagesDraft[idx]] = [crImagesDraft[idx], crImagesDraft[idx - 1]];
  } else if (t.classList.contains('carousel-down') && idx < crImagesDraft.length - 1) {
    [crImagesDraft[idx + 1], crImagesDraft[idx]] = [crImagesDraft[idx], crImagesDraft[idx + 1]];
  } else {
    return;
  }
  renderCarouselImageList();
  setDirty(true);
  refreshPreview();
});
crImageUploadEl.addEventListener('change', async () => {
  const files = Array.from(crImageUploadEl.files || []);
  if (!files.length) return;
  for (const file of files) {
    const fd = new FormData();
    fd.append('kind', 'carousel');
    fd.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data?.filename) crImagesDraft.push({ src: `/assets/carousel/${data.filename}` });
    } catch (e: any) { statusEl.textContent = 'Upload failed: ' + e.message; }
  }
  crImageUploadEl.value = '';
  renderCarouselImageList();
  setDirty(true);
  refreshPreview();
});
[crActiveEl, crLabelEl, crFadeMsEl, crDefaultSecondsEl, crBgColorEl, crShowTickerEl]
  .forEach(el => el.addEventListener('input', () => { setDirty(true); refreshPreview(); }));
crSaveBtn.addEventListener('click', async () => {
  if (!selectedId) return;
  try {
    statusEl.textContent = 'Gemmer billedkarrusel…';
    const updated = await api(`/api/lots/${encodeURIComponent(selectedId)}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(readCarouselForm()),
    });
    const idx = itemsBank.findIndex(i => i.id === selectedId);
    if (idx >= 0) itemsBank[idx] = updated;
    setDirty(false);
    renderList();
    refreshPreview();
    statusEl.textContent = 'Gemt';
  } catch (e: any) {
    statusEl.textContent = 'Save failed: ' + e.message;
  }
});

const newCarouselBtn = document.getElementById('new-carousel')!;
newCarouselBtn.addEventListener('click', async () => {
  try {
    const created = await api('/api/lots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'carousel',
        active: true,
        label: `Billedkarrusel ${itemsBank.filter(i => (i as any).kind === 'carousel').length + 1}`,
        images: [],
        defaultSeconds: 5,
        fadeMs: 800,
        bgColor: '#000',
        showTicker: false,
      } as any),
    });
    itemsBank.push(created);
    selectedId = created.id;
    renderList();
    selectLot(created.id);
    statusEl.textContent = 'Billedkarrusel oprettet';
  } catch (e: any) {
    statusEl.textContent = 'Create failed: ' + e.message;
  }
});

const newAuctionDisplayBtn = document.getElementById('new-auctiondisplay')!;
newAuctionDisplayBtn.addEventListener('click', async () => {
  try {
    const created = await api('/api/lots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'auction-display',
        active: true,
        label: `Auktion-display ${itemsBank.filter(i => (i as any).kind === 'auction-display').length + 1}`,
        screen: 'intro',
        activeLot: 0,
        revealCount: 0,
        ranking: false,
        namesVisible: true,
        showBaseLabel: true,
      } as any),
    });
    itemsBank.push(created);
    selectedId = created.id;
    renderList();
    selectLot(created.id);
    statusEl.textContent = 'Auktion-display oprettet';
  } catch (e: any) {
    statusEl.textContent = 'Create failed: ' + e.message;
  }
});

const newMediaBtn = document.getElementById('new-media')!;
newMediaBtn.addEventListener('click', async () => {
  try {
    const created = await api('/api/lots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'media',
        active: true,
        label: 'Media',
        mode: 'image',
        src: '',
        fit: 'cover',
        bgColor: '#000000',
      } as any),
    });
    itemsBank.push(created);
    selectedId = created.id;
    renderList();
    selectLot(created.id);
    statusEl.textContent = 'Media oprettet';
  } catch (e: any) {
    statusEl.textContent = 'Create failed: ' + e.message;
  }
});

const newWishLoopBtn = document.getElementById('new-wishloop')!;
newWishLoopBtn.addEventListener('click', async () => {
  try {
    const created = await api('/api/lots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'wish-loop',
        active: true,
        label: `Ønske-loop ${itemsBank.filter(i => (i as any).kind === 'wish-loop').length + 1}`,
        videoSrc: '/assets/wish-loop/bg.mp4',
        cards: [],
        direction: 'stack',
        perCardSeconds: 5,
        stackDepth: 3,
        pauseOnHover: true,
        videoBlur: 36,
        videoDarken: 0.5,
        chrome: true,
        sponsorMark: 'Ønskeskyen',
      } as any),
    });
    itemsBank.push(created);
    selectedId = created.id;
    renderList();
    selectLot(created.id);
    statusEl.textContent = 'Ønske-loop oprettet';
  } catch (e: any) {
    statusEl.textContent = 'Create failed: ' + e.message;
  }
});

const newSponsorIndexBtn = document.getElementById('new-sponsorindex')!;
newSponsorIndexBtn.addEventListener('click', async () => {
  try {
    const created = await api('/api/lots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'sponsor-index',
        active: true,
        label: 'Sponsor-indeks',
        title: 'AUKTIONENS SPONSORER',
      } as any),
    });
    itemsBank.push(created);
    selectedId = created.id;
    renderList();
    selectLot(created.id);
    statusEl.textContent = 'Sponsor-indeks oprettet';
  } catch (e: any) {
    statusEl.textContent = 'Create failed: ' + e.message;
  }
});

const newClosingBtn = document.getElementById('new-closing')!;
const DEFAULT_CLOSING_LOGOS_SEED = [
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
newClosingBtn.addEventListener('click', async () => {
  try {
    const created = await api('/api/lots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'closing',
        active: true,
        label: 'Closing',
        title: 'TAK TIL ALLE VORES SPONSORER',
        tagline: '@KIDSAIDDK · KIDSAID DANMARK',
        cols: 8,
        logos: DEFAULT_CLOSING_LOGOS_SEED,
      } as any),
    });
    itemsBank.push(created);
    selectedId = created.id;
    renderList();
    selectLot(created.id);
    statusEl.textContent = 'Closing oprettet';
  } catch (e: any) {
    statusEl.textContent = 'Create closing failed: ' + e.message;
  }
});

const newCoverBtn = document.getElementById('new-cover')!;
newCoverBtn.addEventListener('click', async () => {
  try {
    const created = await api('/api/lots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'cover',
        active: true,
        label: 'Cover',
        title: 'AUKTION',
        subtitle: 'STJERNEGOLF 2026',
        attribution: 'AUKTION VED KASPER NIELSEN',
        logoFile: 'artsolo-logo.png',
      } as any),
    });
    itemsBank.push(created);
    selectedId = created.id;
    renderList();
    selectLot(created.id);
    statusEl.textContent = 'Cover oprettet';
  } catch (e: any) {
    statusEl.textContent = 'Create cover failed: ' + e.message;
  }
});

const newContestBtn = document.getElementById('new-contest')!;
newContestBtn.addEventListener('click', async () => {
  try {
    const created = await api('/api/lots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'contest',
        active: true,
        label: 'Konkurrence',
        title: 'KONKURRENCE',
        subtitle: '',
        blocks: [{ src: null, heading: '', lines: [] }],
      } as any),
    });
    itemsBank.push(created);
    selectedId = created.id;
    renderList();
    selectLot(created.id);
    statusEl.textContent = 'Konkurrence oprettet';
  } catch (e: any) {
    statusEl.textContent = 'Create konkurrence failed: ' + e.message;
  }
});

const newBordplanBtn = document.getElementById('new-bordplan')!;
newBordplanBtn.addEventListener('click', async () => {
  try {
    const created = await api('/api/lots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'bordplan',
        active: true,
        label: 'Stjernegolf 2026 bordplan',
        eventName: 'STJERNEGOLF 2026',
        config: {
          cols: 9, rows: 11, seatsPerTable: 4,
          colAislesAfter: [],
          rowAislesAfter: [3, 6],
          removedCells: [{ col: 3, row: 10 }, { col: 4, row: 10 }, { col: 5, row: 10 }],
          numbering: {
            mode: 'cluster-continuous', origin: 'top-left',
            direction: 'col-major', clusterDirection: 'col-major',
            startAt: 1, prefix: '', skip: [],
          },
        },
        overrides: {},
      } as any),
    });
    itemsBank.push(created);
    selectedId = created.id;
    renderList();
    selectLot(created.id);
    statusEl.textContent = 'Bordplan oprettet';
  } catch (e: any) {
    statusEl.textContent = 'Create bordplan failed: ' + e.message;
  }
});

newLotBtn.addEventListener('click', async () => {
  try {
    const created = await api('/api/lots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Nyt lot', subtitle: '', sponsor: '', bullets: [],
        active: false, extra: false, layout: 'horizon', focal: '50% 50%',
      }),
    });
    lotsBank.push(created);
    selectedId = created.id;
    renderList();
    populateForm(created);
    refreshPreview();
    statusEl.textContent = 'Oprettet';
  } catch (e: any) {
    statusEl.textContent = 'Create failed: ' + e.message;
  }
});

// ---- Duplicate / Reset focal ----
duplicateBtn.addEventListener('click', async () => {
  if (!selectedId) return;
  const item = itemsBank.find(i => i.id === selectedId);
  if (!item) return;
  if (dirty && !confirm('Du har ugemte ændringer. Duplicate uden at gemme dem?')) return;
  let dup: any;
  if (isBordplanItem(item)) {
    dup = {
      kind: 'bordplan',
      active: false,
      label: (item.label || 'Bordplan') + ' (kopi)',
      eventName: item.eventName,
      org: item.org,
      config: JSON.parse(JSON.stringify(item.config)),
      overrides: JSON.parse(JSON.stringify(item.overrides || {})),
    };
  } else if (isCoverItem(item)) {
    dup = {
      kind: 'cover',
      active: false,
      label: (item.label || 'Cover') + ' (kopi)',
      title: item.title,
      subtitle: item.subtitle,
      attribution: item.attribution,
      logoFile: item.logoFile,
      logoScale: item.logoScale,
    };
  } else {
    const lot = item as Lot;
    dup = { ...lot, title: lot.title + ' (kopi)', active: false };
    delete dup.id;
  }
  try {
    const created = await api('/api/lots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(dup),
    });
    itemsBank.push(created);
    selectedId = created.id;
    renderList();
    selectLot(created.id);
    statusEl.textContent = 'Duplikeret';
  } catch (e: any) {
    statusEl.textContent = 'Duplicate failed: ' + e.message;
  }
});

resetFocalBtn.addEventListener('click', () => {
  fFocalX.value = '50'; fFocalXVal.textContent = '50%';
  fFocalY.value = '50'; fFocalYVal.textContent = '50%';
  fScale.value = '100'; fScaleVal.textContent = '100%';
  onFormChange();
});

deleteBtn.addEventListener('click', async () => {
  if (!selectedId) return;
  const lot = lotsBank.find(l => l.id === selectedId);
  if (!confirm(`Slet "${lot?.title || selectedId}"? Kan ikke fortrydes.`)) return;
  try {
    await api(`/api/lots/${encodeURIComponent(selectedId)}`, { method: 'DELETE' });
    lotsBank = lotsBank.filter(l => l.id !== selectedId);
    selectedId = lotsBank[0]?.id ?? null;
    renderList();
    if (selectedId) selectLot(selectedId);
    else { editIdEl.textContent = '—'; previewFrame.innerHTML = ''; deleteBtn.style.display = 'none'; }
    statusEl.textContent = 'Slettet';
  } catch (e: any) {
    statusEl.textContent = 'Delete failed: ' + e.message;
  }
});

// ---- Uploads ----
async function uploadFile(kind: 'hero' | 'logo', file: File, imgIndex = 1) {
  if (!selectedId) return;
  // Order matters — multer parses fields top-down, and the destination
  // / filename callbacks only see body fields appended BEFORE the file.
  const fd = new FormData();
  fd.append('kind', kind);
  fd.append('lotId', selectedId);
  if (kind === 'hero' && imgIndex > 1) fd.append('imgIndex', String(imgIndex));
  fd.append('file', file);
  try {
    statusEl.textContent = `Uploader ${kind}…`;
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    statusEl.textContent = `${kind} uploadet`;
    const ext = (data.filename?.split('.').pop()?.toLowerCase()) || 'jpg';
    const lot = lotsBank.find(l => l.id === selectedId);
    // Sync the uploaded extension onto the in-memory lot so subsequent renders
    // (and the next save) resolve the right URL without a full reload.
    if (kind === 'hero' && data.filename) {
      if (imgIndex === 1) {
        if (lot) lot.heroExt = ext;
      } else if (lot) {
        lot.heroImages = lot.heroImages || [];
        while (lot.heroImages.length < imgIndex - 1) lot.heroImages.push({});
        lot.heroImages[imgIndex - 2].ext = ext;
      }
    }
    const v = Date.now();
    if (kind === 'hero' && imgIndex === 1) {
      heroPreview.src = `/assets/hero/lot-${selectedId}_FINAL.${lot?.heroExt || 'jpg'}?v=${v}`;
    } else if (kind === 'hero') {
      heroCtls[imgIndex - 1].preview.src = `/assets/hero/lot-${selectedId}_FINAL${imgIndex}.${ext}?v=${v}`;
      setDirty(true);
    } else if (kind === 'logo' && data.filename) {
      // Server now preserves the uploaded extension (so SVG stays SVG).
      // Persist the new URL onto the lot so the renderer uses it instead
      // of the legacy logo-lot-<id>.png default.
      const newUrl = `/assets/logo/${data.filename}`;
      logoPreview.src = `${newUrl}?v=${v}`;
      try {
        const updated = await api(`/api/lots/${encodeURIComponent(selectedId)}`, {
          method: 'PUT', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sponsorLogoSrc: newUrl }),
        });
        const idx = itemsBank.findIndex(i => i.id === selectedId);
        if (idx >= 0) itemsBank[idx] = updated;
        const lotIdx = lotsBank.findIndex(l => l.id === selectedId);
        if (lotIdx >= 0) lotsBank[lotIdx] = updated;
      } catch {}
    }
    refreshPreview();
  } catch (e: any) {
    statusEl.textContent = 'Upload failed: ' + e.message;
  }
}
fHero.addEventListener('change', () => { if (fHero.files?.[0]) uploadFile('hero', fHero.files[0]); });
fLogo.addEventListener('change', () => { if (fLogo.files?.[0]) uploadFile('logo', fLogo.files[0]); });
// Image 2 & 3 uploads (index 1/2 of heroCtls -> image 2/3).
heroCtls.forEach((c, i) => {
  if (i === 0) return;
  c.upload.addEventListener('change', () => { if (c.upload.files?.[0]) uploadFile('hero', c.upload.files[0], i + 1); });
});

// ---- Open controller in new window ----
openCtrlBtn.addEventListener('click', () => {
  window.open('/controller.html', '_blank', 'noopener,noreferrer');
});

// ---- Boot ----
loadBank();
