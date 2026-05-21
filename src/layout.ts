// Per-lot layout decisions: profile vs horizon, mirrored vs default,
// optional photo focal-position overrides. Mirrors the pptxgenjs build's
// LAYOUT + PROFILE_MIRROR + PROFILE_FRAME logic.

export const PROFILE_LOTS = new Set(['02', '05', '10', '11', '13', '14', '15', '16', '18', '19', '21']);
export const PROFILE_MIRROR = new Set(['15']);

// CSS object-position per lot. '50% 50%' = center. Override when the
// subject sits off-center in the source. Editable in PowerPoint analogue:
// user can tweak via DevTools or a future controller knob.
export const PHOTO_FOCAL: Record<string, string> = {
  '01': '50% 70%',  // Smukfest gate in lower half
  '08': '50% 45%',  // safari elephants upper-middle
  '14': '50% 75%',  // OMEGA watch lower
  '17': '50% 65%',  // Eilersen sofa lower
  '21': '50% 30%',  // Malte Ebert face upper
};

export function lotLayout(num: string): 'profile' | 'horizon' {
  return PROFILE_LOTS.has(num) ? 'profile' : 'horizon';
}

export function isMirrored(num: string): boolean {
  return PROFILE_MIRROR.has(num);
}

export function photoFocal(num: string): string {
  return PHOTO_FOCAL[num] || '50% 50%';
}

// Per-lot title size override (matches HORIZON_TITLE_SIZE_OVERRIDE from build.js)
export const HORIZON_TITLE_SIZE_OVERRIDE: Record<string, number> = { '06': 22 };
