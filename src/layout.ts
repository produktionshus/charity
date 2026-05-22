// Per-lot layout helpers. Source of truth lives in lots.json (layout,
// mirrored, focal, titleSizePt fields on each lot). These helpers just
// read those fields off the lot object.

import { lotById } from './slides';

export function lotLayout(id: string): 'profile' | 'horizon' {
  return lotById(id)?.layout ?? 'horizon';
}

export function isMirrored(id: string): boolean {
  return !!lotById(id)?.mirrored;
}

export function photoFocal(id: string): string {
  return lotById(id)?.focal ?? '50% 50%';
}

// Per-lot title size override (lookup map kept for renderer convenience).
export const HORIZON_TITLE_SIZE_OVERRIDE: Record<string, number> = new Proxy({}, {
  get(_t, key: string) {
    return lotById(key)?.titleSizePt;
  },
}) as Record<string, number>;
