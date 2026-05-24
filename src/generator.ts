// Lot Generator — operator UI for editing the lot bank live.
// Reads + writes through /api/lots; broadcasts ws 'lots-updated' so the
// viewer / auctioneer / controller refresh themselves on save.

import { renderSlide, renderCover, renderClosing, renderSponsorIndex, renderWishLoop, renderMedia, fitToViewport } from './render';
import type { Lot, BordplanItem, CoverItem, ClosingItem, SponsorIndexItem, WishLoopItem, MediaItem, DeckItem } from './slides';
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
const fHero      = document.getElementById('f-hero')     as HTMLInputElement;
const fLogo      = document.getElementById('f-logo')     as HTMLInputElement;
const heroPreview = document.getElementById('hero-preview') as HTMLImageElement;
const logoPreview = document.getElementById('logo-preview') as HTMLImageElement;

// ---- State ----
// itemsBank holds the full deck: lots + bordplan items (potentially other
// types later). Keep lotsBank alias for the existing UI code paths.
let itemsBank: DeckItem[] = [];
let lotsBank: Lot[] = [];     // filtered alias = items where kind!=='bordplan'
let selectedId: string | null = sessionStorage.getItem('gen.selectedId');
let dirty = false;

function itemKind(item: DeckItem | undefined): 'lot' | 'bordplan' | 'cover' | 'closing' | 'sponsor-index' | 'wish-loop' | 'media' {
  if (item && (item as any).kind === 'bordplan') return 'bordplan';
  if (item && (item as any).kind === 'cover') return 'cover';
  if (item && (item as any).kind === 'closing') return 'closing';
  if (item && (item as any).kind === 'sponsor-index') return 'sponsor-index';
  if (item && (item as any).kind === 'wish-loop') return 'wish-loop';
  if (item && (item as any).kind === 'media') return 'media';
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
const wlAppleListEl  = document.getElementById('wl-apple-list')!;
const wlAppleUploadEl = document.getElementById('wl-apple-upload') as HTMLInputElement;
const wlSaveBtn      = document.getElementById('wl-save')!;
let wlApplePool: string[] = [];     // alle filer i /assets/apples/
let wlSelectedCards: Array<{ id: number | string; src: string | null; alt?: string }> = [];

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
const mdVideoOptsEl = document.getElementById('md-video-opts')!;
const mdSaveBtn    = document.getElementById('md-save')!;

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
const covActiveEl      = document.getElementById('cov-active')     as HTMLInputElement;
const covSaveBtn       = document.getElementById('cov-save')!;
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
  if (kind === 'media') {
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
  fFocalX.value = String(focal[0] || 50); fFocalXVal.textContent = `${focal[0] || 50}%`;
  fFocalY.value = String(focal[1] || 50); fFocalYVal.textContent = `${focal[1] || 50}%`;
  const scalePct = Math.round((lot.heroScale ?? 1) * 100);
  fScale.value = String(scalePct);
  fScaleVal.textContent = `${scalePct}%`;
  fTitleSize.value = lot.titleSizePt ? String(lot.titleSizePt) : '';
  heroPreview.src = `/assets/hero/lot-${lot.id}_FINAL.${lot.heroExt || 'jpg'}?v=${Date.now()}`;
  logoPreview.src = `/assets/logo/logo-lot-${lot.id}.png?v=${Date.now()}`;
}

function readForm(): Partial<Lot> {
  // Parse the title field as markdown — **bold** segments + newline for
  // forced line break. Plain title becomes the concatenated text.
  const titleParts = markdownToParts(fTitle.value);
  const plainTitle = titleParts ? partsToPlainText(titleParts).replace(/\n/g, ' ').trim() : fTitle.value.trim();
  return {
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
  if (isMediaItem(item)) {
    const merged: MediaItem = { ...item, ...readMediaForm() } as MediaItem;
    const slideEl = document.createElement('div');
    slideEl.className = 'slide-canvas slide-media';
    slideEl.classList.add('is-visible', 'no-build');
    slideEl.innerHTML = renderMedia(merged);
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
  const parentRect = previewFrame.getBoundingClientRect();
  pop.style.left = `${rect.right - parentRect.left + 8}px`;
  pop.style.top  = `${rect.top - parentRect.top}px`;
  pop.innerHTML = `
    <span class="pop-id">${tableId}</span>
    ${isGhost
      ? `<span style="font-size:11px;color:var(--text-c2)">Ghost-celle. Gendan?</span>
         <div class="pop-actions"><button class="pop-restore">Gendan via removed-list</button></div>`
      : `<input type="text" placeholder="label-override (fx VIP)" value="${escapeHtml(current.label ?? '')}" />
         <div class="pop-actions">
           <button class="pop-save">Gem label</button>
           <button class="pop-del">${current.active === false ? 'Aktiver' : 'Deaktiver'}</button>
         </div>`}
  `;
  previewFrame.appendChild(pop);
  popoverEl = pop;

  if (isGhost) {
    pop.querySelector('.pop-restore')!.addEventListener('click', () => {
      // Strip the cell from config.removedCells
      const cellMatch = /^c(\d+)r(\d+)$/.exec(tableId);
      if (!cellMatch) return;
      const c = parseInt(cellMatch[1], 10);
      const r = parseInt(cellMatch[2], 10);
      baseItem.config.removedCells = (baseItem.config.removedCells || [])
        .filter(cc => !(cc.col === c && cc.row === r));
      bpRemovedEl.value = formatCellList1(baseItem.config.removedCells);
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
}
function readCoverForm(): Partial<CoverItem> {
  return {
    active: covActiveEl.checked,
    label: covLabelEl.value,
    title: covTitleEl.value,
    subtitle: covSubtitleEl.value,
    attribution: covAttributionEl.value,
    logoFile: covLogoFileEl.value || undefined,
  };
}
[covActiveEl, covLabelEl, covTitleEl, covSubtitleEl, covAttributionEl, covLogoFileEl]
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
  mdLoopEl.checked     = item.videoLoop     ?? true;
  mdMutedEl.checked    = item.videoMuted    ?? true;
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
  };
}
function mdOnChange() {
  mdVideoOptsEl.style.display = mdModeEl.value === 'video' ? '' : 'none';
  setDirty(true);
  refreshPreview();
}
[mdActiveEl, mdLabelEl, mdModeEl, mdSrcEl, mdAltEl, mdFitEl, mdBgEl, mdAutoplayEl, mdLoopEl, mdMutedEl]
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
    cards: wlSelectedCards,
  };
}
function wlOnChange() { setDirty(true); refreshPreview(); }
[wlActiveEl, wlLabelEl, wlSponsorEl, wlVideoSrcEl, wlDirectionEl, wlStackDepthEl, wlChromeEl, wlPauseHoverEl,
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
[fActive, fExtra, fExtraSuffix, fTitle, fSubtitle, fSponsor, fBullets, fDonorNames, fLayout, fMirrored, fTitleSize]
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
    const idx = lotsBank.findIndex(l => l.id === selectedId);
    if (idx >= 0) lotsBank[idx] = updated;
    setDirty(false);
    renderList();
    refreshPreview();
    statusEl.textContent = 'Gemt';
  } catch (e: any) {
    statusEl.textContent = 'Save failed: ' + e.message;
  }
});

// ---- New / Delete ----
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
        logos: [],
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
async function uploadFile(kind: 'hero' | 'logo', file: File) {
  if (!selectedId) return;
  // Order matters — multer parses fields top-down, and the destination
  // / filename callbacks only see body fields appended BEFORE the file.
  const fd = new FormData();
  fd.append('kind', kind);
  fd.append('lotId', selectedId);
  fd.append('file', file);
  try {
    statusEl.textContent = `Uploader ${kind}…`;
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    statusEl.textContent = `${kind} uploadet`;
    // For hero, sync heroExt onto the in-memory lot so subsequent renders
    // resolve the right URL without a full reload.
    if (kind === 'hero' && data.filename) {
      const ext = data.filename.split('.').pop()?.toLowerCase() || 'jpg';
      const lot = lotsBank.find(l => l.id === selectedId);
      if (lot) lot.heroExt = ext;
    }
    const v = Date.now();
    const lot = lotsBank.find(l => l.id === selectedId);
    if (kind === 'hero') heroPreview.src = `/assets/hero/lot-${selectedId}_FINAL.${lot?.heroExt || 'jpg'}?v=${v}`;
    else logoPreview.src = `/assets/logo/logo-lot-${selectedId}.png?v=${v}`;
    refreshPreview();
  } catch (e: any) {
    statusEl.textContent = 'Upload failed: ' + e.message;
  }
}
fHero.addEventListener('change', () => { if (fHero.files?.[0]) uploadFile('hero', fHero.files[0]); });
fLogo.addEventListener('change', () => { if (fLogo.files?.[0]) uploadFile('logo', fLogo.files[0]); });

// ---- Open controller in new window ----
openCtrlBtn.addEventListener('click', () => {
  window.open('/controller.html', '_blank', 'noopener,noreferrer');
});

// ---- Boot ----
loadBank();
