# CLAUDE.md

Astral Tower: a single-player browser incremental/management game. See [README.md](README.md) for the pitch.

## Source of truth

- **GDD 1.0** (Claude Docs): https://claude.ai/artifact/9LbvfLcefjGudiLC9XsYi1. Read the relevant section before building a feature. Section numbers (e.g. "5.4 Overchannel") are the shared vocabulary; cite them in commits and plans.
- **Balance sheet**: every number. Never hard-code a balance value in game logic. Numbers in the GDD only illustrate rules; if they differ, the sheet wins.
- **UI mockups ("Final screens")**: look and layout. Sample values in mockups are illustrations, not targets.

## Hard rules from the design

- **Nothing is ever lost for good**: no ship, crew, captain, familiar or crop is destroyed. Shortages scale speed down in proportion and never break anything.
- **Data-driven balance**: a script turns the Balance sheet into game data. Unlock conditions are parsed from fixed phrasings ("Own N …", "Produce N …", "Build floor N", "Return from …"…). Adding a phrasing means updating `src/data/unlock.ts`.
- **Real-time clock**: constellation phases come from wall-clock minutes (Lantern :00–:10, Comet Fox :10–:20, … Void Moth :50–:60). Offline catch-up replays the same phases. A clock moved backwards pauses progress and is never punished.
- **Offline = online**: everything in GDD 11.1 "Keeps going offline" must give the same result whether the tab was open, hidden or closed (up to the offline cap).
- **Saves never break**: every save from an earlier version must load. Version the save and migrate it.
- **No spells, no cutscenes, no sound, no tutorial pop-ups** in 1.0.
- **Do not build anything in GDD section 14 "Not in 1.0"** (French, Golem rules, Observatory, cloud save, cosmetics, Galactic Drift beyond its teaser…).
- Player-facing names come from the sheet and must stay unique. Wording stays spacefaring ("in flight", "docked").

## Accessibility and comfort (required in 1.0)

Reduced motion, at least two colorblind palettes, keyboard shortcuts on desktop, bottom sheets on mobile, number formats (K/M/B default, scientific, engineering, letters).

## Design sources (links)

- Balance sheet (Claude Sheets, 23 tabs): https://claude.ai/artifact/FGB8pniq5oyygK8xQtkokw
- UI mockups (Design canvas): https://claude.ai/artifact/C2c9MQWzEHFSB8WUaEutGE. Only the `Final-*` artboards are targets (one desktop and one mobile per screen); `R*` artboards are earlier rounds.

## Tech stack

- **TypeScript + Vite + React**, **TanStack Router** (hash history: GitHub Pages has no SPA fallback, and it works offline).
- **Game core is pure TS** (`src/core/`): no React, no DOM, no `Date.now()` inside. It advances via `step(state, dt, now)`. Offline catch-up runs the same function in bigger steps, cut at constellation phase changes. The UI reads snapshots through **TanStack Store**, throttled to a few renders per second.
- **Numbers are plain `number`**. Never compare an accumulated stock to a cost with a raw `>=`; use the shared epsilon helper. Round only for display.
- **Balance data**: the sheet is exported as `.xlsx` into the repo; a script turns it into typed JSON (`src/data/balance.json`, imported via `src/data/index.ts`), validated with **Zod**. To change balance: edit the Claude Sheet → export `.xlsx` over `balance/astral-tower-balance.xlsx` → `pnpm balance` → commit both. Saves are also Zod-validated on load and import (user-controlled input).
- **Tests**: Vitest for the core (most of the risk); Playwright smoke tests on desktop and mobile viewports.
- **Hosting**: GitHub Pages via GitHub Actions, on the custom domain https://astral-tower.gravillon.me/ (Vite base `/`); PWA via vite-plugin-pwa.

## Commands

- `pnpm dev`: Vite dev server.
- `pnpm balance`: regenerate `src/data/balance.json` from the workbook. `--check` only validates and diffs.
- `pnpm build`: `pnpm balance --check` (fails on a bad sheet or stale JSON), type-check, then build to `dist/`.
- `pnpm preview`: serve `dist/` (http://localhost:4173/).
- `pnpm typecheck`: `tsc` only.
- `pnpm lint`: Biome check.
- `pnpm test`: Vitest on `src/`.
- `pnpm e2e`: Playwright smoke tests (desktop and mobile); builds and serves on port 4321 itself.
- `pnpm exec playwright install chromium`: once per machine, before the first `pnpm e2e`.

CI (`.github/workflows/deploy.yml`) runs lint, typecheck, test and e2e on every PR and push, and deploys `main` to https://astral-tower.gravillon.me/.
