// Bordplan slide renderer — produces the 16:9 LED-screen layout for a
// FloorPlanConfig. Header + stage strip + table grid with aisle gaps,
// chair pads on the long sides of each table, anchor accents on the
// first table of each cluster.

import { generateTables, visualIndex, type FloorPlanConfig, type Table, type ClusterInfo } from './bordplan-engine';

// Cells share aspect 54:66 (handoff). At a 1280×720 internal slide-canvas
// scaling 1.5× to a 1920×1080 LED wall this resolves to exactly 54×66 on
// screen. We use fr-based templates so the grid fills available space —
// cell aspect-ratio CSS derives width from row-height.
function buildFrTemplate(count: number, aislesAfter: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    parts.push('1fr');
    if (aislesAfter.includes(i)) parts.push('0.5fr');
  }
  return parts.join(' ');
}

export interface BordplanRenderOpts {
  eventName?: string;
  org?: string;
  showStartArrow?: boolean;       // default true — small ▸ next to table 1
  showAnchorAccents?: boolean;    // default true — accent line on cluster firsts
  showDecadeAccents?: boolean;    // default false
  overrides?: Record<string, { label?: string; active?: boolean }>;
}

export function renderBordplanSlide(config: FloorPlanConfig, opts: BordplanRenderOpts = {}): string {
  const { tables, clusters } = generateTables(config);
  const overrides = opts.overrides || {};
  const eventName = opts.eventName ?? 'STJERNEGOLF 2026';
  const org = opts.org ?? 'KidsAid × Luminance';
  const showArrow = opts.showStartArrow ?? true;
  const showAnchor = opts.showAnchorAccents ?? true;
  const showDecade = opts.showDecadeAccents ?? false;

  // Apply overrides
  const renderedTables: Table[] = tables.map(t => ({
    ...t,
    label: overrides[t.id]?.label ?? t.label,
    active: overrides[t.id]?.active ?? t.active,
  }));

  const colAisles = config.colAislesAfter ?? [];
  const rowAisles = config.rowAislesAfter ?? [];

  // First table number in each cluster (for anchor accent)
  const clusterFirstNum = new Map<number, number>();
  for (const t of renderedTables) {
    if (!t.active || t.number == null) continue;
    if (!clusterFirstNum.has(t.cluster) || (clusterFirstNum.get(t.cluster)! > t.number)) {
      clusterFirstNum.set(t.cluster, t.number);
    }
  }
  const anchorIds = new Set<string>();
  for (const t of renderedTables) {
    if (t.active && t.number !== null && t.number === clusterFirstNum.get(t.cluster)) {
      anchorIds.add(t.id);
    }
  }

  const colTemplate = buildFrTemplate(config.cols, colAisles);
  const rowTemplate = buildFrTemplate(config.rows, rowAisles);
  const clusterAsTable = config.numbering.mode === 'cluster-as-table';

  // Cells indexed by visual position
  // Chairs: split the seat count evenly between left + right long sides.
  const seats = config.seatsPerTable;
  const chairsPerSide = Math.ceil(seats / 2);
  const chairPads = Array.from({ length: chairsPerSide })
    .map(() => `<div class="bp-chair"></div>`).join('');

  const cellsHtml = renderedTables.map(t => {
    const vc = visualIndex(t.col, colAisles);
    const vr = visualIndex(t.row, rowAisles);
    const isAnchor = anchorIds.has(t.id) && showAnchor;
    const isDecade = showDecade && t.number !== null && t.number % 10 === 0 && !isAnchor;
    const isGhost = !t.active;
    const classList = ['bp-table'];
    if (isAnchor) classList.push('bp-anchor');
    if (isDecade) classList.push('bp-decade');
    if (isGhost) classList.push('bp-ghost');
    const arrow = (showArrow && t.number === (config.numbering.startAt ?? 1))
      ? `<span class="bp-arrow">▸</span>` : '';
    return `
      <div class="${classList.join(' ')}" style="grid-column:${vc + 1};grid-row:${vr + 1}" data-table-id="${t.id}">
        ${isGhost ? '' : `<div class="bp-chairs left">${chairPads}</div>`}
        ${isGhost ? '' : `<div class="bp-chairs right">${chairPads}</div>`}
        <div class="bp-number">${arrow}${t.label || ''}</div>
      </div>
    `;
  }).join('');

  // Cluster-as-table mode: ONE small number per cluster, positioned just
  // outside the cluster's left edge. The label spans the first col of the
  // cluster but uses a translateX(-100%) trick + small offset to render to
  // the LEFT of that column. Consistent placement for every cluster,
  // whether there's an aisle in front of it or not.
  const clusterLabelsHtml = clusterAsTable
    ? clusters.map((cl: ClusterInfo) => {
        if (cl.clusterDisplayLabel == null) return '';
        const vcStart = visualIndex(cl.colStart, colAisles) + 1;
        const vrStart = visualIndex(cl.rowStart, rowAisles) + 1;
        const vrEnd   = visualIndex(cl.rowEnd,   rowAisles) + 1;
        return `
          <div class="bp-cluster-label" style="grid-column:${vcStart} / ${vcStart + 1}; grid-row:${vrStart} / ${vrEnd + 1}">
            <span>${cl.clusterDisplayLabel}</span>
          </div>
        `;
      }).join('')
    : '';

  const now = new Date();
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return `
    <div class="bp-slide">
      <header class="bp-header">
        <div class="bp-org"></div>
        <div class="bp-title-block">
          <div class="bp-title">${eventName}</div>
          <div class="bp-subtitle">BORDPLAN</div>
        </div>
        <div class="bp-meta"><span class="bp-clock">${clock}</span></div>
      </header>
      <div class="bp-stage-strip">
        <div class="bp-stage-side"></div>
        <div class="bp-stage"><span class="bp-stage-dot"></span>SCENE</div>
        <div class="bp-stage-side"></div>
      </div>
      <div class="bp-grid${clusterAsTable ? ' bp-grid--cluster' : ''}" style="grid-template-columns:${colTemplate};grid-template-rows:${rowTemplate}">
        ${cellsHtml}
        ${clusterLabelsHtml}
      </div>
    </div>
  `;
}
