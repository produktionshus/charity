// Bordplan engine — pure functions ported from prototype/bordplan.jsx.
// generateTables(config) → { tables, clusters }
// Numbering, cluster decomposition, sort directions, ghost cells.

export type NumberingMode = 'across' | 'cluster-continuous' | 'cluster-prefix';
export type Origin = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type Direction = 'row-major' | 'col-major' | 'snake-row' | 'snake-col';

export interface NumberingRule {
  mode: NumberingMode;
  origin: Origin;
  direction: Direction;
  clusterDirection?: Direction;
  startAt?: number;
  prefix?: string;
  skip?: number[];
}

export interface FloorPlanConfig {
  cols: number;
  rows: number;
  seatsPerTable: number;
  colAislesAfter?: number[];   // 0-indexed
  rowAislesAfter?: number[];   // 0-indexed
  removedCells?: Array<{ col: number; row: number }>;
  numbering: NumberingRule;
}

export interface Table {
  id: string;                      // c{col}r{row}
  label: string;
  number: number | null;
  seats: number;
  active: boolean;
  removedFromConfig?: boolean;
  col: number;
  row: number;
  cluster: number;
  clusterLabel: string;
}

export interface ClusterInfo {
  index: number;
  letter: string;
  orderIndex: number;
  colStart: number; colEnd: number;
  rowStart: number; rowEnd: number;
  count: number;
  rangeText: string;
}

function transformCoord(col: number, row: number, origin: Origin, cols: number, rows: number) {
  switch (origin) {
    case 'top-left':     return { col,             row             };
    case 'top-right':    return { col: cols-1-col, row             };
    case 'bottom-left':  return { col,             row: rows-1-row };
    case 'bottom-right': return { col: cols-1-col, row: rows-1-row };
  }
}

function sortCells<T extends { col: number; row: number }>(cells: T[], origin: Origin, direction: Direction, cols: number, rows: number): T[] {
  cells.sort((a, b) => {
    const A = transformCoord(a.col, a.row, origin, cols, rows);
    const B = transformCoord(b.col, b.row, origin, cols, rows);
    if (direction === 'row-major') return A.row - B.row || A.col - B.col;
    if (direction === 'col-major') return A.col - B.col || A.row - B.row;
    if (direction === 'snake-row') {
      if (A.row !== B.row) return A.row - B.row;
      return A.row % 2 === 0 ? A.col - B.col : B.col - A.col;
    }
    if (direction === 'snake-col') {
      if (A.col !== B.col) return A.col - B.col;
      return A.col % 2 === 0 ? A.row - B.row : B.row - A.row;
    }
    return 0;
  });
  return cells;
}

interface RawCluster {
  index: number;
  clusterCol: number;
  clusterRow: number;
  colStart: number; colEnd: number;
  rowStart: number; rowEnd: number;
  letter?: string;
  orderIndex?: number;
}

export function decomposeClusters(cols: number, rows: number, colAislesAfter: number[], rowAislesAfter: number[]): RawCluster[] {
  const colBounds = [0, ...colAislesAfter.map(a => a + 1), cols];
  const rowBounds = [0, ...rowAislesAfter.map(a => a + 1), rows];
  const clusters: RawCluster[] = [];
  for (let ri = 0; ri < rowBounds.length - 1; ri++) {
    for (let ci = 0; ci < colBounds.length - 1; ci++) {
      const colStart = colBounds[ci];
      const colEnd = colBounds[ci + 1] - 1;
      const rowStart = rowBounds[ri];
      const rowEnd = rowBounds[ri + 1] - 1;
      if (colEnd < colStart || rowEnd < rowStart) continue;
      clusters.push({
        index: clusters.length,
        clusterCol: ci, clusterRow: ri,
        colStart, colEnd, rowStart, rowEnd,
      });
    }
  }
  return clusters;
}

export function letterFor(i: number): string {
  if (i < 26) return String.fromCharCode(65 + i);
  return String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
}

function makeTable(cell: { col: number; row: number }, label: string, number: number, seats: number, clusterIdx: number, clusterLabel: string): Table {
  return {
    id: `c${cell.col}r${cell.row}`,
    label, number, seats, active: true,
    col: cell.col, row: cell.row,
    cluster: clusterIdx, clusterLabel,
  };
}

export function generateTables(cfg: FloorPlanConfig): { tables: Table[]; clusters: ClusterInfo[] } {
  const { cols, rows, seatsPerTable, numbering } = cfg;
  const colAislesAfter = cfg.colAislesAfter ?? [];
  const rowAislesAfter = cfg.rowAislesAfter ?? [];
  const removedCells = cfg.removedCells ?? [];

  const isRemoved = (c: number, r: number) =>
    removedCells.some(cell => cell.col === c && cell.row === r);

  const clusters = decomposeClusters(cols, rows, colAislesAfter, rowAislesAfter);
  const clusterCols = colAislesAfter.length + 1;
  const clusterRows = rowAislesAfter.length + 1;
  const clusterDirection = numbering.clusterDirection || numbering.direction;

  // Order clusters by clusterDirection
  type ClusterSortable = RawCluster & { col: number; row: number };
  const orderedClusters: ClusterSortable[] = clusters.map(c => ({ ...c, col: c.clusterCol, row: c.clusterRow }));
  sortCells(orderedClusters, numbering.origin, clusterDirection, clusterCols, clusterRows);
  orderedClusters.forEach((c, i) => { c.letter = letterFor(i); c.orderIndex = i; });
  const clusterMeta = new Map<number, ClusterSortable>(orderedClusters.map(c => [c.index, c]));

  const skipSet = new Set<number>(numbering.skip || []);
  let globalN = numbering.startAt || 1;
  const result: Table[] = [];

  if (numbering.mode === 'across') {
    const allCells: Array<{ col: number; row: number }> = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (isRemoved(c, r)) continue;
        allCells.push({ col: c, row: r });
      }
    }
    sortCells(allCells, numbering.origin, numbering.direction, cols, rows);
    for (const cell of allCells) {
      while (skipSet.has(globalN)) globalN++;
      const cluster = clusters.find(cl =>
        cell.col >= cl.colStart && cell.col <= cl.colEnd &&
        cell.row >= cl.rowStart && cell.row <= cl.rowEnd);
      const meta = clusterMeta.get(cluster!.index)!;
      const label = `${numbering.prefix || ''}${globalN}`;
      result.push(makeTable(cell, label, globalN, seatsPerTable, cluster!.index, meta.letter!));
      globalN++;
    }
  } else {
    for (const cl of orderedClusters) {
      const cells: Array<{ col: number; row: number }> = [];
      for (let r = cl.rowStart; r <= cl.rowEnd; r++) {
        for (let c = cl.colStart; c <= cl.colEnd; c++) {
          if (isRemoved(c, r)) continue;
          cells.push({ col: c, row: r });
        }
      }
      sortCells(cells, numbering.origin, numbering.direction, cols, rows);
      let localN = 1;
      for (const cell of cells) {
        while (skipSet.has(globalN)) globalN++;
        const label = numbering.mode === 'cluster-prefix'
          ? `${cl.letter}${localN}`
          : `${numbering.prefix || ''}${globalN}`;
        result.push(makeTable(cell, label, globalN, seatsPerTable, cl.index, cl.letter!));
        globalN++; localN++;
      }
    }
  }

  // Cluster info with ranges
  const clusterInfo: ClusterInfo[] = orderedClusters.map(cl => {
    const tables = result.filter(t => t.cluster === cl.index);
    const labels = tables.map(t => t.label);
    const first = labels[0] || '';
    const last = labels[labels.length - 1] || '';
    return {
      index: cl.index, letter: cl.letter!, orderIndex: cl.orderIndex!,
      colStart: cl.colStart, colEnd: cl.colEnd, rowStart: cl.rowStart, rowEnd: cl.rowEnd,
      count: tables.length,
      rangeText: tables.length ? (first === last ? first : `${first} – ${last}`) : '',
    };
  });

  // Ghost cells (removed via config) — clickable in admin mode
  for (const cell of removedCells) {
    if (cell.col < 0 || cell.col >= cols || cell.row < 0 || cell.row >= rows) continue;
    const cluster = clusters.find(cl =>
      cell.col >= cl.colStart && cell.col <= cl.colEnd &&
      cell.row >= cl.rowStart && cell.row <= cl.rowEnd);
    result.push({
      id: `c${cell.col}r${cell.row}`,
      label: '', number: null, seats: seatsPerTable, active: false,
      removedFromConfig: true,
      col: cell.col, row: cell.row,
      cluster: cluster ? cluster.index : 0,
      clusterLabel: cluster ? clusterMeta.get(cluster.index)!.letter! : '',
    });
  }

  return { tables: result, clusters: clusterInfo };
}

export function buildGridTemplate(count: number, gapsAfter: number[] | undefined, gapFr = 0.7): string {
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    parts.push('1fr');
    if (gapsAfter && gapsAfter.includes(i)) parts.push(`${gapFr}fr`);
  }
  return parts.join(' ');
}

export function visualIndex(logicalIdx: number, gapsAfter: number[] | undefined): number {
  if (!gapsAfter) return logicalIdx;
  let extra = 0;
  for (const g of gapsAfter) if (g < logicalIdx) extra++;
  return logicalIdx + extra;
}

// Stjernegolf 2026 preset — seed entry
export const STJERNEGOLF_PRESET: FloorPlanConfig = {
  cols: 9,
  rows: 11,
  seatsPerTable: 4,
  colAislesAfter: [],
  rowAislesAfter: [3, 6],
  removedCells: [
    { col: 3, row: 10 },
    { col: 4, row: 10 },
    { col: 5, row: 10 },
  ],
  numbering: {
    mode: 'cluster-continuous',
    origin: 'top-left',
    direction: 'col-major',
    clusterDirection: 'col-major',
    startAt: 1,
    prefix: '',
    skip: [],
  },
};
