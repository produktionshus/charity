// Shared helpers for applying event-meta (theme + brand colors) to the page.
// Used by controller (read + write), viewer + auctioneer (read-only).

import { EVENT_META } from './slides';
import type { EventMeta } from './slides';

export type BrandColors = { primary?: string; gold?: string; ink?: string };

export function applyBrandColors(c: BrandColors) {
  const root = document.documentElement.style;
  const set = (p: string, v: string) => root.setProperty(p, v, 'important');
  if (c.primary) {
    set('--green', c.primary);
    set('--green-dark', `color-mix(in srgb, ${c.primary} 75%, black)`);
    set('--green-200', `color-mix(in srgb, ${c.primary} 55%, white)`);
    set('--green-300', `color-mix(in srgb, ${c.primary} 70%, white)`);
    set('--green-400', c.primary);
    set('--green-500', `color-mix(in srgb, ${c.primary} 85%, black)`);
    set('--green-600', `color-mix(in srgb, ${c.primary} 70%, black)`);
    set('--green-700', `color-mix(in srgb, ${c.primary} 55%, black)`);
    set('--accent-glow', `color-mix(in srgb, ${c.primary} 50%, transparent)`);
  } else {
    ['--green','--green-dark','--green-200','--green-300','--green-400','--green-500','--green-600','--green-700','--accent-glow']
      .forEach(p => root.removeProperty(p));
  }
  if (c.gold) {
    set('--gold', c.gold);
    set('--gold-soft', `color-mix(in srgb, ${c.gold} 60%, black)`);
  } else {
    root.removeProperty('--gold');
    root.removeProperty('--gold-soft');
  }
  if (c.ink) {
    set('--ink', c.ink);
    set('--text-c', c.ink);
  } else {
    root.removeProperty('--ink');
    root.removeProperty('--text-c');
  }
}

export function applyTheme(name: string) {
  document.body.classList.remove('theme-forest', 'theme-marine', 'theme-dark', 'theme-kidsaid');
  const valid = ['marine', 'dark', 'forest', 'kidsaid'].includes(name) ? name : 'kidsaid';
  document.body.classList.add(`theme-${valid}`);
}

// Apply theme + brand colors from server-side EVENT_META. Falls back to
// localStorage for theme + brand colors when server hasn't set them yet
// (keeps current single-browser behavior intact during migration).
export function applyChromeFromMeta(meta: EventMeta = EVENT_META) {
  const theme = meta.theme || localStorage.getItem('controller.theme') || 'kidsaid';
  applyTheme(theme);
  if (meta.brandColors) {
    applyBrandColors(meta.brandColors);
  } else {
    let c: BrandColors = {};
    try { c = JSON.parse(localStorage.getItem('brand.colors') || '{}'); } catch {}
    applyBrandColors(c);
  }
}
