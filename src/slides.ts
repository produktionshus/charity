// Slide registry: id, type, optional lot reference. Used by all three views.
// Driven by lots.json — cover + sponsor index + active lot fronts + closing.
// Lot display number is derived dynamically from order so reordering /
// activation flips don't require any file rename.

import lotsJson from './lots.json';
import type { FloorPlanConfig } from './bordplan-engine';

export type SlideKind = 'cover' | 'sponsor-index' | 'lot' | 'closing' | 'bordplan' | 'wish-loop' | 'media' | 'auction-display';

export interface Slide {
  id: string;
  kind: SlideKind;
  lotId?: string;            // stable lot id (UUID or original digit)
  displayNum?: string;       // derived display number, e.g. "03" or "07A"
  itemId?: string;           // for non-lot items (bordplan etc.) — id from lots.json item
}

export interface BordplanItem {
  id: string;
  kind: 'bordplan';
  active: boolean;
  label?: string;            // human-friendly name shown in the generator
  config: FloorPlanConfig;
  overrides?: Record<string, { label?: string; active?: boolean }>;
  eventName?: string;        // header text override
  org?: string;
}

export interface CoverItem {
  id: string;
  kind: 'cover';
  active: boolean;
  label?: string;            // generator label
  title?: string;            // big word, default "AUKTION"
  subtitle?: string;         // default "STJERNEGOLF 2026"
  attribution?: string;      // default "AUKTION VED KASPER NIELSEN"
  logoFile?: string;         // relative to /assets/, default 'artsolo-logo.png'
}

export interface ClosingItem {
  id: string;
  kind: 'closing';
  active: boolean;
  label?: string;
  title?: string;            // default "TAK TIL ALLE VORES SPONSORER"
  tagline?: string;          // default "@KIDSAIDDK · KIDSAID DANMARK"
  cols?: number;             // default 8
  logos: Array<{ file: string; kind?: 'wordmark' | 'stacked' }>;
}

export interface SponsorIndexItem {
  id: string;
  kind: 'sponsor-index';
  active: boolean;
  label?: string;
  title?: string;            // default "AUKTIONENS SPONSORER"
}

export interface AuctionDisplayItem {
  id: string;
  kind: 'auction-display';
  active: boolean;
  label?: string;
  // Each AD slide carries its own full screen-state. Deck navigation
  // walks through pre-configured AD items in order — no central state.
  screen: AuctionScreen;
  revealCount?: number;
  activeLot?: number;          // index into meta.teams (0..3)
  ranking?: boolean;
  namesVisible?: boolean;
  showBaseLabel?: boolean;
}

export interface MediaItem {
  id: string;
  kind: 'media';
  active: boolean;
  label?: string;
  mode: 'image' | 'video';
  src: string;                 // path under /assets/media/ or absolute URL
  alt?: string;
  videoMuted?: boolean;        // default true (needed for autoplay)
  videoLoop?: boolean;         // default true
  videoAutoplay?: boolean;     // default true
  fit?: 'cover' | 'contain';   // default 'cover'
  bgColor?: string;            // letterbox colour when fit='contain'; default black
  showTicker?: boolean;        // per-instance ticker visibility (default true)
}

export interface WishLoopItem {
  id: string;
  kind: 'wish-loop';
  active: boolean;
  label?: string;
  videoSrc?: string;                                         // url to bg video
  cards: Array<{ id: number | string; src: string | null; alt?: string }>;
  direction?: 'stack' | 'cinema' | 'drift';
  perCardSeconds?: number;
  stackDepth?: number;
  pauseOnHover?: boolean;
  videoBlur?: number;
  videoDarken?: number;
  chrome?: boolean;
  // Top-left eyebrow chrome (editable)
  eyebrowPretitle?: string;        // default 'Stjernegolf 2026 · Auktion'
  eyebrowTitle?: string;           // default 'Børnenes ønsker'
  // Sponsor mark (top-right)
  sponsorEnabled?: boolean;        // default true
  sponsorPretitle?: string;        // default 'Præsenteret af' — fx 'I samarbejde med'
  sponsorMode?: 'text' | 'logo';   // default 'text'
  sponsorMark?: string;            // text value
  sponsorLogo?: string;            // path to transparent PNG (relative to /assets/wish-loop/ or absolute)
  showTicker?: boolean;            // per-instance ticker visibility (default true)
}

export interface Lot {
  id: string;
  kind?: 'lot';                     // optional discriminator (default 'lot')
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
  heroExt?: string;                 // hero file extension (jpg|png|webp...), default 'jpg'
  heroScale?: number;               // zoom multiplier on the hero image, default 1.0
  sound?: SoundConfig;              // per-lot sound config (persisted to lots.json)
  // Optional override path for the main sponsor logo (e.g. when using an
  // .svg instead of the default logo-lot-<id>.png).
  sponsorLogoSrc?: string;
  // Additional sponsor logos rendered horizontally next to the main one.
  // Stored as relative paths under /assets/logo/.
  extraSponsorLogos?: string[];
  // Optional per-lot layout tweaks. Horizon caption height + profile photo
  // width are in inches; defaults are 2.25in and 5.8in respectively.
  horizonCaptionIn?: number;
  profilePhotoIn?: number;
}

export interface SoundConfig {
  initSound?: string;
  hammerSound?: string;
  initStartOffset?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  initVolume?: number;     // 0..1.5 — multiplier (1.0 = original)
  hammerVolume?: number;   // 0..1.5
}

export type DeckItem = Lot | BordplanItem | CoverItem | ClosingItem | SponsorIndexItem | WishLoopItem | MediaItem | AuctionDisplayItem;
function isLot(item: DeckItem): item is Lot {
  return (item as any).kind === undefined || (item as any).kind === 'lot';
}
function isBordplan(item: DeckItem): item is BordplanItem {
  return (item as any).kind === 'bordplan';
}
function isCover(item: DeckItem): item is CoverItem {
  return (item as any).kind === 'cover';
}
function isClosing(item: DeckItem): item is ClosingItem {
  return (item as any).kind === 'closing';
}
function isSponsorIndex(item: DeckItem): item is SponsorIndexItem {
  return (item as any).kind === 'sponsor-index';
}
function isWishLoop(item: DeckItem): item is WishLoopItem {
  return (item as any).kind === 'wish-loop';
}
function isMedia(item: DeckItem): item is MediaItem {
  return (item as any).kind === 'media';
}
function isAuctionDisplay(item: DeckItem): item is AuctionDisplayItem {
  return (item as any).kind === 'auction-display';
}

// All items from the bank (active + inactive). Generator edits this list.
// Lots have no kind field (or 'lot'); bordplan items use kind='bordplan'.
export const ALL_ITEMS: DeckItem[] = (lotsJson.lots as DeckItem[]);
// Back-compat alias: most existing code treats this as a Lot[] list.
export const ALL_LOTS = ALL_ITEMS.filter(isLot) as Lot[];

export type AuctionScreen = 'intro' | 'reveal' | 'total' | 'pause' | 'auction' | 'final';

export interface AuctionTeam {
  id: 'A' | 'B' | 'C' | 'D';
  name: string;
  // Custom 2-tone palette per team. baseColor = darker (pre-event segment),
  // liveColor = brighter (live auction segment). Falls back to defaults if
  // not set.
  baseColor?: string;
  liveColor?: string;
  // Legacy field — preserved for migration but no longer required.
  palette?: 'A' | 'B' | 'C' | 'D';
  preAmount: number;
  // Extra donations announced during the event but outside the lot auction
  // (e.g. someone pledges a check from the floor). Folded into the live
  // segment of the bar so the visual just shows a fresh burst of growth.
  bonusAmount?: number;
  lotId?: string;            // legacy single-lot binding (kept for migration)
  lotIds?: string[];         // current — a team can have multiple lots; their bids are summed
  lot?: { title?: string; description?: string };
}

export interface AuctionDisplayState {
  screen: AuctionScreen;
  revealCount: number;             // 0..4
  activeLot: number;               // 0..3 (index i teams array)
  ranking: boolean;
  namesVisible: boolean;
  showBaseLabel: boolean;
}

// Event-wide meta (bid presets etc.). Mutated by refreshLotsFromServer.
export interface EventMeta {
  bidPresets?: number[];
  brandColors?: { primary?: string; gold?: string; ink?: string };
  eventName?: string;
  eventSubtitle?: string;
  eventDate?: string;        // ISO YYYY-MM-DD
  theme?: 'forest' | 'marine' | 'dark' | 'kidsaid';
  soundDefaults?: SoundConfig;
  teams?: AuctionTeam[];
  sponsorTicker?: {
    enabled?: boolean;
    prefix?: string;       // intro text e.g. "Vi takker vores dejlige sponsorer:"
    sponsors?: string[];   // list of company names, no logos
    speedSec?: number;     // seconds per full marquee loop (default 60)
  };
}
export const EVENT_META: EventMeta = (lotsJson as any).meta || {};

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

function buildSlides(): Slide[] {
  const slides: Slide[] = [];
  let hasCover = false;
  let hasClosing = false;
  let hasSponsorIndex = false;
  let lotsEmitted = false;
  const flushSponsorIndex = () => {
    if (!slides.some(s => s.kind === 'sponsor-index')) {
      slides.push({ id: 'sponsor-index', kind: 'sponsor-index' });
    }
  };
  for (const item of ALL_ITEMS) {
    if (!item.active) continue;
    if (isBordplan(item)) {
      slides.push({ id: `bordplan-${item.id}`, kind: 'bordplan', itemId: item.id });
    } else if (isCover(item)) {
      slides.push({ id: `cover-${item.id}`, kind: 'cover', itemId: item.id });
      hasCover = true;
    } else if (isClosing(item)) {
      slides.push({ id: `closing-${item.id}`, kind: 'closing', itemId: item.id });
      hasClosing = true;
    } else if (isSponsorIndex(item)) {
      slides.push({ id: `sponsor-index-${item.id}`, kind: 'sponsor-index', itemId: item.id });
      hasSponsorIndex = true;
    } else if (isWishLoop(item)) {
      slides.push({ id: `wish-loop-${item.id}`, kind: 'wish-loop', itemId: item.id });
    } else if (isMedia(item)) {
      slides.push({ id: `media-${item.id}`, kind: 'media', itemId: item.id });
    } else if (isAuctionDisplay(item)) {
      slides.push({ id: `auction-display-${item.id}`, kind: 'auction-display', itemId: item.id });
    } else if (isLot(item)) {
      if (!lotsEmitted) {
        if (!hasSponsorIndex) flushSponsorIndex();
        lotsEmitted = true;
      }
      slides.push({
        id: `lot-${item.id}`, kind: 'lot',
        lotId: item.id, displayNum: DISPLAY_NUMS.get(item.id),
      });
    }
  }
  if (!hasCover) slides.unshift({ id: 'cover', kind: 'cover' });
  if (!lotsEmitted && !hasSponsorIndex) flushSponsorIndex();
  if (!hasClosing) slides.push({ id: 'closing', kind: 'closing' });
  return slides;
}

export function bordplanById(id: string): BordplanItem | undefined {
  const item = ALL_ITEMS.find(i => i.id === id && isBordplan(i));
  return item as BordplanItem | undefined;
}
export function coverById(id: string): CoverItem | undefined {
  const item = ALL_ITEMS.find(i => i.id === id && isCover(i));
  return item as CoverItem | undefined;
}
export function closingById(id: string): ClosingItem | undefined {
  const item = ALL_ITEMS.find(i => i.id === id && isClosing(i));
  return item as ClosingItem | undefined;
}
export function sponsorIndexById(id: string): SponsorIndexItem | undefined {
  const item = ALL_ITEMS.find(i => i.id === id && isSponsorIndex(i));
  return item as SponsorIndexItem | undefined;
}
export function wishLoopById(id: string): WishLoopItem | undefined {
  const item = ALL_ITEMS.find(i => i.id === id && isWishLoop(i));
  return item as WishLoopItem | undefined;
}
export function mediaById(id: string): MediaItem | undefined {
  const item = ALL_ITEMS.find(i => i.id === id && isMedia(i));
  return item as MediaItem | undefined;
}
export function auctionDisplayById(id: string): AuctionDisplayItem | undefined {
  const item = ALL_ITEMS.find(i => i.id === id && isAuctionDisplay(i));
  return item as AuctionDisplayItem | undefined;
}

export const SLIDES: Slide[] = buildSlides();

// Pull the latest items bank from the server and mutate the exported arrays /
// maps in place so consumers see fresh data without a full page reload.
export async function refreshLotsFromServer(): Promise<void> {
  const res = await fetch('/api/lots');
  if (!res.ok) return;
  const data = await res.json();
  ALL_ITEMS.length = 0;
  for (const i of data.lots) ALL_ITEMS.push(i);
  ALL_LOTS.length = 0;
  for (const i of ALL_ITEMS) if (isLot(i)) ALL_LOTS.push(i);
  ACTIVE_LOTS.length = 0;
  for (const l of ALL_LOTS.filter(l => l.active)) ACTIVE_LOTS.push(l);
  DISPLAY_NUMS.clear();
  for (const [k, v] of computeDisplayNums(ALL_LOTS)) DISPLAY_NUMS.set(k, v);
  SLIDES.length = 0;
  for (const s of buildSlides()) SLIDES.push(s);
  // Refresh EVENT_META in place
  for (const k of Object.keys(EVENT_META)) delete (EVENT_META as any)[k];
  if (data.meta) Object.assign(EVENT_META, data.meta);
}
