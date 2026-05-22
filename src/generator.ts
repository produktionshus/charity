// Lot Generator — operator UI for editing the lot bank live.
// Reads + writes through /api/lots; broadcasts ws 'lots-updated' so the
// viewer / auctioneer / controller refresh themselves on save.

import { renderSlide, fitToViewport } from './render';
import type { Lot } from './slides';

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
const saveBtn    = document.getElementById('save-lot')!;
const saveMeta   = document.getElementById('gen-save-meta')!;
const previewFrame = document.getElementById('gen-preview-frame')!;
const previewMeta  = document.getElementById('preview-meta')!;

const fActive    = document.getElementById('f-active')   as HTMLInputElement;
const fExtra     = document.getElementById('f-extra')    as HTMLInputElement;
const rowExtraSuffix = document.getElementById('row-extra-suffix')!;
const fExtraSuffix = document.getElementById('f-extra-suffix') as HTMLInputElement;
const fTitle     = document.getElementById('f-title')    as HTMLInputElement;
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
const fTitleSize = document.getElementById('f-title-size') as HTMLInputElement;
const fHero      = document.getElementById('f-hero')     as HTMLInputElement;
const fLogo      = document.getElementById('f-logo')     as HTMLInputElement;
const heroPreview = document.getElementById('hero-preview') as HTMLImageElement;
const logoPreview = document.getElementById('logo-preview') as HTMLImageElement;

// ---- State ----
let lotsBank: Lot[] = [];
let selectedId: string | null = null;
let dirty = false;

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
    lotsBank = data.lots;
    statusEl.textContent = `${lotsBank.length} lots indlæst`;
    renderList();
    if (!selectedId && lotsBank.length) selectLot(lotsBank[0].id);
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
  listMeta.textContent = `${lotsBank.filter(l => l.active).length} aktive · ${lotsBank.length} total`;
  for (const lot of lotsBank) {
    const row = document.createElement('div');
    row.className = 'gen-row';
    row.dataset.id = lot.id;
    row.draggable = true;
    if (lot.id === selectedId) row.classList.add('selected');
    if (!lot.active) row.classList.add('inactive');
    if (lot.extra) row.classList.add('extra');
    const dn = displayNums.get(lot.id) ?? '—';
    const badge = !lot.active ? 'INACTIVE' : lot.extra ? 'EXTRA' : '';
    row.innerHTML = `
      <span class="drag-handle">⋮⋮</span>
      <span class="gen-row-num">${dn}</span>
      <span class="gen-row-title">${escapeHtml(lot.title || '(uden titel)')}</span>
      <span class="gen-row-badge">${badge}</span>
    `;
    row.addEventListener('click', () => selectLot(lot.id));
    row.addEventListener('dragstart', onDragStart);
    row.addEventListener('dragover', onDragOver);
    row.addEventListener('drop', onDrop);
    row.addEventListener('dragend', onDragEnd);
    listRows.appendChild(row);
  }
}

let draggingId: string | null = null;
function onDragStart(e: DragEvent) {
  const row = e.currentTarget as HTMLElement;
  draggingId = row.dataset.id!;
  row.classList.add('dragging');
  e.dataTransfer!.effectAllowed = 'move';
  e.dataTransfer!.setData('text/plain', draggingId);
}
function onDragOver(e: DragEvent) {
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'move';
  const target = e.currentTarget as HTMLElement;
  if (!draggingId || target.dataset.id === draggingId) return;
  // Move dragged element above or below target depending on cursor Y
  const rect = target.getBoundingClientRect();
  const before = e.clientY < rect.top + rect.height / 2;
  const dragRow = listRows.querySelector(`[data-id="${draggingId}"]`)!;
  if (before) target.parentElement!.insertBefore(dragRow, target);
  else target.parentElement!.insertBefore(dragRow, target.nextSibling);
}
async function onDrop(e: DragEvent) {
  e.preventDefault();
  if (!draggingId) return;
  // Read new order from DOM
  const order = Array.from(listRows.querySelectorAll<HTMLElement>('.gen-row'))
    .map(el => el.dataset.id!);
  // Reorder in local memory
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
  (e.currentTarget as HTMLElement).classList.remove('dragging');
  draggingId = null;
}

// ---- Select + form binding ----
function selectLot(id: string) {
  if (dirty && id !== selectedId) {
    if (!confirm('Du har ugemte ændringer. Skift lot og kassér?')) return;
  }
  selectedId = id;
  const lot = lotsBank.find(l => l.id === id);
  if (!lot) return;
  populateForm(lot);
  refreshPreview();
  renderList();   // update selected highlight
  setDirty(false);
}

function populateForm(lot: Lot) {
  editIdEl.textContent = lot.id;
  editDisplayNumEl.textContent = computeDisplayNums().get(lot.id) ?? '—';
  deleteBtn.style.display = 'inline-flex';
  fActive.checked = !!lot.active;
  fExtra.checked  = !!lot.extra;
  rowExtraSuffix.style.display = lot.extra ? '' : 'none';
  fExtraSuffix.value = lot.extraSuffix ?? '';
  fTitle.value = lot.title || '';
  fSubtitle.value = lot.subtitle || '';
  fSponsor.value = lot.sponsor || '';
  fBullets.value = (lot.bullets || []).join('\n');
  fDonorNames.value = (lot.donorNames || []).join('\n');
  fLayout.value = lot.layout || 'horizon';
  fMirrored.checked = !!lot.mirrored;
  const focal = (lot.focal || '50% 50%').replace(/%/g, '').split(/\s+/).map(s => parseInt(s, 10));
  fFocalX.value = String(focal[0] || 50); fFocalXVal.textContent = `${focal[0] || 50}%`;
  fFocalY.value = String(focal[1] || 50); fFocalYVal.textContent = `${focal[1] || 50}%`;
  fTitleSize.value = lot.titleSizePt ? String(lot.titleSizePt) : '';
  heroPreview.src = `/assets/hero/lot-${lot.id}_FINAL.jpg?v=${Date.now()}`;
  logoPreview.src = `/assets/logo/logo-lot-${lot.id}.png?v=${Date.now()}`;
}

function readForm(): Partial<Lot> {
  return {
    active: fActive.checked,
    extra:  fExtra.checked,
    extraSuffix: fExtraSuffix.value.trim() || null,
    title: fTitle.value,
    subtitle: fSubtitle.value,
    sponsor: fSponsor.value,
    bullets: fBullets.value.split('\n').map(s => s.trim()).filter(Boolean),
    donorNames: fDonorNames.value.split('\n').map(s => s.trim()).filter(Boolean),
    layout: fLayout.value as 'horizon' | 'profile',
    mirrored: fMirrored.checked,
    focal: `${fFocalX.value}% ${fFocalY.value}%`,
    titleSizePt: fTitleSize.value ? parseInt(fTitleSize.value, 10) : undefined,
  };
}

function setDirty(v: boolean) {
  dirty = v;
  saveMeta.className = 'gen-save-meta' + (v ? ' dirty' : ' saved');
  saveMeta.textContent = v ? 'UGEMTE ÆNDRINGER' : 'GEMT';
  if (!v && !selectedId) saveMeta.textContent = '';
}

// ---- Preview ----
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
}

function refreshPreview() {
  if (!selectedId) return;
  const baseLot = lotsBank.find(l => l.id === selectedId);
  if (!baseLot) return;
  const livePatch = readForm();
  const merged: Lot = { ...baseLot, ...livePatch } as Lot;
  previewFrame.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'slide-frame';
  previewFrame.appendChild(wrap);
  const slide = { id: `lot-${merged.id}`, kind: 'lot' as const, lotId: merged.id };
  const dn = computeDisplayNums().get(merged.id) ?? '—';
  previewMeta.textContent = `${merged.layout || 'horizon'}${merged.mirrored ? ' · mirror' : ''} · vises som ${dn}`;
  const slideEl = renderSlide(slide, merged, dn);
  slideEl.classList.add('is-visible', 'no-build');
  wrap.appendChild(slideEl);
  requestAnimationFrame(() => fitToViewport(wrap, slideEl));
}

// ---- Form bindings ----
function onFormChange() {
  setDirty(true);
  refreshPreview();
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

// ---- Save ----
saveBtn.addEventListener('click', async () => {
  if (!selectedId) return;
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
  const fd = new FormData();
  fd.append('file', file);
  fd.append('kind', kind);
  fd.append('lotId', selectedId);
  try {
    statusEl.textContent = `Uploader ${kind}…`;
    await fetch('/api/upload', { method: 'POST', body: fd });
    statusEl.textContent = `${kind} uploadet`;
    // Refresh image previews + main preview (cache bust)
    const v = Date.now();
    if (kind === 'hero') heroPreview.src = `/assets/hero/lot-${selectedId}_FINAL.jpg?v=${v}`;
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
