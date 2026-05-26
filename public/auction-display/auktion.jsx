// Auktion — Stjernegolf 2026 fundraising-display
// ─────────────────────────────────────────────────────────────────────────────
// CORE IDEA (handoff for Claude Code):
// LED-display module for a live charity auction. Shows 4 competing teams
// as horizontal "race bars". Each bar has two segments:
//   1. Pre-event base (darker shade of team color) — money raised before
//   2. Live auction add (brighter shade) — bids during the event
//
// SCREEN STATE MACHINE (controlled by `screen` tweak):
//   intro     → 4 team chips, anonymized via `namesVisible` toggle
//   reveal    → bars grow in one-by-one based on `revealCount` (1..4)
//   total     → all 4 visible after pre-event reveal, ranking shown
//   pause     → "Næste lot kommer op" intermezzo
//   auction   → one team's lot in focus + their bar growing live
//   final     → winner announcement
//
// INTEGRATION POINTS for production (Claude Code):
//   - useAuctionState() owns all numbers; replace with real-time backend
//   - live-auction current bid is a per-team `auctionAmount` field —
//     wire to your existing auction module's bid stream
//   - lot metadata (title, description) lives per team
// ─────────────────────────────────────────────────────────────────────────────

const { useState, useMemo, useEffect, useRef, useCallback } = React;

// ────────────────────────────────────────────────────────────────
// THEME — Field Green canvas + per-team accent palette
// ────────────────────────────────────────────────────────────────
const A_THEME = {
  canvas: "#3fa34d",
  canvasHi: "#368a40",
  paper: "#f5ede0",
  paperDim: "rgba(245,237,224,0.10)",
  ink: "#fbf7ed",
  headerInk: "#fbf7ed",
  headerDim: "rgba(251,247,237,0.65)",
  line: "rgba(255,255,255,0.14)",
  trackBg: "rgba(0,0,0,0.18)",
  accent: "#fbf7ed",
};

// Default per-team palette — fallback when team doesn't carry its own
// baseColor / liveColor from the operator's color pickers.
const TEAM_PALETTES = {
  A: { base: "#1f6e34", live: "#3ed170", ink: "#0e2a18" },
  B: { base: "#a06a14", live: "#f0b048", ink: "#2a1f08" },
  C: { base: "#9a2b1f", live: "#e85a44", ink: "#2a0e08" },
  D: { base: "#2a5a9e", live: "#6aa9e8", ink: "#0a1d36" },
};
function paletteFor(team) {
  const fb = TEAM_PALETTES[team.palette || team.id] || TEAM_PALETTES.A;
  return {
    base: team.baseColor || fb.base,
    live: team.liveColor || fb.live,
    ink: fb.ink,
  };
}

// ────────────────────────────────────────────────────────────────
// SEED TEAMS — replace via API on production handoff
// Pre-event amounts in range 15.000–150.000 DKK
// ────────────────────────────────────────────────────────────────
const SEED_TEAMS = [
  {
    id: "A", name: "Hold A", palette: "A",
    preAmount: 142000,
    auctionAmount: 0,
    lot: {
      title: "Privatfly til Mallorca",
      description: "Weekend for 4 personer · charterfly tur/retur · luksusvilla 3 nætter",
    },
  },
  {
    id: "B", name: "Hold B", palette: "B",
    preAmount: 87500,
    auctionAmount: 0,
    lot: {
      title: "Cartier ur",
      description: "Cartier Santos · doneret af Cartier København",
    },
  },
  {
    id: "C", name: "Hold C", palette: "C",
    preAmount: 23000,
    auctionAmount: 0,
    lot: {
      title: "Selected Car Collection",
      description: "Weekend med Ferrari 488 GTB · inkl. brændstof og forsikring",
    },
  },
  {
    id: "D", name: "Hold D", palette: "D",
    preAmount: 64500,
    auctionAmount: 0,
    lot: {
      title: "Viktor Axelsen oplevelsesdag",
      description: "Privat træning + spisning med Viktor og familie",
    },
  },
];

// ────────────────────────────────────────────────────────────────
// PHASES (screen state machine)
// ────────────────────────────────────────────────────────────────
const PHASES = ["intro", "reveal", "total", "pause", "auction", "final"];

// ────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────
function formatKr(n) {
  if (n == null || isNaN(n)) return "kr 0";
  return `kr ${new Intl.NumberFormat("da-DK").format(Math.round(n))}`;
}

function totalForTeam(t) {
  return (t.preAmount || 0) + (t.auctionAmount || 0);
}

function rankTeams(teams) {
  return [...teams].sort((a, b) => totalForTeam(b) - totalForTeam(a));
}

function maxTotal(teams) {
  return Math.max(...teams.map(totalForTeam), 1);
}

// useAuctionState — single source of truth for the display.
// In production, replace setters with API calls.
function useAuctionState() {
  const [teams, setTeams] = useState(SEED_TEAMS);

  const setPreAmount = useCallback((id, amount) => {
    setTeams((ts) =>
      ts.map((t) => (t.id === id ? { ...t, preAmount: Math.max(0, amount || 0) } : t)),
    );
  }, []);

  const setAuctionAmount = useCallback((id, amount) => {
    setTeams((ts) =>
      ts.map((t) => (t.id === id ? { ...t, auctionAmount: Math.max(0, amount || 0) } : t)),
    );
  }, []);

  const reset = useCallback(() => setTeams(SEED_TEAMS), []);

  return { teams, setPreAmount, setAuctionAmount, reset };
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

Object.assign(window, {
  A_THEME, TEAM_PALETTES, SEED_TEAMS, PHASES,
  formatKr, totalForTeam, rankTeams, maxTotal, paletteFor,
  useAuctionState, useClock,
});
