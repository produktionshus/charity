// Dev: Vite middleware for HMR + ws relay + REST API.
// Prod: serve dist/ statics + ws relay + REST API.
// NODE_ENV=production switches modes.

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync, renameSync, cpSync, copyFileSync } from 'fs';
import { dirname, resolve, extname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
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
  // Top-level assets dir + per-subdir seed. We seed any subdirectory of
  // the volume that's missing or empty so new asset groups (apples,
  // wish-loop, media, …) populate when redeploying, even if the volume
  // already has other files in it.
  if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });
  if (existsSync(seedAssetsDir)) {
    for (const entry of readdirSync(seedAssetsDir, { withFileTypes: true })) {
      const seedPath = resolve(seedAssetsDir, entry.name);
      const livePath = resolve(assetsDir, entry.name);
      if (entry.isDirectory()) {
        if (!existsSync(livePath) || readdirSync(livePath).length === 0) {
          cpSync(seedPath, livePath, { recursive: true });
          console.log(`seeded assets/${entry.name} -> ${livePath}`);
        }
      } else {
        if (!existsSync(livePath)) {
          copyFileSync(seedPath, livePath);
          console.log(`seeded assets/${entry.name}`);
        }
      }
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

// Ensure a default cover item exists at the top of the deck so the operator
// has something to edit. Without this, buildSlides falls back to an
// anonymous cover that isn't in itemsBank, so the generator can't reach it.
(function ensureCoverItem() {
  const hasCover = (lotsFile.lots || []).some(l => l && l.kind === 'cover');
  if (hasCover) return;
  const cover = {
    id: uuidv4(),
    kind: 'cover',
    active: true,
    label: 'Cover',
    title: 'AUKTION',
    subtitle: (lotsFile.meta && lotsFile.meta.eventSubtitle) || 'STJERNEGOLF 2026',
    attribution: 'AUKTION VED KASPER NIELSEN',
    logoFile: 'artsolo-logo.png',
  };
  lotsFile.lots = [cover, ...(lotsFile.lots || [])];
  saveLots(lotsFile);
})();
function lots() { return lotsFile.lots; }
function activeLots() { return lots().filter(l => l.active); }

function rebuildAuctionState() {
  // Refresh state.lots / sounds dictionaries to include every lot id.
  for (const l of lots()) {
    if (!state.lots[l.id]) state.lots[l.id] = { bids: [], finalPrice: null, status: 'pending' };
    if (!state.sounds[l.id]) state.sounds[l.id] = { ...(l.sound || {}) };
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
  persistAuctionState();
}

const initialLots = {};
const initialSounds = {};
for (const l of lots()) {
  initialLots[l.id] = { bids: [], finalPrice: null, status: 'pending' };
  initialSounds[l.id] = { ...(l.sound || {}) };
}
const initialSoundDefaults = (lotsFile.meta && lotsFile.meta.soundDefaults) ? { ...lotsFile.meta.soundDefaults } : {};
const state = { slideIdx: 0, buildStep: 0, lots: initialLots, sounds: initialSounds, soundDefaults: initialSoundDefaults };

// ---- Auction-state persistence ----
// Bids / hammer prices / statuses used to live only in memory, so a restart
// (or Railway redeploy) mid-event wiped the night's results. Persist them next
// to lots.json (on the volume in prod) and merge back at boot so results can
// be pulled out days after the event via /api/results.
const auctionStatePath = process.env.AUCTION_STATE_PATH || resolve(dirname(lotsPath), 'auction-state.json');
(function restoreAuctionState() {
  try {
    const saved = JSON.parse(readFileSync(auctionStatePath, 'utf8'));
    for (const [id, ls] of Object.entries(saved.lots || {})) {
      if (!state.lots[id]) continue;            // lot no longer exists
      state.lots[id] = {
        bids: Array.isArray(ls.bids) ? ls.bids : [],
        finalPrice: typeof ls.finalPrice === 'number' ? ls.finalPrice : null,
        status: ls.status || 'pending',
      };
    }
    console.log(`restored auction state from ${auctionStatePath}`);
  } catch { /* first boot or unreadable — start fresh */ }
})();
let auctionStateTimer = null;
function persistAuctionState() {
  if (auctionStateTimer) return;                // debounce burst of bids
  auctionStateTimer = setTimeout(() => {
    auctionStateTimer = null;
    try { writeFileSync(auctionStatePath, JSON.stringify({ lots: state.lots }), 'utf8'); }
    catch (e) { console.warn('auction-state save failed:', e?.message || e); }
  }, 400);
}

function buildServerSlides() {
  // Mirror client's buildSlides — items emit in array order. Auto-emit
  // sponsor-index / cover / closing fallbacks only when no explicit item exists.
  const out = [];
  let hasCover = false;
  let hasClosing = false;
  let hasSponsorIndex = lots().some(i => i.active && i.kind === 'sponsor-index');
  let lotsEmitted = false;
  for (const item of lots()) {
    if (!item.active) continue;
    if (item.kind === 'bordplan') {
      out.push({ kind: 'bordplan', itemId: item.id });
    } else if (item.kind === 'cover') {
      out.push({ kind: 'cover', itemId: item.id });
      hasCover = true;
    } else if (item.kind === 'closing') {
      out.push({ kind: 'closing', itemId: item.id });
      hasClosing = true;
    } else if (item.kind === 'sponsor-index') {
      out.push({ kind: 'sponsor-index', itemId: item.id });
      hasSponsorIndex = true;
    } else if (item.kind === 'wish-loop') {
      out.push({ kind: 'wish-loop', itemId: item.id });
    } else if (item.kind === 'media') {
      out.push({ kind: 'media', itemId: item.id });
    } else if (item.kind === 'auction-display') {
      out.push({ kind: 'auction-display', itemId: item.id });
    } else if (item.kind === 'carousel') {
      out.push({ kind: 'carousel', itemId: item.id });
    } else if (item.kind === 'contest') {
      out.push({ kind: 'contest', itemId: item.id });
    } else if (!item.kind || item.kind === 'lot') {
      if (!lotsEmitted) {
        if (!hasSponsorIndex && !out.some(s => s.kind === 'sponsor-index')) {
          out.push({ kind: 'sponsor-index' });
        }
        lotsEmitted = true;
      }
      out.push({ kind: 'lot', lotId: item.id });
    }
  }
  if (!hasCover) out.unshift({ kind: 'cover' });
  if (!lotsEmitted && !hasSponsorIndex && !out.some(s => s.kind === 'sponsor-index')) {
    out.push({ kind: 'sponsor-index' });
  }
  if (!hasClosing) out.push({ kind: 'closing' });
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
const applesDir  = resolve(assetsDir, 'apples');
const wishLoopDir = resolve(assetsDir, 'wish-loop');
const mediaDir    = resolve(assetsDir, 'media');
const coverDir    = resolve(assetsDir, 'cover');
const carouselDir = resolve(assetsDir, 'carousel');
const contestDir  = resolve(assetsDir, 'contest');
for (const d of [heroDir, logoDir, closingDir, applesDir, wishLoopDir, mediaDir, coverDir, carouselDir, contestDir, soundsDir]) {
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
      if (kind === 'hero')      return cb(null, heroDir);
      if (kind === 'logo')      return cb(null, logoDir);
      if (kind === 'closing')   return cb(null, closingDir);
      if (kind === 'apple')     return cb(null, applesDir);
      if (kind === 'wish-bg')   return cb(null, wishLoopDir);
      if (kind === 'media')     return cb(null, mediaDir);
      if (kind === 'cover-logo') return cb(null, coverDir);
      if (kind === 'extra-logo') return cb(null, logoDir);
      if (kind === 'carousel')  return cb(null, carouselDir);
      if (kind === 'contest')   return cb(null, contestDir);
      if (kind === 'sound')     return cb(null, soundsDir);
      cb(new Error('Unknown upload kind: ' + kind), '');
    },
    filename: (req, file, cb) => {
      const lotId = req.body.lotId || req.query.lotId;
      const kind  = req.body.kind  || req.query.kind;
      const ext   = (extname(file.originalname) || '.jpg').toLowerCase();
      if (kind === 'hero') {
        // Multi-image lots: imgIndex 2/3 -> lot-<id>_FINAL2/3.<ext>.
        // imgIndex 1 (or absent) keeps the legacy lot-<id>_FINAL.<ext>.
        const idx = parseInt(req.body.imgIndex || req.query.imgIndex || '1', 10);
        const suffix = idx > 1 ? String(idx) : '';
        return cb(null, `lot-${lotId}_FINAL${suffix}${ext}`);
      }
      if (kind === 'logo') return cb(null, `logo-lot-${lotId}${ext}`);
      if (kind === 'closing') return cb(null, file.originalname);
      if (kind === 'apple')      return cb(null, file.originalname);
      if (kind === 'wish-bg')    return cb(null, file.originalname);
      if (kind === 'media')      return cb(null, file.originalname);
      if (kind === 'cover-logo') return cb(null, file.originalname);
      if (kind === 'extra-logo') return cb(null, `extra-${lotId || Date.now()}-${file.originalname}`);
      if (kind === 'carousel') {
        // Prefix with a millisecond timestamp so re-uploading a file with the
        // same name keeps both versions and the operator's image list stays
        // deterministic.
        return cb(null, `${Date.now()}-${file.originalname}`);
      }
      if (kind === 'contest') {
        return cb(null, `${Date.now()}-${file.originalname}`);
      }
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

app.get('/api/apples', (_req, res) => {
  const applesDir = resolve(assetsDir, 'apples');
  try {
    const files = readdirSync(applesDir)
      .filter(f => /\.(png|jpe?g|webp)$/i.test(f))
      .sort();
    res.json({ files });
  } catch { res.json({ files: [] }); }
});

app.get('/api/lots', (_req, res) => {
  res.json(lotsFile);
});

// Per-block results — walk the deck in order, grouping lots under the nearest
// preceding section divider. Team bonus donations (floor pledges) are
// attributed to the block containing the team's first bound lot, so H2H
// pledges land in the H2H block. Sold lots count even if later deactivated:
// money raised is money raised.
app.get('/api/results', (_req, res) => {
  const sections = [];
  let cur = null;
  const ensureCur = () => cur || (cur = { id: null, name: 'Uden sektion', lots: [], bonuses: [], lotSum: 0, bonusSum: 0 });
  const lotSection = new Map();
  for (const item of lots()) {
    if (item.kind === 'section') {
      if (cur) sections.push(cur);
      cur = { id: item.id, name: item.label || 'Sektion', lots: [], bonuses: [], lotSum: 0, bonusSum: 0 };
      continue;
    }
    if (item.kind && item.kind !== 'lot') continue;
    const sec = ensureCur();
    lotSection.set(item.id, sec);
    const ls = state.lots[item.id];
    if (ls && ls.status === 'sold' && typeof ls.finalPrice === 'number') {
      sec.lots.push({ id: item.id, title: item.title || '', amount: ls.finalPrice });
      sec.lotSum += ls.finalPrice;
    }
  }
  if (cur) sections.push(cur);
  for (const t of (lotsFile.meta && lotsFile.meta.teams) || []) {
    const bonus = Number(t.bonusAmount) || 0;
    if (!bonus) continue;
    const firstLotId = (Array.isArray(t.lotIds) && t.lotIds[0]) || t.lotId;
    const sec = (firstLotId && lotSection.get(firstLotId)) || sections[0];
    if (!sec) continue;
    sec.bonuses.push({ teamId: t.id, teamName: t.name || t.id, amount: bonus });
    sec.bonusSum += bonus;
  }
  // Day rollup — a "Dag 1: H2H" / "Dag 1 · H2H" naming convention groups
  // sections by the prefix before the first ':' or '·', so multi-day events
  // get a per-day total on top of the per-block sums.
  const splitGroup = (name) => {
    const m = /^([^:·]+)[:·](.+)$/.exec(name || '');
    if (!m || !m[1].trim() || !m[2].trim()) return { group: null, shortName: name };
    return { group: m[1].trim(), shortName: m[2].trim() };
  };
  const out = sections.map(s => ({
    ...s,
    ...(s.id === null ? { group: null, shortName: s.name } : splitGroup(s.name)),
    total: s.lotSum + s.bonusSum,
  }));
  const groups = [];
  for (const s of out) {
    if (!s.group) continue;
    let g = groups.find(x => x.name === s.group);
    if (!g) { g = { name: s.group, total: 0, sections: [] }; groups.push(g); }
    g.total += s.total;
    g.sections.push(s.shortName);
  }
  res.json({ sections: out, groups, grandTotal: out.reduce((sum, s) => sum + s.total, 0) });
});

// Quick bonus-donation endpoint — adds DKK to a specific team's bonusAmount
// without rewriting the full meta payload. Used by controller's live panel.
// Accepts { add: N } (delta) or { set: N } (absolute value, e.g. reset).
app.post('/api/meta/teams/:id/bonus', (req, res) => {
  if (!lotsFile.meta || !Array.isArray(lotsFile.meta.teams)) {
    return res.status(404).json({ error: 'No teams configured' });
  }
  const team = lotsFile.meta.teams.find(t => t.id === req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  if (typeof req.body?.set === 'number') {
    team.bonusAmount = Math.max(0, Number(req.body.set) || 0);
  } else {
    const add = Number(req.body?.add) || 0;
    if (!add) return res.status(400).json({ error: 'Missing add/set' });
    team.bonusAmount = Math.max(0, (Number(team.bonusAmount) || 0) + add);
  }
  saveLots(lotsFile);
  broadcastLotsUpdated();
  res.json({ id: team.id, bonusAmount: team.bonusAmount });
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
  // Slide look (v2 controller theme drawer) — shallow-validated passthrough;
  // null clears back to the built-in default theme.
  if (b.slideTheme && typeof b.slideTheme === 'object') {
    const t = {};
    for (const k of ['numColor', 'accentColor', 'gradA', 'gradB']) {
      if (typeof b.slideTheme[k] === 'string') t[k] = b.slideTheme[k];
    }
    if (['jakarta', 'serif', 'system'].includes(b.slideTheme.font)) t.font = b.slideTheme.font;
    if (['linear', 'radial'].includes(b.slideTheme.gradType)) t.gradType = b.slideTheme.gradType;
    if (Number.isFinite(b.slideTheme.gradAngle)) t.gradAngle = Math.max(0, Math.min(360, Number(b.slideTheme.gradAngle)));
    if (b.slideTheme.customColors && typeof b.slideTheme.customColors === 'object') {
      t.customColors = {};
      for (const [k, arr] of Object.entries(b.slideTheme.customColors)) {
        if (Array.isArray(arr)) t.customColors[k] = arr.filter(c => typeof c === 'string').slice(-3);
      }
    }
    m.slideTheme = { ...(m.slideTheme || {}), ...t };
  } else if (b.slideTheme === null) {
    delete m.slideTheme;
  }
  if (b.sponsorTicker && typeof b.sponsorTicker === 'object') {
    m.sponsorTicker = m.sponsorTicker || {};
    if (typeof b.sponsorTicker.enabled === 'boolean') m.sponsorTicker.enabled = b.sponsorTicker.enabled;
    if (typeof b.sponsorTicker.prefix === 'string')  m.sponsorTicker.prefix  = b.sponsorTicker.prefix;
    if (Array.isArray(b.sponsorTicker.sponsors))     m.sponsorTicker.sponsors = b.sponsorTicker.sponsors.filter(s => typeof s === 'string');
    if (typeof b.sponsorTicker.speedSec === 'number') m.sponsorTicker.speedSec = b.sponsorTicker.speedSec;
  }
  if (Array.isArray(b.teams)) {
    // bonusAmount is owned by the dedicated POST /api/meta/teams/:id/bonus
    // endpoint — running auctions accumulate it across the event. Generator
    // saves carry a stale snapshot from page-load and would silently wipe
    // donations added in between. Preserve the server's current value
    // keyed by team id, and only fall back to 0 for brand-new teams that
    // don't yet exist on disk.
    const prevBonus = new Map((m.teams || []).map(t => [t.id, Number(t.bonusAmount) || 0]));
    m.teams = b.teams.map(t => ({
      id: t.id, name: t.name || '',
      baseColor: t.baseColor,
      liveColor: t.liveColor,
      palette: t.palette,                              // legacy fallback
      preAmount: Number(t.preAmount) || 0,
      bonusAmount: prevBonus.get(t.id) ?? 0,           // never trust client; bonus is server-owned
      lotId: t.lotId || undefined,                     // legacy single-lot field
      lotIds: Array.isArray(t.lotIds) ? t.lotIds.filter(x => typeof x === 'string' && x) : undefined,
      lot: t.lot ? { title: t.lot.title || '', description: t.lot.description || '' } : undefined,
    }));
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
  } else if (kind === 'auction-display') {
    newItem = {
      id: uuidv4(),
      kind: 'auction-display',
      active: req.body.active ?? true,
      label: req.body.label || 'Auktion-display',
      screen: req.body.screen || 'intro',
      activeLot: req.body.activeLot ?? 0,
      revealCount: req.body.revealCount ?? 0,
      ranking: req.body.ranking ?? false,
      namesVisible: req.body.namesVisible ?? true,
      showBaseLabel: req.body.showBaseLabel ?? true,
    };
  } else if (kind === 'media') {
    newItem = {
      id: uuidv4(),
      kind: 'media',
      active: req.body.active ?? true,
      label: req.body.label || 'Media',
      mode: req.body.mode || 'image',
      src: req.body.src || '',
      alt: req.body.alt || '',
      videoMuted:    req.body.videoMuted    ?? true,
      videoLoop:     req.body.videoLoop     ?? false,
      videoAutoplay: req.body.videoAutoplay ?? true,
      fit:           req.body.fit           || 'cover',
      bgColor:       req.body.bgColor       || '#000',
    };
  } else if (kind === 'carousel') {
    newItem = {
      id: uuidv4(),
      kind: 'carousel',
      active: req.body.active ?? true,
      label: req.body.label || 'Billedkarrusel',
      images: Array.isArray(req.body.images) ? req.body.images : [],
      defaultSeconds: Number(req.body.defaultSeconds) || 10,
      fadeMs:         Number(req.body.fadeMs)         || 2000,
      bgColor:        req.body.bgColor                || '#000',
      showTicker:     req.body.showTicker             ?? false,
    };
  } else if (kind === 'contest') {
    newItem = {
      id: uuidv4(),
      kind: 'contest',
      active: req.body.active ?? true,
      label: req.body.label || 'Konkurrence',
      title: req.body.title || '',
      subtitle: req.body.subtitle || '',
      blocks: Array.isArray(req.body.blocks) ? req.body.blocks : [],
    };
  } else if (kind === 'section') {
    newItem = {
      id: uuidv4(),
      kind: 'section',
      active: true,
      label: req.body.label || 'Sektion',
    };
  } else if (kind === 'wish-loop') {
    newItem = {
      id: uuidv4(),
      kind: 'wish-loop',
      active: req.body.active ?? true,
      label: req.body.label || 'Ønske-loop',
      videoSrc: req.body.videoSrc || '/assets/wish-loop/bg.mp4',
      cards: Array.isArray(req.body.cards) ? req.body.cards : [],
      direction: req.body.direction || 'stack',
      perCardSeconds: req.body.perCardSeconds ?? 5,
      stackDepth: req.body.stackDepth ?? 3,
      pauseOnHover: req.body.pauseOnHover ?? true,
      videoBlur: req.body.videoBlur ?? 36,
      videoDarken: req.body.videoDarken ?? 0.5,
      chrome: req.body.chrome ?? true,
      eyebrowPretitle: req.body.eyebrowPretitle ?? 'Stjernegolf 2026 · Auktion',
      eyebrowTitle:    req.body.eyebrowTitle    ?? 'Børnenes ønsker',
      sponsorEnabled:  req.body.sponsorEnabled  ?? true,
      sponsorPretitle: req.body.sponsorPretitle ?? 'Præsenteret af',
      sponsorMode:     req.body.sponsorMode     || 'text',
      sponsorMark:     req.body.sponsorMark     || 'Ønskeskyen',
      sponsorLogo:     req.body.sponsorLogo     || '',
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

// Fields that should stay in sync across every wish-loop item so all
// Ønsketræ slides share the same look — only cards + label + active vary
// per instance.
const WISH_LOOP_SHARED_FIELDS = [
  'videoSrc', 'direction', 'perCardSeconds', 'stackDepth', 'pauseOnHover',
  'videoBlur', 'videoDarken', 'chrome',
  'eyebrowPretitle', 'eyebrowTitle',
  'sponsorEnabled', 'sponsorPretitle', 'sponsorMode', 'sponsorMark', 'sponsorLogo',
];

app.put('/api/lots/:id', (req, res) => {
  const lot = lotsFile.lots.find(l => l.id === req.params.id);
  if (!lot) return res.status(404).json({ error: 'Not found' });
  Object.assign(lot, req.body);   // shallow merge of provided fields
  lot.id = req.params.id;          // never let the id be overwritten by body
  // Per-lot sound override edited in the generator: mirror into the live
  // auction state (rebuildAuctionState only seeds missing entries).
  if (req.body && 'sound' in req.body) {
    state.sounds[lot.id] = { ...(lot.sound || {}) };
    broadcast();
  }
  // Propagate shared wish-loop config to every other wish-loop item so the
  // operator only has to tweak look-and-feel once.
  if (lot.kind === 'wish-loop') {
    for (const other of lotsFile.lots) {
      if (other.kind !== 'wish-loop' || other.id === lot.id) continue;
      for (const k of WISH_LOOP_SHARED_FIELDS) {
        if (k in lot) other[k] = lot[k];
      }
    }
  }
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

// ---- Image post-processing ----
// Customers upload print-quality originals (>10MB, >5000px) — way too heavy
// for the live auction over flaky venue Wi-Fi. Shrink raster uploads to fit
// 2500px on the longest side and re-encode where it pays off.
//   - hero / logo / extra-logo -> WebP @85 (smallest payload; client persists
//     the new URL so the .webp extension flows through automatically)
//   - closing / apple / wish-bg -> resize in place, keep original format
//     (these filenames are referenced verbatim in lots.json; changing the
//     extension would break the references)
//   - sound / video / svg / gif -> skipped (vector, animated, or not images)
const MAX_DIM = 2500;
const WEBP_QUALITY = 85;
const JPEG_QUALITY = 85;
const RASTER_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tiff', '.bmp']);
const WEBP_KINDS  = new Set(['hero', 'logo', 'extra-logo', 'carousel']);

async function processUpload(req) {
  if (!req.file) return;
  const kind = req.body.kind || req.query.kind;
  if (kind === 'sound') return;
  const ext = extname(req.file.filename).toLowerCase();
  if (!RASTER_EXTS.has(ext)) return;
  const src = req.file.path;
  let meta;
  try { meta = await sharp(src).metadata(); }
  catch { return; }                                       // not a decodable image
  const tooBig = (meta.width || 0) > MAX_DIM || (meta.height || 0) > MAX_DIM;
  const convertToWebp = WEBP_KINDS.has(kind) && ext !== '.webp';
  if (!tooBig && !convertToWebp) return;

  const pipe = sharp(src).rotate();                       // honour EXIF orientation
  if (tooBig) pipe.resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true });

  if (convertToWebp) {
    const newFilename = req.file.filename.slice(0, -ext.length) + '.webp';
    const newPath = resolve(dirname(src), newFilename);
    await pipe.webp({ quality: WEBP_QUALITY }).toFile(newPath);
    if (newPath !== src) unlinkSync(src);
    req.file.filename = newFilename;
    req.file.path = newPath;
  } else {
    // Resize in place: write to .tmp then replace (sharp can't read+write same file).
    const tmp = src + '.tmp';
    if (ext === '.jpg' || ext === '.jpeg') pipe.jpeg({ quality: JPEG_QUALITY });
    await pipe.toFile(tmp);
    unlinkSync(src);
    renameSync(tmp, src);
  }
}

app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  try { await processUpload(req); }
  catch (e) { console.warn('image process failed:', e?.message || e); }
  const kind = req.body.kind || req.query.kind;
  const lotId = req.body.lotId || req.query.lotId;
  // In prod (no Vite watcher), persist heroExt immediately so viewer +
  // auctioneer + controller resolve the right URL after a soft refresh.
  // In dev we skip — Vite would HMR-reload the generator mid-edit.
  if (isProd && kind === 'hero' && lotId) {
    const ext = extname(req.file.filename).replace(/^\./, '').toLowerCase();
    const idx = parseInt(req.body.imgIndex || req.query.imgIndex || '1', 10);
    const lot = lotsFile.lots.find(l => l.id === lotId);
    if (lot) {
      if (idx > 1) {
        // Extra image (2/3): record ext on heroImages[idx-2].
        lot.heroImages = lot.heroImages || [];
        while (lot.heroImages.length < idx - 1) lot.heroImages.push({});
        lot.heroImages[idx - 2].ext = ext;
      } else {
        lot.heroExt = ext;
      }
      saveLots(lotsFile);
      broadcastLotsUpdated();
    }
  }
  // Sound: bind the uploaded file to the lot's init / hammer slot (or to
  // the deck-wide defaults when no lotId is supplied).
  if (kind === 'sound') {
    const which = req.body.which || req.query.which;
    const target = lotId ? (state.sounds[lotId] = state.sounds[lotId] || {}) : state.soundDefaults;
    if (which === 'init')   target.initSound = req.file.filename;
    if (which === 'hammer') target.hammerSound = req.file.filename;
    // Persist mapping to lots.json (per-lot → lot.sound, deck-wide → meta.soundDefaults)
    if (lotId) {
      const lot = lotsFile.lots.find(l => l.id === lotId);
      if (lot) { lot.sound = { ...state.sounds[lotId] }; saveLots(lotsFile); }
    } else {
      if (!lotsFile.meta || typeof lotsFile.meta !== 'object') lotsFile.meta = {};
      lotsFile.meta.soundDefaults = { ...state.soundDefaults };
      saveLots(lotsFile);
    }
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
  // Force revalidation on the standalone /auction-display/ and /wish-loop/
  // modules' HTML + .jsx files — they're served as static text from dist/
  // and have no cache-busting query strings on the <script src> tags.
  // Without this, browsers cache the in-browser-Babel-transpiled JSX
  // indefinitely and never pick up redeploys until the user hard-reloads.
  app.use((req, res, next) => {
    if (/^\/(auction-display|wish-loop)\/.+\.(html|jsx)$/.test(req.path)) {
      res.set('Cache-Control', 'no-cache, must-revalidate');
    }
    next();
  });
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
  const volume = which === 'init'
    ? (cfg.initVolume ?? def.initVolume ?? 1)
    : (cfg.hammerVolume ?? def.hammerVolume ?? 1);
  soundEventId += 1;
  broadcastSoundEvent({
    action: 'play',
    file,
    offset,
    fadeIn: cfg.fadeInSec ?? def.fadeInSec ?? 0,
    fadeOut: cfg.fadeOutSec ?? def.fadeOutSec ?? 0,
    volume,
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
      persistAuctionState();
    } else if (msg.type === 'hammerslag' && state.lots[msg.lotNum]) {
      state.lots[msg.lotNum].finalPrice = msg.finalPrice;
      state.lots[msg.lotNum].status = 'sold';
      persistAuctionState();
      broadcast();
      emitPlay(msg.lotNum, 'hammer');
      return;
    } else if (msg.type === 'lotStatus' && state.lots[msg.lotNum]) {
      state.lots[msg.lotNum].status = msg.status;
      persistAuctionState();
    } else if (msg.type === 'undo-bid' && state.lots[msg.lotNum]) {
      const ls = state.lots[msg.lotNum];
      if (ls.status === 'sold') {
        ls.status = ls.bids.length ? 'live' : 'pending';
        ls.finalPrice = null;
      } else if (ls.bids.length) {
        ls.bids.pop();
        if (ls.bids.length === 0) ls.status = 'pending';
      }
      persistAuctionState();
    } else if (msg.type === 'reset-auctions') {
      state.lots = freshLots();
      persistAuctionState();
      // Zero out per-team bonus donations alongside the lot/bid reset so
      // a fresh head-to-head round starts from 0 across the board.
      if (lotsFile.meta && Array.isArray(lotsFile.meta.teams)) {
        let touched = false;
        for (const t of lotsFile.meta.teams) {
          if (Number(t.bonusAmount) > 0) { t.bonusAmount = 0; touched = true; }
        }
        if (touched) {
          saveLots(lotsFile);
          broadcastLotsUpdated();
        }
      }
    } else if (msg.type === 'set-sound' && state.sounds[msg.lotNum]) {
      state.sounds[msg.lotNum] = { ...state.sounds[msg.lotNum], ...msg.config };
      // Persist to lots.json so the mapping survives server restart.
      const lot = lotsFile.lots.find(l => l.id === msg.lotNum);
      if (lot) {
        lot.sound = { ...state.sounds[msg.lotNum] };
        saveLots(lotsFile);
      }
    } else if (msg.type === 'set-sound-defaults') {
      state.soundDefaults = { ...state.soundDefaults, ...msg.config };
      if (!lotsFile.meta || typeof lotsFile.meta !== 'object') lotsFile.meta = {};
      lotsFile.meta.soundDefaults = { ...state.soundDefaults };
      saveLots(lotsFile);
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
