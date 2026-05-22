// Slide registry: id, type, optional lot reference. Used by all three views.
// Driven by lots.json — cover + sponsor index + active lot fronts + closing.
// Lot display number is derived dynamically from order so reordering /
// activation flips don't require any file rename.

import lotsJson from './lots.json';

export type SlideKind = 'cover' | 'sponsor-index' | 'lot' | 'closing';

export interface Slide {
  id: string;
  kind: SlideKind;
  lotId?: string;          // stable lot id (UUID or original digit)
  displayNum?: string;     // derived display number, e.g. "03" or "07A"
}

export interface Lot {
  id: string;
  title: string;
  subtitle: string;
  sponsor: string;
  bullets: string[];
  titleParts?: Array<{ text: string; bold?: boolean; break?: boolean }>;
  donorNames?: string[];
  active: boolean;
  extra: boolean;
  extraSuffix?: string | null;     // e.g. "A", "EXT" when extra is true
  layout: 'horizon' | 'profile';
  mirrored?: boolean;
  focal?: string;                   // CSS object-position, e.g. '50% 70%'
  titleSizePt?: number;             // horizon title size override
}

// All lots from the bank (active + inactive). Generator edits this list.
export const ALL_LOTS = (lotsJson.lots as Lot[]);

// Compute display-num: active non-extra lots get sequential 01..NN by order;
// extras get either their manually-set suffix or auto "<prev>A","<prev>B".
function computeDisplayNums(lots: Lot[]): Map<string, string> {
  const map = new Map<string, string>();
  let mainIdx = 0;
  let lastMain: number = 0;
  let extraLetterIdx = 0;
  for (const lot of lots) {
    if (!lot.active) continue;
    if (lot.extra) {
      const suffix = lot.extraSuffix?.trim();
      if (suffix) {
        map.set(lot.id, suffix);
      } else {
        const letter = String.fromCharCode(65 + extraLetterIdx);
        map.set(lot.id, `${String(lastMain).padStart(2, '0')}${letter}`);
        extraLetterIdx += 1;
      }
    } else {
      mainIdx += 1;
      lastMain = mainIdx;
      extraLetterIdx = 0;
      map.set(lot.id, String(mainIdx).padStart(2, '0'));
    }
  }
  return map;
}

export const ACTIVE_LOTS: Lot[] = ALL_LOTS.filter(l => l.active);
const DISPLAY_NUMS = computeDisplayNums(ALL_LOTS);

// Public LOTS export = active lots in order. Legacy code references LOTS;
// keep the name to limit churn.
export const LOTS = ACTIVE_LOTS;

export function lotById(id: string): Lot | undefined {
  return ALL_LOTS.find(l => l.id === id);
}
// Back-compat alias — many callers still use lotByNum(num); accept either.
export function lotByNum(idOrNum: string): Lot | undefined {
  return lotById(idOrNum);
}
export function displayNumFor(id: string): string {
  return DISPLAY_NUMS.get(id) ?? '';
}

export const SLIDES: Slide[] = [
  { id: 'cover', kind: 'cover' },
  { id: 'sponsor-index', kind: 'sponsor-index' },
  ...ACTIVE_LOTS.map(l => ({
    id: `lot-${l.id}`,
    kind: 'lot' as const,
    lotId: l.id,
    displayNum: DISPLAY_NUMS.get(l.id),
  })),
  { id: 'closing', kind: 'closing' },
];
