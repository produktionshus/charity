// Tiny ws wrapper — auto-reconnect, typed callbacks.

import type { AppState, ClientMsg, ServerMsg, SoundEvent } from './state';

type StateListener = (state: AppState) => void;
type SoundListener = (event: SoundEvent) => void;

export class SyncClient {
  private ws: WebSocket | null = null;
  private stateListeners = new Set<StateListener>();
  private soundListeners = new Set<SoundListener>();
  private url: string;

  constructor(path = '/sync') {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = `${proto}//${location.host}${path}`;
    this.connect();
  }

  private connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'state') {
        for (const l of this.stateListeners) l(msg.state);
      } else if (msg.type === 'sound-event') {
        for (const l of this.soundListeners) l(msg.event);
      } else if (msg.type === 'lots-updated') {
        // Lot bank changed on disk — reload so the bundled lots.json refreshes.
        // Generator skips this (it's likely the source of the change).
        if (!document.body.classList.contains('generator')) {
          setTimeout(() => location.reload(), 200);
        }
      }
    };
    this.ws.onclose = () => {
      setTimeout(() => this.connect(), 1000);
    };
  }

  on(fn: StateListener) { this.stateListeners.add(fn); return () => this.stateListeners.delete(fn); }
  onSound(fn: SoundListener) { this.soundListeners.add(fn); return () => this.soundListeners.delete(fn); }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
  }
}
