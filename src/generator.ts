// Lot Generator — operator UI for editing the lot bank live.
// Reads + writes through /api/lots; broadcasts ws 'lots-updated' so the
// viewer / auctioneer / controller refresh themselves on save.

import { renderSlide, fitToViewport } from './render';
import type { Lot, BordplanItem, DeckItem } from './slides';
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
let selectedId: string | null = null;
let dirty = false;

function itemKind(item: DeckItem | undefined): 'lot' | 'bordplan' {
  if (item && (item as any).kind === 'bordplan') return 'bordplan';
  return 'lot';
}
function isBordplanItem(item: DeckItem | undefined): item is BordplanItem {
  return !!item && (item as any).kind === 'bordplan';
}

// ---- Bordplan form DOM ----
const formLot = document.getElementById('gen-form')!;
const formBordplan = document.getElementById('gen-form-bordplan')!;
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
    if (!selectedId && itemsBank.length) selectLot(itemsBank[0].id);
    else if (selectedId) selectLot(selectedId);
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
  const byId = new Map(lotsBank.map(l => [l.id, l]));
  lotsBank = order.map(id => byId.get(id)!).filter(Boolean);
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
  const item = itemsBank.find(i => i.id === id);
  if (!item) return;
  const kind = itemKind(item);
  if (kind === 'bordplan') {
    formLot.style.display = 'none';
    formBordplan.style.display = 'flex';
    populateBordplanForm(item as BordplanItem);
  } else {
    formLot.style.display = 'flex';
    formBordplan.style.display = 'none';
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
  duplicateBtn.style.display = 'none';
  resetFocalBtn.style.display = 'none';
  fActive.checked = !!item.active;
  // Reuse the active checkbox in the lot form? Bordplan has no extra/title etc.
  // For now we drive active via the bordplan save (config + active in single PUT).
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
    active: fActive.checked,
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
[bpLabelEl, bpEventNameEl, bpColsEl, bpRowsEl, bpSeatsEl, bpColAislesEl, bpRowAislesEl, bpRemovedEl, bpNumModeEl, bpNumOriginEl, bpNumDirEl, bpNumClusterDirEl, bpNumStartEl, bpNumPrefixEl, bpNumSkipEl]
  .forEach(el => el.addEventListener('input', () => { setDirty(true); refreshPreview(); }));

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
  const lot = lotsBank.find(l => l.id === selectedId);
  if (!lot) return;
  if (dirty && !confirm('Du har ugemte ændringer. Duplicate uden at gemme dem?')) return;
  const dup = {
    ...lot,
    id: undefined,    // server assigns new UUID
    title: lot.title + ' (kopi)',
    active: false,
  };
  delete (dup as any).id;
  try {
    const created = await api('/api/lots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(dup),
    });
    lotsBank.push(created);
    selectedId = created.id;
    renderList();
    populateForm(created);
    refreshPreview();
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
