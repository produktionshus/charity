// Dev: Vite middleware for HMR + ws relay + REST API.
// Prod: serve dist/ statics + ws relay + REST API.
// NODE_ENV=production switches modes.

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync, cpSync, copyFileSync } from 'fs';
import { dirname, resolve, extname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT || '5180', 10);

// ---- Persistent storage paths ----
// In dev these default to in-repo locations (src/lots.json, public/assets).
// In prod (Railway), mount a volume and set LOTS_PATH / ASSETS_DIR /
// SOUNDS_DIR to point inside it so uploads + lots.json edits survive
// redeploys.
const seedLotsPath  = resolve(__dirname, 'src/lots.json');
const seedAssetsDir = resolve(__dirname, 'public/assets');
const seedSoundsDir = resolve(__dirname, 'public/sounds');
const lotsPath  = process.env.LOTS_PATH  || seedLotsPath;
const assetsDir = process.env.ASSETS_DIR || seedAssetsDir;
const soundsDir = process.env.SOUNDS_DIR || seedSoundsDir;

// First-boot seed: if the persisted location is empty/missing, copy the
// in-repo defaults across. No-op in dev because the paths are identical.
function seedIfMissing() {
  if (!existsSync(lotsPath)) {
    mkdirSync(dirname(lotsPath), { recursive: true });
    copyFileSync(seedLotsPath, lotsPath);
    console.log(`seeded lots.json -> ${lotsPath}`);
  }
  if (!existsSync(assetsDir) || readdirSync(assetsDir).length === 0) {
    mkdirSync(assetsDir, { recursive: true });
    if (existsSync(seedAssetsDir)) {
      cpSync(seedAssetsDir, assetsDir, { recursive: true });
      console.log(`seeded assets -> ${assetsDir}`);
    }
  }
  if (!existsSync(soundsDir)) {
    mkdirSync(soundsDir, { recursive: true });
    if (existsSync(seedSoundsDir)) {
      cpSync(seedSoundsDir, soundsDir, { recursive: true });
    }
  }
}
seedIfMissing();
function loadLots() {
  return JSON.parse(readFileSync(lotsPath, 'utf8'));
}
function saveLots(payload) {
  writeFileSync(lotsPath, JSON.stringify(payload, null, 2), 'utf8');
}

let lotsFile = loadLots();
function lots() { return lotsFile.lots; }
function activeLots() { return lots().filter(l => l.active); }

function rebuildAuctionState() {
  // Refresh state.lots / sounds dictionaries to include every lot id.
  for (const l of lots()) {
    if (!state.lots[l.id]) state.lots[l.id] = { bids: [], finalPrice: null, status: 'pending' };
    if (!state.sounds[l.id]) state.sounds[l.id] = {};
  }
  // Drop entries for deleted lots
  for (const id of Object.keys(state.lots)) {
    if (!lots().find(l => l.id === id)) delete state.lots[id];
  }
  for (const id of Object.keys(state.sounds)) {
    if (!lots().find(l => l.id === id)) delete state.sounds[id];
  }
  // Rebuild slide list
  serverSlides.length = 0;
  for (const s of buildServerSlides()) serverSlides.push(s);
}

const initialLots = {};
const initialSounds = {};
for (const l of lots()) {
  initialLots[l.id] = { bids: [], finalPrice: null, status: 'pending' };
  initialSounds[l.id] = {};
}
const state = { slideIdx: 0, buildStep: 0, lots: initialLots, sounds: initialSounds, soundDefaults: {} };

function buildServerSlides() {
  const out = [];
  for (const item of lots()) {
    if (item.active && item.kind === 'bordplan') out.push({ kind: 'bordplan', itemId: item.id });
  }
  out.push({ kind: 'cover' }, { kind: 'sponsor-index' });
  for (const item of lots()) {
    if (item.active && (!item.kind || item.kind === 'lot')) out.push({ kind: 'lot', lotId: item.id });
  }
  out.push({ kind: 'closing' });
  return out;
}
const serverSlides = buildServerSlides();

function freshLots() {
  const out = {};
  for (const l of lots()) out[l.id] = { bids: [], finalPrice: null, status: 'pending' };
  return out;
}

// ---- Asset subdirectories (derived from ASSETS_DIR) ----
const heroDir    = resolve(assetsDir, 'hero');
const logoDir    = resolve(assetsDir, 'logo');
const closingDir = resolve(assetsDir, 'closing');
for (const d of [heroDir, logoDir, closingDir, soundsDir]) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function listSounds() {
  try {
    return readdirSync(soundsDir)
      .filter(f => /\.(mp3|wav|ogg|m4a)$/i.test(f))
      .sort();
  } catch { return []; }
}

// ---- Multer upload setup ----
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const kind = req.body.kind || req.query.kind;
      if (kind === 'hero')    return cb(null, heroDir);
      if (kind === 'logo')    return cb(null, logoDir);
      if (kind === 'closing') return cb(null, closingDir);
      if (kind === 'sound')   return cb(null, soundsDir);
      cb(new Error('Unknown upload kind: ' + kind), '');
    },
    filename: (req, file, cb) => {
      const lotId = req.body.lotId || req.query.lotId;
      const kind  = req.body.kind  || req.query.kind;
      const ext   = (extname(file.originalname) || '.jpg').toLowerCase();
      if (kind === 'hero') return cb(null, `lot-${lotId}_FINAL${ext}`);
      if (kind === 'logo') return cb(null, `logo-lot-${lotId}.png`);
      if (kind === 'closing') return cb(null, file.originalname);
      if (kind === 'sound') {
        const which = req.body.which || req.query.which;
        const e = (extname(file.originalname) || '.mp3').toLowerCase();
        if (!['init', 'hammer'].includes(which)) {
          return cb(new Error('sound upload needs which=init|hammer'), '');
        }
        // lotId set -> per-lot override; otherwise -> deck-wide default.
        return cb(null, lotId ? `${lotId}-${which}${e}` : `default-${which}${e}`);
      }
      cb(new Error('Unknown upload kind'), '');
    },
  }),
});

// ---- Express app + API ----
const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/api/sounds', (_req, res) => res.json({ files: listSounds() }));

app.get('/api/lots', (_req, res) => {
  res.json(lotsFile);
});

app.put('/api/meta', (req, res) => {
  if (!lotsFile.meta || typeof lotsFile.meta !== 'object') lotsFile.meta = {};
  const m = lotsFile.meta;
  const b = req.body || {};
  if (Array.isArray(b.bidPresets)) {
    m.bidPresets = b.bidPresets
      .map(n => parseInt(n, 10))
      .filter(n => Number.isFinite(n) && n > 0);
  }
  if (b.brandColors && typeof b.brandColors === 'object') {
    m.brandColors = m.brandColors || {};
    for (const k of ['primary', 'gold', 'ink']) {
      if (typeof b.brandColors[k] === 'string') m.brandColors[k] = b.brandColors[k];
      else if (b.brandColors[k] === null) delete m.brandColors[k];
    }
  }
  for (const k of ['eventName', 'eventSubtitle', 'eventDate', 'theme']) {
    if (typeof b[k] === 'string') m[k] = b[k];
    else if (b[k] === null) delete m[k];
  }
  saveLots(lotsFile);
  broadcastLotsUpdated();
  res.json(m);
});

app.post('/api/lots', (req, res) => {
  const kind = req.body.kind || 'lot';
  let newItem;
  if (kind === 'bordplan') {
    newItem = {
      id: uuidv4(),
      kind: 'bordplan',
      active: req.body.active ?? false,
      label: req.body.label || '',
      eventName: req.body.eventName || '',
      org: req.body.org || '',
      config: req.body.config || {},
      overrides: req.body.overrides || {},
    };
  } else if (kind === 'cover') {
    newItem = {
      id: uuidv4(),
      kind: 'cover',
      active: req.body.active ?? true,
      label: req.body.label || 'Cover',
      title: req.body.title || 'AUKTION',
      subtitle: req.body.subtitle || 'STJERNEGOLF 2026',
      attribution: req.body.attribution || '',
      logoFile: req.body.logoFile || 'artsolo-logo.png',
    };
  } else if (kind === 'closing') {
    newItem = {
      id: uuidv4(),
      kind: 'closing',
      active: req.body.active ?? true,
      label: req.body.label || 'Closing',
      title: req.body.title || 'TAK TIL ALLE VORES SPONSORER',
      tagline: req.body.tagline || '@KIDSAIDDK · KIDSAID DANMARK',
      cols: req.body.cols || 8,
      logos: Array.isArray(req.body.logos) ? req.body.logos : [],
    };
  } else if (kind === 'sponsor-index') {
    newItem = {
      id: uuidv4(),
      kind: 'sponsor-index',
      active: req.body.active ?? true,
      label: req.body.label || 'Sponsor-indeks',
      title: req.body.title || 'AUKTIONENS SPONSORER',
    };
  } else {
    newItem = {
      id: uuidv4(),
      title: req.body.title || '',
      subtitle: req.body.subtitle || '',
      sponsor: req.body.sponsor || '',
      bullets: Array.isArray(req.body.bullets) ? req.body.bullets : [],
      titleParts: req.body.titleParts,
      donorNames: req.body.donorNames,
      active: req.body.active ?? false,
      extra: req.body.extra ?? false,
      extraSuffix: req.body.extraSuffix ?? null,
      layout: req.body.layout || 'horizon',
      mirrored: req.body.mirrored ?? false,
      focal: req.body.focal || '50% 50%',
      titleSizePt: req.body.titleSizePt,
    };
  }
  lotsFile.lots.push(newItem);
  saveLots(lotsFile);
  rebuildAuctionState();
  broadcastLotsUpdated();
  res.json(newItem);
});

app.put('/api/lots/:id', (req, res) => {
  const lot = lotsFile.lots.find(l => l.id === req.params.id);
  if (!lot) return res.status(404).json({ error: 'Not found' });
  Object.assign(lot, req.body);   // shallow merge of provided fields
  lot.id = req.params.id;          // never let the id be overwritten by body
  saveLots(lotsFile);
  rebuildAuctionState();
  broadcastLotsUpdated();
  res.json(lot);
});

app.delete('/api/lots/:id', (req, res) => {
  const before = lotsFile.lots.length;
  lotsFile.lots = lotsFile.lots.filter(l => l.id !== req.params.id);
  if (lotsFile.lots.length === before) return res.status(404).json({ error: 'Not found' });
  saveLots(lotsFile);
  rebuildAuctionState();
  broadcastLotsUpdated();
  res.json({ ok: true });
});

app.post('/api/lots/reorder', (req, res) => {
  const order = Array.isArray(req.body.order) ? req.body.order : null;
  if (!order) return res.status(400).json({ error: 'Missing order array' });
  const byId = new Map(lotsFile.lots.map(l => [l.id, l]));
  const reordered = [];
  for (const id of order) {
    const lot = byId.get(id);
    if (lot) { reordered.push(lot); byId.delete(id); }
  }
  // Append any lots that weren't in the order list (shouldn't normally happen)
  for (const lot of byId.values()) reordered.push(lot);
  lotsFile.lots = reordered;
  saveLots(lotsFile);
  rebuildAuctionState();
  broadcastLotsUpdated();
  res.json({ ok: true });
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const kind = req.body.kind || req.query.kind;
  const lotId = req.body.lotId || req.query.lotId;
  // In prod (no Vite watcher), persist heroExt immediately so viewer +
  // auctioneer + controller resolve the right URL after a soft refresh.
  // In dev we skip — Vite would HMR-reload the generator mid-edit.
  if (isProd && kind === 'hero' && lotId) {
    const ext = extname(req.file.filename).replace(/^\./, '').toLowerCase();
    const lot = lotsFile.lots.find(l => l.id === lotId);
    if (lot) { lot.heroExt = ext; saveLots(lotsFile); broadcastLotsUpdated(); }
  }
  // Sound: bind the uploaded file to the lot's init / hammer slot (or to
  // the deck-wide defaults when no lotId is supplied).
  if (kind === 'sound') {
    const which = req.body.which || req.query.which;
    const target = lotId ? (state.sounds[lotId] = state.sounds[lotId] || {}) : state.soundDefaults;
    if (which === 'init')   target.initSound = req.file.filename;
    if (which === 'hammer') target.hammerSound = req.file.filename;
    broadcast();
  }
  res.json({ filename: req.file.filename });
});

app.delete('/api/upload', (req, res) => {
  const { kind, lotId } = req.query;
  let target;
  if (kind === 'hero') target = resolve(heroDir, `lot-${lotId}_FINAL.jpg`);
  else if (kind === 'logo') target = resolve(logoDir, `logo-lot-${lotId}.png`);
  else return res.status(400).json({ error: 'Unknown kind' });
  try { if (existsSync(target)) unlinkSync(target); } catch {}
  res.json({ ok: true });
});

// Asset routes resolve against the persisted volume in prod, in-repo
// public/assets in dev. Mounted before the SPA fallback / vite middleware
// so they always win.
app.use('/assets', express.static(assetsDir));
app.use('/sounds', express.static(soundsDir));

let httpServer;
if (isProd) {
  app.use(express.static(resolve(__dirname, 'dist')));
  app.get('*', (_req, res) => res.sendFile(resolve(__dirname, 'dist/index.html')));
  httpServer = createServer(app);
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ server: { middlewareMode: true } });
  app.use(vite.middlewares);
  httpServer = createServer(app);
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

function broadcastLotsUpdated() {
  const str = JSON.stringify({ type: 'lots-updated' });
  for (const c of wss.clients) if (c.readyState === 1) c.send(str);
}

let soundEventId = 0;
function broadcastSoundEvent(event) {
  const str = JSON.stringify({ type: 'sound-event', event });
  for (const c of wss.clients) if (c.readyState === 1) c.send(str);
}

function emitPlay(lotNum, which, fileOverride) {
  const cfg = state.sounds[lotNum] || {};
  const def = state.soundDefaults || {};
  let file, offset = 0;
  if (fileOverride) {
    file = fileOverride;
    offset = (which === 'init' ? (cfg.initStartOffset ?? def.initStartOffset ?? 0) : 0);
  } else if (which === 'init') {
    file = cfg.initSound ?? def.initSound;
    offset = cfg.initStartOffset ?? def.initStartOffset ?? 0;
  } else if (which === 'hammer') {
    file = cfg.hammerSound ?? def.hammerSound;
  }
  if (!file) return;
  soundEventId += 1;
  broadcastSoundEvent({
    action: 'play',
    file,
    offset,
    fadeIn: cfg.fadeInSec ?? def.fadeInSec ?? 0,
    fadeOut: cfg.fadeOutSec ?? def.fadeOutSec ?? 0,
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
      if (typeof msg.slideIdx === 'number' && msg.slideIdx !== prevIdx) {
        const slide = serverSlides[msg.slideIdx];
        if (slide?.kind === 'lot' && slide.lotId) emitPlay(slide.lotId, 'init');
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
    } else if (msg.type === 'set-sound-defaults') {
      state.soundDefaults = { ...state.soundDefaults, ...msg.config };
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
  console.log(`generator   ${proto}://localhost:${PORT}/generator.html`);
});
