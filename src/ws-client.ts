// Tiny ws wrapper — auto-reconnect, typed callbacks.

import type { AppState, ClientMsg, ServerMsg } from './state';

type Listener = (state: AppState) => void;

export class SyncClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private url: string;

  constructor(path = '/sync') {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = `${proto}//${location.host}${path}`;
    this.connect();
  }

  private connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'state') {
        for (const l of this.listeners) l(msg.state);
      }
    };
    this.ws.onclose = () => {
      setTimeout(() => this.connect(), 1000);
    };
  }

  on(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
  }
}
