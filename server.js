// Dev: Vite middleware for HMR + ws relay.
// Prod: serve dist/ statics + ws relay. NODE_ENV=production switches modes.

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT || '5180', 10);

const lotsPath = resolve(__dirname, 'src/lots.json');
const lots = JSON.parse(readFileSync(lotsPath, 'utf8')).lots;
const initialLots = {};
const initialSounds = {};
for (const l of lots) {
  initialLots[l.num] = { bids: [], finalPrice: null, status: 'pending' };
  initialSounds[l.num] = {};
}

const state = { slideIdx: 0, buildStep: 0, lots: initialLots, sounds: initialSounds };

// Mirror of client-side SLIDES so the server can detect lot transitions
// for auto-firing init sounds.
const slides = [
  { kind: 'cover' },
  { kind: 'sponsor-index' },
  ...lots.map(l => ({ kind: 'lot', lotNum: l.num })),
  { kind: 'closing' },
];

function freshLots() {
  const out = {};
  for (const l of lots) out[l.num] = { bids: [], finalPrice: null, status: 'pending' };
  return out;
}

const soundsDir = isProd
  ? resolve(__dirname, 'dist/sounds')
  : resolve(__dirname, 'public/sounds');
if (!existsSync(soundsDir)) mkdirSync(soundsDir, { recursive: true });

function listSounds() {
  try {
    return readdirSync(soundsDir)
      .filter(f => /\.(mp3|wav|ogg|m4a)$/i.test(f))
      .sort();
  } catch { return []; }
}

let httpServer;
if (isProd) {
  const express = (await import('express')).default;
  const app = express();
  app.get('/api/sounds', (req, res) => res.json({ files: listSounds() }));
  app.use(express.static(resolve(__dirname, 'dist')));
  // SPA fallback: all unmatched -> index.html (viewer route)
  app.get('*', (req, res) => res.sendFile(resolve(__dirname, 'dist/index.html')));
  httpServer = createServer(app);
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ server: { middlewareMode: true } });
  httpServer = createServer((req, res) => {
    if (req.url === '/api/sounds') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ files: listSounds() }));
      return;
    }
    vite.middlewares(req, res);
  });
}

const wss = new WebSocketServer({ noServer: true });
httpServer.on('upgrade', (req, socket, head) => {
  if (req.url === '/sync') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  }
});

function broadcast() {
  const str = JSON.stringify({ type: 'state', state });
  for (const c of wss.clients) if (c.readyState === 1) c.send(str);
}

let soundEventId = 0;
function broadcastSoundEvent(event) {
  const str = JSON.stringify({ type: 'sound-event', event });
  for (const c of wss.clients) if (c.readyState === 1) c.send(str);
}

function emitPlay(lotNum, which, fileOverride) {
  const cfg = state.sounds[lotNum] || {};
  let file, offset = 0;
  if (fileOverride) {
    file = fileOverride;
    offset = (which === 'init' ? (cfg.initStartOffset ?? 0) : 0);
  } else if (which === 'init') {
    file = cfg.initSound; offset = cfg.initStartOffset ?? 0;
  } else if (which === 'hammer') {
    file = cfg.hammerSound;
  }
  if (!file) return;
  soundEventId += 1;
  broadcastSoundEvent({
    action: 'play',
    file,
    offset,
    fadeIn: cfg.fadeInSec ?? 0,
    fadeOut: cfg.fadeOutSec ?? 0,
    lotNum,
    which,
    eventId: soundEventId,
  });
}
function emitStop() {
  broadcastSoundEvent({ action: 'stop' });
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'state', state }));
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'nav') {
      const prevIdx = state.slideIdx;
      if (typeof msg.slideIdx === 'number') { state.slideIdx = msg.slideIdx; state.buildStep = 0; }
      if (typeof msg.buildStep === 'number') state.buildStep = msg.buildStep;
      broadcast();
      // Auto-fire init sound when slideIdx changes to a lot with initSound config.
      if (typeof msg.slideIdx === 'number' && msg.slideIdx !== prevIdx) {
        const slide = slides[msg.slideIdx];
        if (slide?.kind === 'lot' && slide.lotNum) emitPlay(slide.lotNum, 'init');
      }
      return;
    } else if (msg.type === 'bid' && state.lots[msg.lotNum]) {
      state.lots[msg.lotNum].bids.push(msg.amount);
      state.lots[msg.lotNum].status = 'live';
    } else if (msg.type === 'hammerslag' && state.lots[msg.lotNum]) {
      state.lots[msg.lotNum].finalPrice = msg.finalPrice;
      state.lots[msg.lotNum].status = 'sold';
      broadcast();
      emitPlay(msg.lotNum, 'hammer');
      return;
    } else if (msg.type === 'lotStatus' && state.lots[msg.lotNum]) {
      state.lots[msg.lotNum].status = msg.status;
    } else if (msg.type === 'undo-bid' && state.lots[msg.lotNum]) {
      const ls = state.lots[msg.lotNum];
      if (ls.status === 'sold') {
        // Roll the sale back; keep the bid history intact so the operator can
        // continue editing from where it was.
        ls.status = ls.bids.length ? 'live' : 'pending';
        ls.finalPrice = null;
      } else if (ls.bids.length) {
        ls.bids.pop();
        if (ls.bids.length === 0) ls.status = 'pending';
      }
    } else if (msg.type === 'reset-auctions') {
      state.lots = freshLots();
    } else if (msg.type === 'set-sound' && state.sounds[msg.lotNum]) {
      state.sounds[msg.lotNum] = { ...state.sounds[msg.lotNum], ...msg.config };
    } else if (msg.type === 'play-sound' && state.sounds[msg.lotNum]) {
      emitPlay(msg.lotNum, msg.which, msg.fileOverride);
      return;
    } else if (msg.type === 'stop-sound') {
      emitStop();
      return;
    } else {
      return;
    }
    broadcast();
  });
});

httpServer.listen(PORT, () => {
  const proto = isProd ? 'https' : 'http';
  console.log(`mode:       ${isProd ? 'production' : 'development'}`);
  console.log(`viewer      ${proto}://localhost:${PORT}/`);
  console.log(`auctioneer  ${proto}://localhost:${PORT}/auctioneer.html`);
  console.log(`controller  ${proto}://localhost:${PORT}/controller.html`);
});
