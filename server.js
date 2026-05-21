// Dev: Vite middleware for HMR + ws relay.
// Prod: serve dist/ statics + ws relay. NODE_ENV=production switches modes.

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT || '5180', 10);

const lotsPath = resolve(__dirname, 'src/lots.json');
const lots = JSON.parse(readFileSync(lotsPath, 'utf8')).lots;
const initialLots = {};
for (const l of lots) initialLots[l.num] = { bids: [], finalPrice: null, status: 'pending' };

const state = { slideIdx: 0, buildStep: 0, lots: initialLots };

let httpServer;
if (isProd) {
  const express = (await import('express')).default;
  const app = express();
  app.use(express.static(resolve(__dirname, 'dist')));
  // SPA fallback: all unmatched -> index.html (viewer route)
  app.get('*', (req, res) => res.sendFile(resolve(__dirname, 'dist/index.html')));
  httpServer = createServer(app);
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ server: { middlewareMode: true } });
  httpServer = createServer((req, res) => vite.middlewares(req, res));
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

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'state', state }));
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'nav') {
      if (typeof msg.slideIdx === 'number') { state.slideIdx = msg.slideIdx; state.buildStep = 0; }
      if (typeof msg.buildStep === 'number') state.buildStep = msg.buildStep;
    } else if (msg.type === 'bid' && state.lots[msg.lotNum]) {
      state.lots[msg.lotNum].bids.push(msg.amount);
      state.lots[msg.lotNum].status = 'live';
    } else if (msg.type === 'hammerslag' && state.lots[msg.lotNum]) {
      state.lots[msg.lotNum].finalPrice = msg.finalPrice;
      state.lots[msg.lotNum].status = 'sold';
    } else if (msg.type === 'lotStatus' && state.lots[msg.lotNum]) {
      state.lots[msg.lotNum].status = msg.status;
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
