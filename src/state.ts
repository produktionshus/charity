// Shared state schema across viewer / controller / auctioneer.
// Authoritative copy lives on the server; clients receive updates via ws.

export type LotStatus = 'pending' | 'live' | 'sold';

export interface LotBidState {
  bids: number[];          // history, in DKK
  finalPrice: number | null;
  status: LotStatus;
}

// Per-lot sound configuration. All fields optional.
// Sound file paths are relative to /sounds/ (so the value is just a filename).
export interface LotSoundConfig {
  initSound?: string;         // file under /sounds/ to play when slide enters
  initStartOffset?: number;   // seconds to skip into the file (e.g. 0.5)
  hammerSound?: string;       // file under /sounds/ to play on hammerslag
  fadeInSec?: number;         // seconds to ramp volume 0 -> 1 on start (default 0)
  fadeOutSec?: number;        // seconds to ramp volume -> 0 before natural end (default 0)
}

// Live sound event broadcast to viewer + auctioneer.
export type SoundEvent =
  | {
      action: 'play';
      file: string;
      offset: number;
      fadeIn: number;
      fadeOut: number;
      lotNum: string;
      which: 'init' | 'hammer' | 'manual';
      eventId: number;        // monotonic id so late frames can dedupe
    }
  | { action: 'stop' };

export interface AppState {
  slideIdx: number;
  buildStep: number;
  lots: Record<string, LotBidState>;
  sounds: Record<string, LotSoundConfig>;   // keyed by lot num
}

export type ServerMsg =
  | { type: 'state'; state: AppState }
  | { type: 'sound-event'; event: SoundEvent }
  | { type: 'error'; message: string };

export type ClientMsg =
  | { type: 'nav'; slideIdx?: number; buildStep?: number }
  | { type: 'bid'; lotNum: string; amount: number }
  | { type: 'hammerslag'; lotNum: string; finalPrice: number }
  | { type: 'lotStatus'; lotNum: string; status: LotStatus }
  | { type: 'reset-auctions' }
  | { type: 'set-sound'; lotNum: string; config: LotSoundConfig }
  | { type: 'play-sound'; lotNum: string; which: 'init' | 'hammer' | 'manual'; fileOverride?: string }
  | { type: 'stop-sound' }
  | { type: 'undo-bid'; lotNum: string };

export function initialLotBidState(): LotBidState {
  return { bids: [], finalPrice: null, status: 'pending' };
}
