// Slide registry: id, type, optional lot reference. Used by all three views.
// Driven by lots.json — cover + sponsor index + lot fronts + closing.

import lotsJson from './lots.json';

export type SlideKind = 'cover' | 'sponsor-index' | 'lot' | 'closing';

export interface Slide {
  id: string;
  kind: SlideKind;
  lotNum?: string;
}

export const LOTS = lotsJson.lots as Array<{ num: string; title: string; subtitle: string; sponsor: string; bullets: string[]; titleParts?: Array<{ text: string; bold?: boolean; break?: boolean }>; donorNames?: string[] }>;

export const SLIDES: Slide[] = [
  { id: 'cover', kind: 'cover' },
  { id: 'sponsor-index', kind: 'sponsor-index' },
  ...LOTS.map(l => ({ id: `lot-${l.num}`, kind: 'lot' as const, lotNum: l.num })),
  { id: 'closing', kind: 'closing' },
];

export function lotByNum(num: string) {
  return LOTS.find(l => l.num === num);
}
