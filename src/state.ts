// Shared state schema across viewer / controller / auctioneer.
// Authoritative copy lives on the server; clients receive updates via ws.

export type LotStatus = 'pending' | 'live' | 'sold';

export interface LotBidState {
  bids: number[];          // history, in DKK
  finalPrice: number | null;
  status: LotStatus;
}

export interface AppState {
  slideIdx: number;
  buildStep: number;
  lots: Record<string, LotBidState>;
}

export type ServerMsg =
  | { type: 'state'; state: AppState }
  | { type: 'error'; message: string };

export type ClientMsg =
  | { type: 'nav'; slideIdx?: number; buildStep?: number }
  | { type: 'bid'; lotNum: string; amount: number }
  | { type: 'hammerslag'; lotNum: string; finalPrice: number }
  | { type: 'lotStatus'; lotNum: string; status: LotStatus };

export function initialLotBidState(): LotBidState {
  return { bids: [], finalPrice: null, status: 'pending' };
}
