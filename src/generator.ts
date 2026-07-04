// Lot Generator v2 — operator UI for editing the deck live.
// Design: design_handoff_generator_v2 (cream paper, 3-column editor).
// Reads + writes through /api/lots; broadcasts ws 'lots-updated' on save so
// viewer / auctioneer / controller refresh themselves.

import { renderSlide, renderCover, renderClosing, renderSponsorIndex, renderWishLoop, renderMedia, renderAuctionDisplay, renderCarousel, renderContest, fitToViewport, effectiveSponsorLogos } from './render';
import { EVENT_META } from './slides';
import type { Lot, BordplanItem, CoverItem, ClosingItem, SponsorIndexItem, WishLoopItem, MediaItem, AuctionDisplayItem, SectionItem, CarouselItem, ContestItem, AuctionTeam, DeckItem } from './slides';
import { renderBordplanSlide } from './render-bordplan';
import type { FloorPlanConfig } from './bordplan-engine';

// ---- Type metadata (dots + names + picker descriptions) ----
type Kind = 'lot' | 'bordplan' | 'cover' | 'closing' | 'sponsor-index' | 'wish-loop' | 'media' | 'auction-display' | 'section' | 'carousel' | 'contest';
const TYPE_META: Record<Kind, { name: string; dot: string; desc: string }> = {
  lot:               { name: 'Lot',             dot: '#3FA34D', desc: 'Auktionslot — foto, titel, bullets og sponsor.' },
  cover:             { name: 'Cover',           dot: '#B8893A', desc: 'Forside — stort ord, undertitel og logo.' },
  section:           { name: 'Sektion',         dot: '#8A8175', desc: 'Navngiver en blok i listen. Vises ikke som slide.' },
  bordplan:          { name: 'Bordplan',        dot: '#1F4A28', desc: 'Bordopstilling på grøn dug — redigeres visuelt.' },
  'sponsor-index':   { name: 'Sponsor-indeks',  dot: '#D9B26A', desc: 'Grid af alle auktionens sponsorer, autogenereret.' },
  closing:           { name: 'Closing',         dot: '#8E6824', desc: 'Tak-til-alle med sponsorvæg.' },
  'wish-loop':       { name: 'Ønske-loop',      dot: '#7FBF8E', desc: 'Børnenes ønsker som roterende kort over video.' },
  media:             { name: 'Media',           dot: '#5C544A', desc: 'Fuldskærms billede eller video.' },
  carousel:          { name: 'Billedkarrusel',  dot: '#A67B33', desc: 'Cross-fadende billeder med individuel skærmtid.' },
  'auction-display': { name: 'Auktion-display', dot: '#E6C885', desc: 'Hold-baseret live-tavle med bud-bars.' },
  contest:           { name: 'Konkurrence',     dot: '#C0764F', desc: '1–4 blokke med billede og info.' },
};
const PICKER_ORDER: Kind[] = ['lot', 'section', 'cover', 'bordplan', 'sponsor-index', 'closing', 'wish-loop', 'media', 'auction-display', 'contest', 'carousel'];

// ---- DOM: topbar / chrome ----
const statusEl    = document.getElementById('gen-status')!;
const itemCountEl = document.getElementById('gen-item-count')!;
const savePillEl  = document.getElementById('gen-save-pill')!;
const listMeta    = document.getElementById('gen-list-meta')!;
const listRows    = document.getElementById('gen-list-rows')!;
const listFooter  = document.getElementById('gen-list-footer')!;
const searchEl    = document.getElementById('gen-search') as HTMLInputElement;
const openPickerBtn = document.getElementById('open-picker')!;
const tplScrim    = document.getElementById('tpl-scrim')!;
const tplGrid     = document.getElementById('tpl-grid')!;
const tplClose    = document.getElementById('tpl-close')!;
const toastEl     = document.getElementById('gen-toast')!;
const inspDot     = document.getElementById('insp-dot')!;
const inspType    = document.getElementById('insp-type')!;
const editIdEl    = document.getElementById('edit-id')!;
const editDisplayNumEl = document.getElementById('edit-display-num')!;
const deleteBtn   = document.getElementById('delete-lot') as HTMLButtonElement;
const duplicateBtn = document.getElementById('duplicate-lot') as HTMLButtonElement;
const resetFocalBtn = document.getElementById('reset-focal') as HTMLButtonElement;
const saveBtn     = document.getElementById('save-lot') as HTMLButtonElement;
const saveMeta    = document.getElementById('gen-save-meta')!;
const previewFrame = document.getElementById('gen-preview-frame')!;
const previewMeta  = document.getElementById('preview-meta')!;
const previewHint  = document.getElementById('preview-hint')!;
const validationEl = document.getElementById('gen-validation')!;

// ---- DOM: lot form ----
const fActive    = document.getElementById('f-active')   as HTMLInputElement;
const fActiveHint = document.getElementById('f-active-hint')!;
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
const rowMirrored = document.getElementById('row-mirrored')!;
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
const fImgCount  = document.getElementById('f-img-count') as HTMLSelectElement;
const fImgCountHint = document.getElementById('f-img-count-hint')!;
const heroPreview = document.getElementById('hero-preview') as HTMLImageElement;
const spLogoListEl = document.getElementById('sp-logo-list')!;
const spLogoUploadEl = document.getElementById('f-sponsor-logos-upload') as HTMLInputElement;
const advToggle = document.getElementById('adv-toggle')!;
const advBody   = document.getElementById('adv-body')!;
const advSummary = document.getElementById('adv-summary')!;
const advChev   = document.getElementById('adv-chev')!;
const sndInitUpload = document.getElementById('snd-init-upload') as HTMLInputElement;
const sndInitName   = document.getElementById('snd-init-name')!;
const sndInitClear  = document.getElementById('snd-init-clear') as HTMLButtonElement;
const sndInitVol    = document.getElementById('snd-init-vol') as HTMLInputElement;
const sndInitVolVal = document.getElementById('snd-init-vol-val')!;
const sndHammerUpload = document.getElementById('snd-hammer-upload') as HTMLInputElement;
const sndHammerName   = document.getElementById('snd-hammer-name')!;
const sndHammerClear  = document.getElementById('snd-hammer-clear') as HTMLButtonElement;
const sndHammerVol    = document.getElementById('snd-hammer-vol') as HTMLInputElement;
const sndHammerVolVal = document.getElementById('snd-hammer-vol-val')!;

// ---- Multi-image hero controls (up to 3) ----
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
  syncSeg(segImgCount, fImgCount.value);
}

// ---- State ----
let itemsBank: DeckItem[] = [];
let lotsBank: Lot[] = [];
let selectedId: string | null = sessionStorage.getItem('gen.selectedId');
let dirty = false;
let savedAt: string | null = null;
let searchQ = '';
let collapsed = new Set<string>(JSON.parse(sessionStorage.getItem('gen.collapsed') || '[]'));
let bpMode: 'tables' | 'aisles' | 'numbers' = 'tables';
let spLogos: string[] = [];          // working copy for the selected lot
let carImages: Array<{ src: string; seconds?: number }> = [];
let ctBlocks: Array<{ src: string | null; heading?: string; lines?: string[] }> = [];

function nowHHMM(): string {
  return new Date().toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
}

function itemKind(item: DeckItem | undefined): Kind {
  const k = (item as any)?.kind;
  if (!k || k === 'lot') return 'lot';
  return k as Kind;
}
function isBordplanItem(item: DeckItem | undefined): item is BordplanItem { return itemKind(item) === 'bordplan'; }
function isCoverItem(item: DeckItem | undefined): item is CoverItem { return itemKind(item) === 'cover'; }
function isClosingItem(item: DeckItem | undefined): item is ClosingItem { return itemKind(item) === 'closing'; }
function isSponsorIndexItem(item: DeckItem | undefined): item is SponsorIndexItem { return itemKind(item) === 'sponsor-index'; }
function isWishLoopItem(item: DeckItem | undefined): item is WishLoopItem { return itemKind(item) === 'wish-loop'; }
function isMediaItem(item: DeckItem | undefined): item is MediaItem { return itemKind(item) === 'media'; }
function isAuctionDisplayItem(item: DeckItem | undefined): item is AuctionDisplayItem { return itemKind(item) === 'auction-display'; }
function isSectionItem(item: DeckItem | undefined): item is SectionItem { return itemKind(item) === 'section'; }
function isCarouselItem(item: DeckItem | undefined): item is CarouselItem { return itemKind(item) === 'carousel'; }
function isContestItem(item: DeckItem | undefined): item is ContestItem { return itemKind(item) === 'contest'; }

// ---- Form containers ----
const formLot = document.getElementById('gen-form')!;
const formBordplan = document.getElementById('gen-form-bordplan')!;
const formCover = document.getElementById('gen-form-cover')!;
const formClosing = document.getElementById('gen-form-closing')!;
const formSponsorIndex = document.getElementById('gen-form-sponsorindex')!;
const formWishLoop = document.getElementById('gen-form-wishloop')!;
const formMedia = document.getElementById('gen-form-media')!;
const formAuctionDisplay = document.getElementById('gen-form-auctiondisplay')!;
const formSection = document.getElementById('gen-form-section')!;
const formCarousel = document.getElementById('gen-form-carousel')!;
const formContest = document.getElementById('gen-form-contest')!;
const ALL_FORMS = [formLot, formBordplan, formCover, formClosing, formSponsorIndex, formWishLoop, formMedia, formAuctionDisplay, formSection, formCarousel, formContest];

// ---- Section form ----
const secLabelEl = document.getElementById('sec-label') as HTMLInputElement;

// ---- Carousel form ----
const carActiveEl = document.getElementById('car-active') as HTMLInputElement;
const carLabelEl  = document.getElementById('car-label') as HTMLInputElement;
const carListEl   = document.getElementById('car-image-list')!;
const carUploadEl = document.getElementById('car-upload') as HTMLInputElement;
const carFadeEl   = document.getElementById('car-fade') as HTMLInputElement;
const carFadeVal  = document.getElementById('car-fade-val')!;
const carDefaultSecEl = document.getElementById('car-default-sec') as HTMLInputElement;
const carDefaultSecVal = document.getElementById('car-default-sec-val')!;
const carTickerEl = document.getElementById('car-ticker') as HTMLInputElement;

// ---- Contest form ----
const ctActiveEl = document.getElementById('ct-active') as HTMLInputElement;
const ctLabelEl  = document.getElementById('ct-label') as HTMLInputElement;
const ctTitleEl  = document.getElementById('ct-title') as HTMLInputElement;
const ctSubtitleEl = document.getElementById('ct-subtitle') as HTMLInputElement;
const ctBlockListEl = document.getElementById('ct-block-list')!;
const ctUploadEl = document.getElementById('ct-upload') as HTMLInputElement;

// ---- Closing form ----
const clActiveEl    = document.getElementById('cl-active')   as HTMLInputElement;
const clLabelEl     = document.getElementById('cl-label')    as HTMLInputElement;
const clTitleEl     = document.getElementById('cl-title')    as HTMLInputElement;
const clTaglineEl   = document.getElementById('cl-tagline')  as HTMLInputElement;
const clColsEl      = document.getElementById('cl-cols')     as HTMLInputElement;
const clLogoListEl  = document.getElementById('cl-logo-list')!;
const clLogoUploadEl = document.getElementById('cl-logo-upload') as HTMLInputElement;
let clLogos: ClosingItem['logos'] = [];

// ---- Wish-loop form ----
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
let wlApplePool: string[] = [];
let wlSelectedCards: Array<{ id: number | string; src: string | null; alt?: string }> = [];

// ---- Auction-display form ----
const adActiveEl    = document.getElementById('ad-active')         as HTMLInputElement;
const adLabelEl     = document.getElementById('ad-label')          as HTMLInputElement;
const adScreenEl = document.getElementById('ad-screen') as HTMLSelectElement;
const adTeamsListEl = document.getElementById('ad-teams-list')!;
const adActiveLotEl = document.getElementById('ad-active-lot')     as HTMLSelectElement;
const adRevealCountEl = document.getElementById('ad-reveal-count') as HTMLInputElement;
const adRankingEl   = document.getElementById('ad-ranking')        as HTMLInputElement;
const adNamesVisibleEl = document.getElementById('ad-names-visible') as HTMLInputElement;
const adShowBaseLabelEl = document.getElementById('ad-show-base-label') as HTMLInputElement;

// ---- Media form ----
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

// ---- Sponsor-index form ----
const siActiveEl   = document.getElementById('si-active') as HTMLInputElement;
const siLabelEl    = document.getElementById('si-label')  as HTMLInputElement;
const siTitleEl    = document.getElementById('si-title')  as HTMLInputElement;

// ---- Cover form ----
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

// ---- Bordplan form ----
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
const bpModeHintEl  = document.getElementById('bp-mode-hint')!;
const bpNumberingCard = document.getElementById('bp-numbering-card')!;
const bpAislesCard  = document.getElementById('bp-aisles-card')!;
const bpOriginGrid  = document.getElementById('bp-origin-grid')!;

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

// ---- API + toast ----
async function api(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}
let toastTimer = 0;
function toast(msg: string) {
  toastEl.textContent = msg;
  toastEl.classList.add('open');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('open'), 2600);
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// ---- Load ----
async function loadBank() {
  statusEl.textContent = 'Henter…';
  try {
    const data = await api('/api/lots');
    itemsBank = data.lots;
    lotsBank = itemsBank.filter(i => itemKind(i) === 'lot') as Lot[];
    if (data.meta) {
      for (const k of Object.keys(EVENT_META)) delete (EVENT_META as any)[k];
      Object.assign(EVENT_META, data.meta);
    }
    statusEl.textContent = '';
    renderList();
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
function itemLabel(item: DeckItem): string {
  const kind = itemKind(item);
  if (kind === 'lot') return (item as Lot).title || '(uden titel)';
  return (item as any).label || TYPE_META[kind].name;
}

// ---- Deck list ----
function renderList() {
  const displayNums = computeDisplayNums();
  listRows.innerHTML = '';
  listMeta.textContent = `${lotsBank.length} lots`;
  itemCountEl.textContent = `FORBUNDET · ${itemsBank.filter(i => itemKind(i) !== 'section').length} ITEMS`;
  const q = searchQ.trim().toLowerCase();
  let collapsedNow = false;
  for (const item of itemsBank) {
    const kind = itemKind(item);
    const meta = TYPE_META[kind];
    const label = itemLabel(item);
    if (q && !(label.toLowerCase().includes(q) || meta.name.toLowerCase().includes(q))) {
      if (kind === 'section') collapsedNow = false;
      continue;
    }
    if (kind === 'section') {
      collapsedNow = !q && collapsed.has(item.id);
      const head = document.createElement('div');
      head.className = 'gen-sec-row';
      head.dataset.id = item.id;
      head.innerHTML = `
        <span class="chev">${collapsedNow ? '▸' : '▾'}</span>
        <span class="sec-title${item.id === selectedId ? ' sel' : ''}">${escapeHtml((item as SectionItem).label || '(uden navn)')}</span>
        <span class="hairline"></span>
        <span class="count">${sectionCount(item.id)} items</span>
        <button type="button" class="sec-edit" data-move="-1" title="Flyt op">↑</button>
        <button type="button" class="sec-edit" data-move="1" title="Flyt ned">↓</button>
        <button type="button" class="sec-edit" title="Redigér sektion">✎</button>
      `;
      head.addEventListener('click', (e) => {
        const mv = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-move]');
        if (mv) { e.stopPropagation(); moveItem(item.id, parseInt(mv.dataset.move!, 10)); return; }
        if ((e.target as HTMLElement).closest('.sec-edit')) { selectLot(item.id); return; }
        if (collapsed.has(item.id)) collapsed.delete(item.id);
        else collapsed.add(item.id);
        sessionStorage.setItem('gen.collapsed', JSON.stringify([...collapsed]));
        renderList();
      });
      listRows.appendChild(head);
      continue;
    }
    if (collapsedNow) continue;
    const row = document.createElement('div');
    row.className = 'gen-row';
    row.dataset.id = item.id;
    row.draggable = true;
    const selected = item.id === selectedId;
    if (selected) row.classList.add('selected');
    if ((item as any).active === false) row.classList.add('inactive');
    const dn = kind === 'lot' ? (displayNums.get(item.id) ?? '—') : '·';
    row.innerHTML = `
      <span class="gen-row-num">${dn}</span>
      <span class="gen-row-dot" style="background:${meta.dot}"></span>
      <span class="gen-row-main">
        <span class="gen-row-type">${meta.name}</span>
        <span class="gen-row-title">${escapeHtml(label)}</span>
      </span>
      <span class="gen-row-actions">
        <button type="button" data-move="-1" title="Flyt op">↑</button>
        <button type="button" data-move="1" title="Flyt ned">↓</button>
      </span>
    `;
    row.addEventListener('click', (e) => {
      const mv = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-move]');
      if (mv) { e.stopPropagation(); moveItem(item.id, parseInt(mv.dataset.move!, 10)); return; }
      selectLot(item.id);
    });
    row.addEventListener('dragstart', onDragStart);
    row.addEventListener('dragover', onDragOver);
    row.addEventListener('drop', onDrop);
    row.addEventListener('dragend', onDragEnd);
    listRows.appendChild(row);
  }
  listFooter.textContent = `${itemsBank.length} items · ${[...collapsed].filter(id => itemsBank.some(i => i.id === id)).length} foldede sektioner`;
}
function sectionCount(secId: string): number {
  let counting = false, n = 0;
  for (const item of itemsBank) {
    if (itemKind(item) === 'section') { counting = item.id === secId; continue; }
    if (counting) n++;
  }
  return n;
}
searchEl.addEventListener('input', () => { searchQ = searchEl.value; renderList(); });

async function persistOrder() {
  const order = itemsBank.map(i => i.id);
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
function moveItem(id: string, dir: number) {
  const i = itemsBank.findIndex(x => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= itemsBank.length) return;
  const tmp = itemsBank[i]; itemsBank[i] = itemsBank[j]; itemsBank[j] = tmp;
  persistOrder();
}

// Drag-reorder (kept alongside the ↑/↓ buttons)
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
  const sRect = listRows.getBoundingClientRect();
  const margin = 36;
  if (e.clientY < sRect.top + margin) listRows.scrollBy({ top: -10 });
  else if (e.clientY > sRect.bottom - margin) listRows.scrollBy({ top: 10 });
}
function onDrop(e: DragEvent) {
  e.preventDefault();
  if (!draggingId) return;
  const target = e.currentTarget as HTMLElement;
  clearDropMarkers();
  if (target.dataset.id === draggingId) { draggingId = null; return; }
  const from = itemsBank.findIndex(i => i.id === draggingId);
  let to = itemsBank.findIndex(i => i.id === target.dataset.id);
  if (from < 0 || to < 0) { draggingId = null; return; }
  const rect = target.getBoundingClientRect();
  const before = e.clientY < rect.top + rect.height / 2;
  const [moved] = itemsBank.splice(from, 1);
  if (from < to) to -= 1;
  itemsBank.splice(before ? to : to + 1, 0, moved);
  draggingId = null;
  persistOrder();
}
function onDragEnd(e: DragEvent) {
  (e.currentTarget as HTMLElement).classList.remove('is-dragging');
  clearDropMarkers();
  draggingId = null;
}

// ---- Segmented controls ----
function wireSeg(container: HTMLElement, onPick: (val: string) => void) {
  container.querySelectorAll<HTMLButtonElement>('button[data-val]').forEach(btn => {
    btn.addEventListener('click', () => onPick(btn.dataset.val!));
  });
}
function syncSeg(container: HTMLElement, val: string) {
  container.querySelectorAll<HTMLButtonElement>('button[data-val]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.val === val);
  });
}
const segLayout = document.getElementById('seg-layout')!;
const segImgCount = document.getElementById('seg-imgcount')!;
const segBpMode = document.getElementById('seg-bpmode')!;
wireSeg(segLayout, (val) => {
  fLayout.value = val;
  syncSeg(segLayout, val);
  applyLayoutVisibility();
  onFormChange();
});
wireSeg(segImgCount, (val) => {
  fImgCount.value = val;
  applyImgCount(parseInt(val, 10) || 1);
  onFormChange();
});
wireSeg(segBpMode, (val) => {
  bpMode = val as any;
  applyBpMode();
  refreshPreview();
});
function applyLayoutVisibility() {
  const isHorizon = fLayout.value === 'horizon';
  rowHorizonCap.style.display = isHorizon ? '' : 'none';
  rowProfilePhoto.style.display = isHorizon ? 'none' : '';
  rowMirrored.style.display = isHorizon ? 'none' : '';
  syncSeg(segLayout, fLayout.value);
  applyImgCount(parseInt(fImgCount.value, 10) || 1);
}
function applyBpMode() {
  syncSeg(segBpMode, bpMode);
  bpModeHintEl.textContent =
    bpMode === 'tables' ? 'Klik på et bord i previewet for at fjerne det — klik på et fjernet (stiplet) felt for at gendanne det.'
    : bpMode === 'aisles' ? 'Redigér gange i felterne herunder — 1-indekseret efter kolonne/række.'
    : 'Vælg hjørne, startnummer, prefix og numre der springes over. Grid-numrene opdateres live.';
  bpNumberingCard.style.display = bpMode === 'numbers' ? '' : 'none';
  bpAislesCard.style.display = bpMode === 'aisles' ? '' : 'none';
}
// ponytail: klik-i-preview gange (Gange-mode) er udskudt — renderen tegner ikke
// klikbare gap-celler; felterne i GANGE-kortet dækker behovet indtil videre.

// Origin 2x2 grid → hidden select
bpOriginGrid.querySelectorAll<HTMLButtonElement>('button[data-val]').forEach(btn => {
  btn.addEventListener('click', () => {
    bpNumOriginEl.value = btn.dataset.val!;
    syncOriginGrid();
    setDirty(true);
    refreshPreview();
  });
});
function syncOriginGrid() {
  bpOriginGrid.querySelectorAll<HTMLButtonElement>('button[data-val]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.val === bpNumOriginEl.value);
  });
}

// ---- Advanced fold ----
let advOpen = false;
advToggle.addEventListener('click', () => {
  advOpen = !advOpen;
  advBody.style.display = advOpen ? '' : 'none';
  advChev.textContent = advOpen ? '▴ SKJUL' : '▾ VIS';
});
function refreshAdvSummary(lot: Lot | undefined) {
  if (!lot) { advSummary.textContent = ''; return; }
  const n = [lot.extra, lot.titleSizePt, (lot.donorNames || []).length, lot.sound?.initSound, lot.sound?.hammerSound].filter(Boolean).length;
  advSummary.textContent = n ? `${n} i brug` : '';
}

// ---- Select + inspector header ----
function selectLot(id: string) {
  if (dirty && id !== selectedId) {
    if (!confirm('Du har ugemte ændringer. Skift item og kassér?')) return;
  }
  selectedId = id;
  sessionStorage.setItem('gen.selectedId', id);
  const item = itemsBank.find(i => i.id === id);
  if (!item) return;
  const kind = itemKind(item);
  const meta = TYPE_META[kind];
  ALL_FORMS.forEach(f => f.style.display = 'none');
  inspDot.setAttribute('style', `background:${meta.dot}`);
  inspType.textContent = meta.name;
  editIdEl.textContent = item.id;
  const dn = kind === 'lot' ? (computeDisplayNums().get(id) ?? '—') : '';
  if (kind === 'lot') {
    editDisplayNumEl.textContent = `LOT ${dn}`;
  } else {
    const t = (itemLabel(item) || '').toUpperCase();
    editDisplayNumEl.textContent = t.length > 24 ? t.slice(0, 23).replace(/\s+\S*$/, '') + '…' : t;
  }
  deleteBtn.style.display = 'inline-flex';
  duplicateBtn.style.display = 'inline-flex';
  if (kind === 'auction-display') {
    formAuctionDisplay.style.display = 'flex';
    populateAuctionDisplayForm(item as AuctionDisplayItem);
  } else if (kind === 'media') {
    formMedia.style.display = 'flex';
    populateMediaForm(item as MediaItem);
  } else if (kind === 'bordplan') {
    formBordplan.style.display = 'flex';
    populateBordplanForm(item as BordplanItem);
    applyBpMode();
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
  } else if (kind === 'section') {
    formSection.style.display = 'flex';
    secLabelEl.value = (item as SectionItem).label || '';
  } else if (kind === 'carousel') {
    formCarousel.style.display = 'flex';
    populateCarouselForm(item as CarouselItem);
  } else if (kind === 'contest') {
    formContest.style.display = 'flex';
    populateContestForm(item as ContestItem);
  } else {
    formLot.style.display = 'flex';
    populateForm(item as Lot);
  }
  refreshPreview();
  renderList();
  setDirty(false);
  renderValidation();
}

// ---- Lot form ----
function populateForm(lot: Lot) {
  fActive.checked = !!lot.active;
  fActiveHint.textContent = lot.active ? '' : '— skjult i viewer og controller';
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
  const fx0 = Number.isFinite(focal[0]) ? focal[0] : 50;
  const fy0 = Number.isFinite(focal[1]) ? focal[1] : 50;
  fFocalX.value = String(fx0); fFocalXVal.textContent = `${fx0}%`;
  fFocalY.value = String(fy0); fFocalYVal.textContent = `${fy0}%`;
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
  heroPreview.src = `/assets/hero/lot-${lot.id}_FINAL.${lot.heroExt || 'jpg'}?v=${Date.now()}`;
  // Sponsor logos working copy — v2 field wins; legacy lots resolve chain.
  spLogos = lot.sponsorLogos ? [...lot.sponsorLogos] : effectiveSponsorLogos(lot);
  renderSpLogoList();
  // Sound override
  refreshSoundUI(lot);
  // Multi-image
  const heroImages = lot.heroImages || [];
  const count = Math.min(3, 1 + heroImages.length);
  fImgCount.value = String(count);
  const splits = lot.heroSplit && lot.heroSplit.length === count ? lot.heroSplit : null;
  const v = Date.now();
  heroCtls.forEach((c, i) => {
    if (i > 0) {
      const im = heroImages[i - 1];
      const f = ((im?.focal) || '50% 50%').replace(/%/g, '').split(/\s+/).map(s => parseInt(s, 10));
      const ffx = Number.isFinite(f[0]) ? f[0] : 50;
      const ffy = Number.isFinite(f[1]) ? f[1] : 50;
      c.fx.value = String(ffx); c.fxVal.textContent = `${ffx}%`;
      c.fy.value = String(ffy); c.fyVal.textContent = `${ffy}%`;
      const sp = Math.round(((im?.scale) ?? 1) * 100);
      c.scale.value = String(sp); c.scaleVal.textContent = `${sp}%`;
      c.preview.src = `/assets/hero/lot-${lot.id}_FINAL${i + 1}.${im?.ext || 'jpg'}?v=${v}`;
    }
    const w = splits ? splits[i] : 50;
    c.split.value = String(w); c.splitVal.textContent = String(w);
  });
  applyLayoutVisibility();
  applyImgCount(count);
  refreshAdvSummary(lot);
}

function readForm(): Partial<Lot> {
  const titleParts = markdownToParts(fTitle.value);
  const plainTitle = titleParts ? partsToPlainText(titleParts).replace(/\n/g, ' ').trim() : fTitle.value.trim();
  const imgCount = Math.min(3, Math.max(1, parseInt(fImgCount.value, 10) || 1));
  const cur = lotsBank.find(l => l.id === selectedId);
  const curImgs = cur?.heroImages || [];
  const heroImages = heroCtls.slice(1, imgCount).map((c, idx) => ({
    ext: curImgs[idx]?.ext,
    focal: `${c.fx.value}% ${c.fy.value}%`,
    scale: parseInt(c.scale.value, 10) / 100,
  }));
  const heroSplit = imgCount > 1
    ? heroCtls.slice(0, imgCount).map(c => parseInt(c.split.value, 10) || 1)
    : undefined;
  // Sound: filenames live on the in-memory lot (set by upload/clear); the
  // volume sliders join them here at save time.
  const sound: any = { ...(cur?.sound || {}) };
  sound.initVolume = (parseInt(sndInitVol.value, 10) || 100) / 100;
  sound.hammerVolume = (parseInt(sndHammerVol.value, 10) || 100) / 100;
  return {
    heroImages,
    heroSplit,
    sponsorLogos: [...spLogos],
    sound,
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
  };
}

// ---- Sponsor logos card ----
function renderSpLogoList() {
  spLogoListEl.innerHTML = '';
  if (!spLogos.length) {
    spLogoListEl.innerHTML = `<div class="gen-splogo-empty"><span>INGEN LOGOER</span></div>`;
    return;
  }
  spLogos.forEach((src, i) => {
    const card = document.createElement('div');
    card.className = 'gen-splogo';
    card.style.backgroundImage = `url('${src}')`;
    card.innerHTML = `<button type="button" title="Fjern logo" data-i="${i}">✕</button>`;
    spLogoListEl.appendChild(card);
  });
}
spLogoListEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-i]');
  if (!btn) return;
  spLogos.splice(parseInt(btn.dataset.i!, 10), 1);
  renderSpLogoList();
  onFormChange();
});
spLogoUploadEl.addEventListener('change', async () => {
  const files = Array.from(spLogoUploadEl.files || []);
  if (!files.length || !selectedId) return;
  for (const file of files) {
    const fd = new FormData();
    fd.append('kind', 'extra-logo');
    fd.append('lotId', selectedId);
    fd.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data?.filename) spLogos.push(`/assets/logo/${data.filename}`);
    } catch (e: any) { statusEl.textContent = 'Logo upload failed: ' + e.message; }
  }
  spLogoUploadEl.value = '';
  renderSpLogoList();
  onFormChange();
});

// ---- Per-lot sound override ----
function refreshSoundUI(lot: Lot) {
  const s = lot.sound || {};
  sndInitName.textContent = s.initSound || 'Standard (fra controller)';
  sndInitName.classList.toggle('set', !!s.initSound);
  sndInitClear.style.display = s.initSound ? '' : 'none';
  const iv = Math.round((s.initVolume ?? 1) * 100);
  sndInitVol.value = String(iv); sndInitVolVal.textContent = `${iv}%`;
  sndHammerName.textContent = s.hammerSound || 'Standard (fra controller)';
  sndHammerName.classList.toggle('set', !!s.hammerSound);
  sndHammerClear.style.display = s.hammerSound ? '' : 'none';
  const hv = Math.round((s.hammerVolume ?? 1) * 100);
  sndHammerVol.value = String(hv); sndHammerVolVal.textContent = `${hv}%`;
}
async function uploadLotSound(which: 'init' | 'hammer', file: File) {
  if (!selectedId) return;
  const fd = new FormData();
  fd.append('kind', 'sound');
  fd.append('which', which);
  fd.append('lotId', selectedId);
  fd.append('file', file);
  try {
    statusEl.textContent = `Uploader ${which}-lyd…`;
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    const lot = lotsBank.find(l => l.id === selectedId);
    if (lot && data?.filename) {
      lot.sound = { ...(lot.sound || {}) };
      if (which === 'init') lot.sound.initSound = data.filename;
      else lot.sound.hammerSound = data.filename;
      refreshSoundUI(lot);
    }
    statusEl.textContent = 'Lyd uploadet';
    toast(`${which === 'init' ? 'Init' : 'Hammer'}-lyd sat for dette lot`);
  } catch (e: any) { statusEl.textContent = 'Lyd-upload failed: ' + e.message; }
}
sndInitUpload.addEventListener('change', () => { if (sndInitUpload.files?.[0]) uploadLotSound('init', sndInitUpload.files[0]); sndInitUpload.value = ''; });
sndHammerUpload.addEventListener('change', () => { if (sndHammerUpload.files?.[0]) uploadLotSound('hammer', sndHammerUpload.files[0]); sndHammerUpload.value = ''; });
async function clearLotSound(which: 'init' | 'hammer') {
  if (!selectedId) return;
  const lot = lotsBank.find(l => l.id === selectedId);
  if (!lot) return;
  const sound: any = { ...(lot.sound || {}) };
  if (which === 'init') { delete sound.initSound; delete sound.initVolume; }
  else { delete sound.hammerSound; delete sound.hammerVolume; }
  try {
    const updated = await api(`/api/lots/${encodeURIComponent(selectedId)}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sound }),
    });
    syncBank(updated);
    refreshSoundUI(updated);
    toast('Tilbage til standard-lyd');
  } catch (e: any) { statusEl.textContent = 'Lyd-reset failed: ' + e.message; }
}
sndInitClear.addEventListener('click', () => clearLotSound('init'));
sndHammerClear.addEventListener('click', () => clearLotSound('hammer'));
sndInitVol.addEventListener('input', () => { sndInitVolVal.textContent = `${sndInitVol.value}%`; setDirty(true); });
sndHammerVol.addEventListener('input', () => { sndHammerVolVal.textContent = `${sndHammerVol.value}%`; setDirty(true); });

// ---- Validation ----
function validateForm(): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const title = fTitle.value.trim();
  if (fActive.checked && !title) errors.push('Titel mangler — slide viser placeholder.');
  if (!fSponsor.value.trim()) warnings.push('Sponsor/donor er tom.');
  if (fExtra.checked && !fExtraSuffix.value.trim()) {
    warnings.push('Ekstra-lot uden suffix — auto-tildeles (fx 03A).');
  }
  return { errors, warnings };
}
function renderValidation() {
  const item = itemsBank.find(i => i.id === selectedId);
  if (itemKind(item) !== 'lot') { validationEl.innerHTML = ''; return true; }
  const { errors, warnings } = validateForm();
  validationEl.innerHTML = '';
  for (const e of [...errors, ...warnings]) {
    const el = document.createElement('div');
    el.className = 'gen-problem';
    el.innerHTML = `<span>!</span><span>${escapeHtml(e)}</span>`;
    validationEl.appendChild(el);
  }
  return errors.length === 0;
}

// ---- Dirty / save pill ----
function setDirty(v: boolean) {
  dirty = v;
  saveMeta.textContent = v
    ? 'Sendes til controller, viewer & auktionarius ved gem'
    : (savedAt ? `Sidst gemt ${savedAt}` : 'Ingen ændringer');
  saveBtn.textContent = v ? 'Gem ændringer' : 'Gemt';
  savePillEl.style.display = selectedId ? '' : 'none';
  savePillEl.className = 'pp-save-pill' + (v ? ' dirty' : '');
  savePillEl.textContent = v ? '● Ugemt' : (savedAt ? `✓ Gemt ${savedAt}` : '✓ Gemt');
}

// ---- Preview ----
let focalDragActive = false;
function refreshPreview() {
  if (!selectedId) return;
  const item = itemsBank.find(i => i.id === selectedId);
  if (!item) return;
  previewFrame.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'slide-frame';
  previewFrame.appendChild(wrap);
  previewHint.textContent = '';
  const kind = itemKind(item);
  const mount = (slideEl: HTMLElement) => {
    slideEl.classList.add('is-visible', 'no-build');
    slideEl.querySelectorAll<HTMLVideoElement>('video').forEach(v => { v.muted = true; v.volume = 0; });
    wrap.appendChild(slideEl);
    requestAnimationFrame(() => fitToViewport(wrap, slideEl));
    return slideEl;
  };
  const shell = (cls: string) => {
    const el = document.createElement('div');
    el.className = `slide-canvas ${cls}`;
    return el;
  };
  if (isBordplanItem(item)) {
    const merged: BordplanItem = { ...item, ...readBordplanForm() };
    const slideEl = shell('slide-bordplan');
    slideEl.innerHTML = renderBordplanSlide(merged.config, {
      eventName: merged.eventName, org: merged.org, overrides: merged.overrides,
    });
    mount(slideEl);
    previewMeta.textContent = `Bordplan · ${merged.config.cols}×${merged.config.rows}`;
    previewHint.textContent = bpMode === 'tables'
      ? 'KLIK PÅ ET BORD FOR AT FJERNE / GENDANNE DET'
      : bpMode === 'aisles' ? 'GANGE REDIGERES I PANELET TIL HØJRE'
      : 'NUMMERERING STYRES I PANELET TIL HØJRE';
    wireBordplanTableClicks(slideEl);
    renderOverridesList(merged.overrides || {});
    return;
  }
  if (isCoverItem(item)) {
    const merged: CoverItem = { ...item, ...readCoverForm() };
    const slideEl = shell('slide-cover');
    slideEl.innerHTML = renderCover(merged);
    mount(slideEl);
    previewMeta.textContent = 'Cover';
    return;
  }
  if (isClosingItem(item)) {
    const merged: ClosingItem = { ...item, ...readClosingForm() };
    const slideEl = shell('slide-closing');
    slideEl.innerHTML = renderClosing(merged);
    mount(slideEl);
    previewMeta.textContent = `Closing · ${merged.logos.length} logos`;
    return;
  }
  if (isSponsorIndexItem(item)) {
    const merged: SponsorIndexItem = { ...item, ...readSponsorIndexForm() };
    const slideEl = shell('slide-sponsor-index');
    slideEl.innerHTML = renderSponsorIndex(merged);
    mount(slideEl);
    previewMeta.textContent = 'Sponsor-indeks';
    return;
  }
  if (isAuctionDisplayItem(item)) {
    const slideEl = shell('slide-auction-display');
    slideEl.innerHTML = renderAuctionDisplay(item);
    mount(slideEl);
    previewMeta.textContent = `Auktion-display · ${item.screen || 'intro'}`;
    return;
  }
  if (isMediaItem(item)) {
    const merged: MediaItem = { ...item, ...readMediaForm() } as MediaItem;
    const slideEl = shell('slide-media');
    slideEl.innerHTML = renderMedia(merged);
    mount(slideEl);
    previewMeta.textContent = `Media · ${merged.mode}`;
    return;
  }
  if (isWishLoopItem(item)) {
    const merged: WishLoopItem = { ...item, ...readWishLoopForm() };
    const slideEl = shell('slide-wish-loop');
    slideEl.innerHTML = renderWishLoop(merged);
    mount(slideEl);
    previewMeta.textContent = `Ønske-loop · ${merged.cards.length}/${wlApplePool.length} kort`;
    return;
  }
  if (isSectionItem(item)) {
    const slideEl = shell('slide-section');
    slideEl.innerHTML = `
      <div class="gen-section-slide">
        <span class="pre">SEKTION — VISES IKKE SOM SLIDE</span>
        <div class="big">${escapeHtml(secLabelEl.value || item.label || '')}</div>
        <span class="sub">Navngiver blokken af items under den og kan foldes sammen i listen.</span>
      </div>`;
    mount(slideEl);
    previewMeta.textContent = 'Sektion';
    return;
  }
  if (isCarouselItem(item)) {
    const merged: CarouselItem = { ...item, ...readCarouselForm() };
    const slideEl = shell('slide-carousel');
    slideEl.innerHTML = renderCarousel(merged);
    mount(slideEl);
    previewMeta.textContent = `Billedkarrusel · ${merged.images.length} billeder`;
    return;
  }
  if (isContestItem(item)) {
    const merged: ContestItem = { ...item, ...readContestForm() };
    const slideEl = shell('slide-contest');
    slideEl.innerHTML = renderContest(merged);
    mount(slideEl);
    previewMeta.textContent = 'Konkurrence';
    return;
  }
  // Lot
  const baseLot = item as Lot;
  const merged: Lot = { ...baseLot, ...readForm() } as Lot;
  const slide = { id: `lot-${merged.id}`, kind: 'lot' as const, lotId: merged.id };
  const dn = computeDisplayNums().get(merged.id) ?? '—';
  previewMeta.textContent = `Lot · vises som ${dn}${merged.mirrored && merged.layout === 'profile' ? ' · mirrored' : ''}${merged.active ? '' : ' · IKKE I DECK'}`;
  previewHint.textContent = 'TRÆK FOKUSPUNKTET DIREKTE I BILLEDET · SCROLL FOR ZOOM';
  const slideEl = renderSlide(slide, merged, dn);
  mount(slideEl);
  wireHeroInteractions(slideEl);
}

// ---- Direct manipulation: focal drag + wheel zoom on the preview panes ----
function wireHeroInteractions(slideEl: HTMLElement) {
  const panes = slideEl.querySelectorAll<HTMLElement>('.lotv2-pane');
  panes.forEach(pane => {
    const idx = parseInt(pane.dataset.pane || '0', 10);
    const ctl = heroCtls[idx];
    if (!ctl) return;
    // Crosshair marker (editor-only)
    const ring = document.createElement('div');
    ring.className = 'gen-focal-ring';
    ring.style.left = `${ctl.fx.value}%`;
    ring.style.top = `${ctl.fy.value}%`;
    pane.appendChild(ring);
    pane.classList.add('gen-pane-editable');
    pane.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      focalDragActive = true;
      const rect = pane.getBoundingClientRect();
      const apply = (ev: PointerEvent) => {
        const fx = Math.round(Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100)));
        const fy = Math.round(Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100)));
        ctl.fx.value = String(fx); ctl.fxVal.textContent = `${fx}%`;
        ctl.fy.value = String(fy); ctl.fyVal.textContent = `${fy}%`;
        onFormChange();
      };
      apply(e as PointerEvent);
      const mv = (ev: PointerEvent) => apply(ev);
      const up = () => {
        focalDragActive = false;
        window.removeEventListener('pointermove', mv);
        window.removeEventListener('pointerup', up);
        refreshPreview();   // rebind fresh panes after the drag session
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
    });
    pane.addEventListener('wheel', (e) => {
      e.preventDefault();
      const cur = parseInt(ctl.scale.value, 10) || 100;
      const next = Math.max(40, Math.min(220, cur + (e.deltaY > 0 ? -5 : 5)));
      ctl.scale.value = String(next);
      ctl.scaleVal.textContent = `${next}%`;
      onFormChange();
    }, { passive: false });
  });
}

// ---- Bordplan ----
function populateBordplanForm(item: BordplanItem) {
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
  syncOriginGrid();
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
    li.innerHTML = `<span><code>${id}</code> — ${desc.join(', ') || '—'}</span><button class="ov-clear pp-btn pp-btn--ghost" data-id="${id}">Ryd</button>`;
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
      if (bpMode === 'tables') {
        // Direct toggle: remove / restore the table (v2 spec)
        toggleBpTable(cell, tableId);
      } else {
        openOverridePopover(cell, tableId);
      }
    });
  });
}
function toggleBpTable(cell: HTMLElement, tableId: string) {
  const baseItem = itemsBank.find(i => i.id === selectedId);
  if (!isBordplanItem(baseItem)) return;
  const isGhost = cell.classList.contains('bp-ghost');
  const cellMatch = /^c(\d+)r(\d+)$/.exec(tableId);
  if (isGhost) {
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
  } else {
    baseItem.overrides = baseItem.overrides || {};
    const next = { ...(baseItem.overrides[tableId] || {}) };
    next.active = false;
    baseItem.overrides[tableId] = next;
  }
  setDirty(true);
  refreshPreview();
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
  pop.style.position = 'fixed';
  pop.style.left = `${rect.right + 8}px`;
  pop.style.top  = `${rect.top}px`;
  pop.innerHTML = `
    <span class="pop-id">${tableId}</span>
    ${isGhost
      ? `<span class="pop-note">Ghost-celle. Gendan?</span>
         <div class="pop-actions"><button class="pop-restore pp-btn">Gendan bord</button></div>`
      : `<input type="text" class="pp-input" placeholder="label-override (fx VIP)" value="${escapeHtml(current.label ?? '')}" />
         <div class="pop-actions">
           <button class="pop-save pp-btn pp-btn--green">Gem label</button>
           <button class="pop-del pp-btn">${current.active === false ? 'Aktiver' : 'Deaktiver'}</button>
         </div>`}
  `;
  document.body.appendChild(pop);
  popoverEl = pop;
  if (isGhost) {
    pop.querySelector('.pop-restore')!.addEventListener('click', () => {
      toggleBpTable(anchor, tableId);
      closePopover();
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
[bpActiveEl, bpLabelEl, bpEventNameEl, bpColsEl, bpRowsEl, bpSeatsEl, bpColAislesEl, bpRowAislesEl, bpRemovedEl, bpNumModeEl, bpNumOriginEl, bpNumDirEl, bpNumClusterDirEl, bpNumStartEl, bpNumPrefixEl, bpNumSkipEl]
  .forEach(el => el.addEventListener('input', () => { setDirty(true); refreshPreview(); }));

// ---- Cover ----
function populateCoverForm(item: CoverItem) {
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
  covLogoUploadEl.value = '';
});
covLogoFileEl.addEventListener('input', updateCoverLogoPreview);
covLogoScaleEl.addEventListener('input', () => {
  covLogoScaleVal.textContent = covLogoScaleEl.value + '%';
});
[covActiveEl, covLabelEl, covTitleEl, covSubtitleEl, covAttributionEl, covLogoFileEl, covLogoScaleEl]
  .forEach(el => el.addEventListener('input', () => { setDirty(true); refreshPreview(); }));

// ---- Closing ----
function populateClosingForm(item: ClosingItem) {
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

// ---- Auction-display ----
const DEFAULT_TEAM_COLORS: Record<string, { base: string; live: string }> = {
  A: { base: '#1f6e34', live: '#3ed170' },
  B: { base: '#a06a14', live: '#f0b048' },
  C: { base: '#9a2b1f', live: '#e85a44' },
  D: { base: '#2a5a9e', live: '#6aa9e8' },
};
let adTeamsDraft: AuctionTeam[] = [];
function defaultTeams(): AuctionTeam[] {
  return ['A', 'B', 'C', 'D'].map(id => ({
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
      <input type="text" class="pp-input" data-idx="${idx}" data-field="name" value="${(tm.name || '').replace(/"/g, '&quot;')}" placeholder="Hold-navn" />
      <span class="ad-color-pair">
        <input type="color" data-idx="${idx}" data-field="baseColor" value="${base}" title="Pre-event farve (mørk)" />
        <input type="color" data-idx="${idx}" data-field="liveColor" value="${live}" title="Live-auktion farve (lys)" />
      </span>
      <input type="number" class="pp-input" data-idx="${idx}" data-field="preAmount" value="${tm.preAmount || 0}" min="0" step="500" placeholder="pre kr" />
      <span class="ad-lot-pair">
        ${(() => {
          const existing = tm.lotIds && tm.lotIds.length ? [...tm.lotIds] : (tm.lotId ? [tm.lotId] : []);
          const slotCount = Math.min(12, existing.length + 1);
          let out = '';
          for (let i = 0; i < slotCount; i++) {
            const current = existing[i] || '';
            out += `<select class="pp-input" data-idx="${idx}" data-field="lotSlot" data-slot="${i}">
              <option value="">(lot ${i + 1})</option>
              ${lots.map(l => `<option value="${l.id}" ${current === l.id ? 'selected' : ''}>${(l.title || l.id).slice(0, 22)}</option>`).join('')}
            </select>`;
          }
          return out;
        })()}
      </span>
      <input type="text" class="pp-input ad-lot-title" data-idx="${idx}" data-field="lotTitle" value="${(tm.lot?.title || '').replace(/"/g, '&quot;')}" placeholder="Lot-titel (vises i pause/auction)" />
      <input type="text" class="pp-input ad-lot-desc" data-idx="${idx}" data-field="lotDesc" value="${(tm.lot?.description || '').replace(/"/g, '&quot;')}" placeholder="Lot-beskrivelse" />
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
    tm.lotId = undefined;
    renderAdTeamsList();
  }
  else if (field === 'lotTitle') { tm.lot = { ...(tm.lot || {}), title: t.value }; }
  else if (field === 'lotDesc') { tm.lot = { ...(tm.lot || {}), description: t.value }; }
  setDirty(true);
  if (field === 'baseColor' || field === 'liveColor') {
    const row = (t.closest('.ad-team-row') as HTMLElement | null);
    const dot = row?.querySelector('.ad-palette-dot') as HTMLElement | null;
    if (dot) {
      dot.style.background = `linear-gradient(135deg, ${tm.baseColor || '#888'} 50%, ${tm.liveColor || '#ccc'} 50%)`;
    }
  }
  refreshPreview();
});
function populateAuctionDisplayForm(item: AuctionDisplayItem) {
  adActiveEl.checked = !!item.active;
  adLabelEl.value = item.label ?? '';
  adScreenEl.value = item.screen || 'intro';
  const teams = (EVENT_META.teams && EVENT_META.teams.length) ? EVENT_META.teams : defaultTeams();
  adTeamsDraft = teams.map(t => ({ ...t, lot: t.lot ? { ...t.lot } : { title: '', description: '' } }));
  renderAdTeamsList();
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
[adActiveEl, adLabelEl, adScreenEl, adActiveLotEl, adRevealCountEl, adRankingEl, adNamesVisibleEl, adShowBaseLabelEl]
  .forEach(el => el.addEventListener('input', () => { setDirty(true); refreshPreview(); }));

// ---- Media ----
function populateMediaForm(item: MediaItem) {
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
      if (/\.(mp4|webm|mov|m4v|ogv)$/i.test(data.filename)) mdModeEl.value = 'video';
      else mdModeEl.value = 'image';
      mdOnChange();
    }
  } catch (e: any) { statusEl.textContent = 'Media upload failed: ' + e.message; }
  mdUploadEl.value = '';
});

// ---- Wish-loop ----
async function loadApplePool() {
  try {
    const res = await fetch('/api/apples');
    const data = await res.json();
    wlApplePool = (data.files || []).sort();
  } catch { wlApplePool = []; }
}
function renderWishLoopAppleList() {
  wlAppleListEl.innerHTML = '';
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
    li.draggable = selected;
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
wlSponsorLogoUploadEl.addEventListener('change', async () => {
  const file = wlSponsorLogoUploadEl.files?.[0];
  if (!file) return;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const fd = new FormData();
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
      if (selectedId) {
        try {
          const updated = await api(`/api/lots/${encodeURIComponent(selectedId)}`, {
            method: 'PUT', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sponsorLogo: url, sponsorMode: 'logo' }),
          });
          syncBank(updated);
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

// ---- Sponsor-index ----
function populateSponsorIndexForm(item: SponsorIndexItem) {
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

// ---- Carousel ----
function populateCarouselForm(item: CarouselItem) {
  carActiveEl.checked = !!item.active;
  carLabelEl.value = item.label ?? '';
  carImages = (item.images || []).map(im => ({ ...im }));
  carFadeEl.value = String(item.fadeMs ?? 2000);
  carFadeVal.textContent = `${carFadeEl.value} ms`;
  carDefaultSecEl.value = String(item.defaultSeconds ?? 10);
  carDefaultSecVal.textContent = `${carDefaultSecEl.value} s`;
  carTickerEl.checked = item.showTicker ?? false;
  renderCarouselList();
}
function readCarouselForm(): Partial<CarouselItem> {
  return {
    active: carActiveEl.checked,
    label: carLabelEl.value,
    images: carImages,
    fadeMs: parseInt(carFadeEl.value, 10) || 2000,
    defaultSeconds: parseInt(carDefaultSecEl.value, 10) || 10,
    showTicker: carTickerEl.checked,
  };
}
function renderCarouselList() {
  carListEl.innerHTML = '';
  carImages.forEach((im, i) => {
    const cell = document.createElement('div');
    cell.className = 'gen-gal-item';
    cell.innerHTML = `
      <div class="gen-gal-thumb" style="background-image:url('${im.src}')">
        <button type="button" data-i="${i}" title="Fjern">✕</button>
      </div>
      <input type="number" class="pp-input" data-sec="${i}" min="1" max="120" placeholder="sek" value="${im.seconds ?? ''}" title="Skærmtid i sekunder — tom = standard" />
    `;
    carListEl.appendChild(cell);
  });
  if (!carImages.length) {
    carListEl.innerHTML = '<span class="pp-hint">INGEN BILLEDER ENDNU</span>';
  }
}
carListEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-i]');
  if (!btn) return;
  carImages.splice(parseInt(btn.dataset.i!, 10), 1);
  renderCarouselList();
  setDirty(true); refreshPreview();
});
carListEl.addEventListener('input', (e) => {
  const inp = (e.target as HTMLElement).closest<HTMLInputElement>('input[data-sec]');
  if (!inp) return;
  const i = parseInt(inp.dataset.sec!, 10);
  const v = parseFloat(inp.value);
  carImages[i].seconds = Number.isFinite(v) ? v : undefined;
  setDirty(true); refreshPreview();
});
carUploadEl.addEventListener('change', async () => {
  const files = Array.from(carUploadEl.files || []);
  if (!files.length) return;
  for (const file of files) {
    const fd = new FormData();
    fd.append('kind', 'carousel');
    fd.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data?.filename) carImages.push({ src: `/assets/carousel/${data.filename}` });
    } catch (e: any) { statusEl.textContent = 'Upload failed: ' + e.message; }
  }
  carUploadEl.value = '';
  renderCarouselList();
  setDirty(true); refreshPreview();
});
carFadeEl.addEventListener('input', () => { carFadeVal.textContent = `${carFadeEl.value} ms`; setDirty(true); refreshPreview(); });
carDefaultSecEl.addEventListener('input', () => { carDefaultSecVal.textContent = `${carDefaultSecEl.value} s`; setDirty(true); refreshPreview(); });
[carActiveEl, carLabelEl, carTickerEl].forEach(el => el.addEventListener('input', () => { setDirty(true); refreshPreview(); }));

// ---- Contest ----
function populateContestForm(item: ContestItem) {
  ctActiveEl.checked = !!item.active;
  ctLabelEl.value = item.label ?? '';
  ctTitleEl.value = item.title ?? '';
  ctSubtitleEl.value = item.subtitle ?? '';
  ctBlocks = (item.blocks || []).map(b => ({ ...b, lines: [...(b.lines || [])] }));
  renderContestBlocks();
}
function readContestForm(): Partial<ContestItem> {
  return {
    active: ctActiveEl.checked,
    label: ctLabelEl.value,
    title: ctTitleEl.value,
    subtitle: ctSubtitleEl.value,
    blocks: ctBlocks,
  };
}
function renderContestBlocks() {
  ctBlockListEl.innerHTML = '';
  ctBlocks.forEach((b, i) => {
    const el = document.createElement('div');
    el.className = 'gen-ct-block';
    el.innerHTML = `
      <div class="gen-gal-thumb" style="background-image:url('${b.src || ''}')">
        <button type="button" data-del="${i}" title="Fjern blok">✕</button>
      </div>
      <input type="text" class="pp-input" data-head="${i}" placeholder="Overskrift" value="${escapeHtml(b.heading || '')}" />
      <textarea class="pp-input" data-lines="${i}" rows="3" placeholder="1-3 linjer info — én pr. linje">${escapeHtml((b.lines || []).join('\n'))}</textarea>
    `;
    ctBlockListEl.appendChild(el);
  });
  if (!ctBlocks.length) {
    ctBlockListEl.innerHTML = '<span class="pp-hint">INGEN BLOKKE ENDNU</span>';
  }
}
ctBlockListEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-del]');
  if (!btn) return;
  ctBlocks.splice(parseInt(btn.dataset.del!, 10), 1);
  renderContestBlocks();
  setDirty(true); refreshPreview();
});
ctBlockListEl.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement | HTMLTextAreaElement;
  if (t.dataset.head !== undefined) ctBlocks[parseInt(t.dataset.head!, 10)].heading = t.value;
  else if (t.dataset.lines !== undefined) ctBlocks[parseInt(t.dataset.lines!, 10)].lines = t.value.split('\n').map(s => s.trim()).filter(Boolean);
  else return;
  setDirty(true); refreshPreview();
});
ctUploadEl.addEventListener('change', async () => {
  const files = Array.from(ctUploadEl.files || []);
  if (!files.length) return;
  for (const file of files) {
    if (ctBlocks.length >= 4) break;
    const fd = new FormData();
    fd.append('kind', 'contest');
    fd.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data?.filename) ctBlocks.push({ src: `/assets/contest/${data.filename}`, lines: [] });
    } catch (e: any) { statusEl.textContent = 'Upload failed: ' + e.message; }
  }
  ctUploadEl.value = '';
  renderContestBlocks();
  setDirty(true); refreshPreview();
});
[ctActiveEl, ctLabelEl, ctTitleEl, ctSubtitleEl].forEach(el => el.addEventListener('input', () => { setDirty(true); refreshPreview(); }));
secLabelEl.addEventListener('input', () => { setDirty(true); refreshPreview(); });

// ---- Lot form bindings ----
function onFormChange() {
  setDirty(true);
  refreshPreview();
  renderValidation();
  const cur = lotsBank.find(l => l.id === selectedId);
  refreshAdvSummary(cur);
}
[fActive, fExtra, fExtraSuffix, fTitle, fSubtitle, fSponsor, fBullets, fDonorNames, fMirrored, fTitleSize]
  .forEach(el => el.addEventListener('input', onFormChange));
fActive.addEventListener('change', () => {
  fActiveHint.textContent = fActive.checked ? '' : '— skjult i viewer og controller';
});
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
fHorizonCap.addEventListener('input', () => {
  fHorizonCapVal.textContent = `${fHorizonCap.value}in`;
  onFormChange();
});
fProfilePhoto.addEventListener('input', () => {
  fProfilePhotoVal.textContent = `${fProfilePhoto.value}in`;
  onFormChange();
});
resetFocalBtn.addEventListener('click', () => {
  fFocalX.value = '50'; fFocalXVal.textContent = '50%';
  fFocalY.value = '50'; fFocalYVal.textContent = '50%';
  fScale.value = '100'; fScaleVal.textContent = '100%';
  onFormChange();
});

// ---- Save (dispatch by selected kind) ----
function syncBank(updated: any) {
  const idx = itemsBank.findIndex(i => i.id === updated.id);
  if (idx >= 0) itemsBank[idx] = updated;
  const lotIdx = lotsBank.findIndex(l => l.id === updated.id);
  if (lotIdx >= 0) lotsBank[lotIdx] = updated;
}
async function saveSelected() {
  if (!selectedId) return;
  const item = itemsBank.find(i => i.id === selectedId);
  if (!item) return;
  const kind = itemKind(item);
  if (kind === 'lot' && !renderValidation()) {
    statusEl.textContent = 'Kan ikke gemme — ret fejl først';
    toast('Kan ikke gemme — ret fejl først');
    return;
  }
  let patch: any;
  switch (kind) {
    case 'lot': patch = readForm(); break;
    case 'bordplan': patch = readBordplanForm(); break;
    case 'cover': patch = readCoverForm(); break;
    case 'closing': patch = readClosingForm(); break;
    case 'sponsor-index': patch = readSponsorIndexForm(); break;
    case 'wish-loop': patch = readWishLoopForm(); break;
    case 'media': patch = readMediaForm(); break;
    case 'auction-display': patch = readAuctionDisplayItem(); break;
    case 'section': patch = { label: secLabelEl.value }; break;
    case 'carousel': patch = readCarouselForm(); break;
    case 'contest': patch = readContestForm(); break;
  }
  try {
    statusEl.textContent = 'Gemmer…';
    const updated = await api(`/api/lots/${encodeURIComponent(selectedId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    syncBank(updated);
    if (kind === 'auction-display') {
      await fetch('/api/meta', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ teams: adTeamsDraft }),
      });
      EVENT_META.teams = adTeamsDraft;
    }
    savedAt = nowHHMM();
    setDirty(false);
    renderList();
    refreshPreview();
    statusEl.textContent = '';
    toast('Gemt — broadcastet til controller, viewer og auktionarius');
  } catch (e: any) {
    statusEl.textContent = 'Save failed: ' + e.message;
  }
}
saveBtn.addEventListener('click', saveSelected);

// ---- Template picker ----
function renderPicker() {
  tplGrid.innerHTML = '';
  for (const kind of PICKER_ORDER) {
    const m = TYPE_META[kind];
    const btn = document.createElement('button');
    btn.className = 'gen-tpl-card';
    btn.innerHTML = `
      <span class="head"><span class="pp-dot" style="background:${m.dot}"></span><strong>${m.name}</strong></span>
      <span class="desc">${m.desc}</span>
    `;
    btn.addEventListener('click', () => createItem(kind));
    tplGrid.appendChild(btn);
  }
}
function openPicker() { tplScrim.classList.add('open'); }
function closePicker() { tplScrim.classList.remove('open'); }
openPickerBtn.addEventListener('click', openPicker);
tplClose.addEventListener('click', closePicker);
tplScrim.addEventListener('click', (e) => { if (e.target === tplScrim) closePicker(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && tplScrim.classList.contains('open')) closePicker();
});

function newItemPayload(kind: Kind): any {
  switch (kind) {
    case 'lot': return {
      title: '', subtitle: 'Pakken inkluderer', sponsor: '', bullets: [],
      active: false, extra: false, layout: 'horizon', focal: '50% 50%',
    };
    case 'section': return { kind: 'section', label: 'Ny sektion' };
    case 'cover': return {
      kind: 'cover', active: true, label: 'Cover',
      title: 'AUKTION', subtitle: 'STJERNEGOLF 2026',
      attribution: 'AUKTION VED KASPER NIELSEN', logoFile: 'artsolo-logo.png',
    };
    case 'bordplan': return {
      kind: 'bordplan', active: true,
      label: 'Stjernegolf 2026 bordplan', eventName: 'STJERNEGOLF 2026',
      config: {
        cols: 9, rows: 11, seatsPerTable: 4,
        colAislesAfter: [], rowAislesAfter: [3, 6],
        removedCells: [],
        numbering: {
          mode: 'cluster-continuous', origin: 'top-left',
          direction: 'col-major', clusterDirection: 'col-major',
          startAt: 1, prefix: '', skip: [],
        },
      },
      overrides: {},
    };
    case 'sponsor-index': return { kind: 'sponsor-index', active: true, label: 'Sponsor-indeks', title: 'AUKTIONENS SPONSORER' };
    case 'closing': return {
      kind: 'closing', active: true, label: 'Closing',
      title: 'TAK TIL ALLE VORES SPONSORER', tagline: '@KIDSAIDDK · KIDSAID DANMARK',
      cols: 8, logos: [],
    };
    case 'wish-loop': return {
      kind: 'wish-loop', active: true,
      label: `Ønske-loop ${itemsBank.filter(i => itemKind(i) === 'wish-loop').length + 1}`,
      videoSrc: '/assets/wish-loop/bg.mp4', cards: [],
      direction: 'stack', perCardSeconds: 5, stackDepth: 3,
      pauseOnHover: true, videoBlur: 36, videoDarken: 0.5, chrome: true,
      sponsorMark: 'Ønskeskyen',
    };
    case 'media': return { kind: 'media', active: true, label: 'Media', mode: 'image', src: '', fit: 'cover', bgColor: '#000000' };
    case 'auction-display': return {
      kind: 'auction-display', active: true,
      label: `Auktion-display ${itemsBank.filter(i => itemKind(i) === 'auction-display').length + 1}`,
      screen: 'intro', activeLot: 0, revealCount: 0,
      ranking: false, namesVisible: true, showBaseLabel: true,
    };
    case 'carousel': return { kind: 'carousel', active: true, label: 'Billedkarrusel', images: [], fadeMs: 2000, defaultSeconds: 10, showTicker: false };
    case 'contest': return { kind: 'contest', active: true, label: 'Konkurrence', title: 'KONKURRENCE', subtitle: '', blocks: [] };
  }
}
async function createItem(kind: Kind) {
  closePicker();
  try {
    const created = await api('/api/lots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(newItemPayload(kind)),
    });
    // Insert after the selected item (server appends at the end).
    itemsBank.push(created);
    const selIdx = itemsBank.findIndex(i => i.id === selectedId);
    if (selIdx >= 0 && selIdx < itemsBank.length - 2) {
      const [moved] = itemsBank.splice(itemsBank.length - 1, 1);
      itemsBank.splice(selIdx + 1, 0, moved);
      await api('/api/lots/reorder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order: itemsBank.map(i => i.id) }),
      });
    }
    lotsBank = itemsBank.filter(i => itemKind(i) === 'lot') as Lot[];
    renderList();
    selectLot(created.id);
    toast(`${TYPE_META[kind].name} tilføjet — udfyld og gem`);
  } catch (e: any) {
    statusEl.textContent = 'Create failed: ' + e.message;
  }
}

// ---- Duplicate / Delete ----
duplicateBtn.addEventListener('click', async () => {
  if (!selectedId) return;
  const item = itemsBank.find(i => i.id === selectedId);
  if (!item) return;
  if (dirty && !confirm('Du har ugemte ændringer. Duplikér uden at gemme dem?')) return;
  const dup: any = JSON.parse(JSON.stringify(item));
  delete dup.id;
  if (itemKind(item) === 'lot') {
    dup.title = ((item as Lot).title || 'Lot') + ' (kopi)';
    dup.active = false;
  } else if (dup.label) {
    dup.label += ' (kopi)';
    if ('active' in dup) dup.active = false;
  }
  try {
    const created = await api('/api/lots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(dup),
    });
    itemsBank.push(created);
    lotsBank = itemsBank.filter(i => itemKind(i) === 'lot') as Lot[];
    renderList();
    selectLot(created.id);
    toast('Duplikeret');
  } catch (e: any) {
    statusEl.textContent = 'Duplicate failed: ' + e.message;
  }
});
deleteBtn.addEventListener('click', async () => {
  if (!selectedId) return;
  const item = itemsBank.find(i => i.id === selectedId);
  if (!confirm(`Slet "${item ? itemLabel(item) : selectedId}"? Kan ikke fortrydes.`)) return;
  try {
    await api(`/api/lots/${encodeURIComponent(selectedId)}`, { method: 'DELETE' });
    const idx = itemsBank.findIndex(i => i.id === selectedId);
    itemsBank = itemsBank.filter(i => i.id !== selectedId);
    lotsBank = itemsBank.filter(i => itemKind(i) === 'lot') as Lot[];
    const next = itemsBank[Math.min(Math.max(0, idx), itemsBank.length - 1)];
    selectedId = next?.id ?? null;
    renderList();
    if (selectedId) selectLot(selectedId);
    else { previewFrame.innerHTML = ''; deleteBtn.style.display = 'none'; duplicateBtn.style.display = 'none'; }
    toast('Slettet');
  } catch (e: any) {
    statusEl.textContent = 'Delete failed: ' + e.message;
  }
});

// ---- Uploads (hero) ----
async function uploadFile(kind: 'hero', file: File, imgIndex = 1) {
  if (!selectedId) return;
  const fd = new FormData();
  fd.append('kind', kind);
  fd.append('lotId', selectedId);
  if (imgIndex > 1) fd.append('imgIndex', String(imgIndex));
  fd.append('file', file);
  try {
    statusEl.textContent = 'Uploader billede…';
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    statusEl.textContent = 'Billede uploadet';
    const ext = (data.filename?.split('.').pop()?.toLowerCase()) || 'jpg';
    const lot = lotsBank.find(l => l.id === selectedId);
    if (data.filename) {
      if (imgIndex === 1) {
        if (lot) lot.heroExt = ext;
      } else if (lot) {
        lot.heroImages = lot.heroImages || [];
        while (lot.heroImages.length < imgIndex - 1) lot.heroImages.push({});
        lot.heroImages[imgIndex - 2].ext = ext;
      }
    }
    const v = Date.now();
    if (imgIndex === 1) {
      heroPreview.src = `/assets/hero/lot-${selectedId}_FINAL.${lot?.heroExt || 'jpg'}?v=${v}`;
    } else {
      heroCtls[imgIndex - 1].preview.src = `/assets/hero/lot-${selectedId}_FINAL${imgIndex}.${ext}?v=${v}`;
      setDirty(true);
    }
    refreshPreview();
  } catch (e: any) {
    statusEl.textContent = 'Upload failed: ' + e.message;
  }
}
fHero.addEventListener('change', () => { if (fHero.files?.[0]) uploadFile('hero', fHero.files[0]); });
heroCtls.forEach((c, i) => {
  if (i === 0) return;
  c.upload.addEventListener('change', () => { if (c.upload.files?.[0]) uploadFile('hero', c.upload.files[0], i + 1); });
});

// ---- Topbar tabs ----
document.getElementById('tab-controller')!.addEventListener('click', () => {
  if (dirty && !confirm('Du har ugemte ændringer. Forlad Generator?')) return;
  window.location.href = '/controller.html';
});
document.getElementById('tab-output')!.addEventListener('click', () => {
  window.open('/', '_blank', 'noopener,noreferrer');
});
document.getElementById('tab-auctioneer')!.addEventListener('click', () => {
  window.open('/auctioneer.html', '_blank', 'noopener,noreferrer');
});

// ---- Resize: refit preview ----
window.addEventListener('resize', () => {
  const slideEl = previewFrame.querySelector<HTMLElement>('.slide-canvas');
  const wrap = previewFrame.querySelector<HTMLElement>('.slide-frame');
  if (slideEl && wrap) fitToViewport(wrap, slideEl);
});

// ---- Boot ----
renderPicker();
applyBpMode();
setDirty(false);
loadApplePool();
loadBank();
