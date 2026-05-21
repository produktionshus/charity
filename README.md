# KidsAid StjerneGolf 2026 — Auction web app

Three synchronised views over a single WebSocket channel:

| Path                  | Audience                   |
| --------------------- | -------------------------- |
| `/`                   | Audience / projector       |
| `/auctioneer.html`    | Auctioneer's screen        |
| `/controller.html`    | Operator: previews + live auction controls + thumbnails |

## Dev

```bash
npm install
npm run dev
# http://localhost:5180/
```

Vite middleware serves the client with HMR. A dedicated `/sync` WebSocket relays state between clients.

## Production / Railway

```bash
npm run build   # outputs dist/
npm run start   # NODE_ENV=production, serves dist/
```

Server binds to `process.env.PORT` (Railway sets it automatically).

## Architecture

- `server.js` — http + express(prod) / Vite middleware(dev) + ws relay. Holds authoritative state in memory.
- `src/state.ts` — shared schema (slide nav + bid state per lot).
- `src/render.ts` — slide templates (cover, lot, sponsor-index, closing).
- `src/layout.ts` — per-lot layout decisions (profile vs horizon, mirroring, photo focal).
- `src/slides.ts` — slide registry driven by `src/lots.json`.

State persists only while the server runs. Restart wipes bid history — fine for a single live event session.
