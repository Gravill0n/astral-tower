# Roadmap to 1.0

Each milestone ends playable and deployed. Section numbers refer to the [GDD 1.0](https://claude.ai/artifact/9LbvfLcefjGudiLC9XsYi1).

| # | Milestone | GDD | Done when |
|---|---|---|---|
| M0 | **Setup**: Vite + React + TS, TanStack Router (hash history), Vitest, lint, GitHub Actions → Pages, PWA shell | – | An empty, installable app is online |
| M1 | **Balance pipeline**: `balance/*.xlsx` → Zod → typed JSON; unlock-phrasing parser | 13 | All game data typed and validated; a bad sheet fails the build |
| M2 | **Game core**: clock, resources and caps, costs and bulk buying, unlocks, mana grid, apprentices, bonus stacking, save + migrations, offline catch-up | 3, 11.1, 11.3 | Tested core with no UI |
| M3 | **Shell and Grimoire theme**: sidebar, top bar, mobile tabs, number formats, Overview skeleton | 12.1, 12.3 | The app's frame on desktop and mobile |
| M4 | **Buildings and Foundry**: floors, build and edit panels, steppers, Ratios, Overchannel, runes, upgrades | 4, 5 | First ~2 h of play |
| M5 | **Gardens**: crops, harvest windows, hunger, Kitchen, Composter, timeline | 6 | ~2–5 h |
| M6 | **Guild**: ships, captains, launch, risk, events, contracts | 7 | ~5–9 h |
| M7 | **Library**: relics, constellations, star-matching, Lore | 8 | ~9–14 h |
| M8 | **Supernova**: Red Giant, Stardust, reset, Stardust tree, star types | 10.1–10.4 | A full loop with resets |
| M9 | **Bestiary**: Hollow, eggs, familiars, traits, breeding, Starseed | 9 | All five modules |
| M10 | **Galaxy map**, Trials, dim stars, story end | 10.5–10.6 | End of the 1.0 story |
| M11 | **Comfort**: Welcome back, notifications, Stats, Settings, accessibility, credits | 11.2, 11.4, 12.4, 12.5 | 1.0 feature complete |
| M12 | **Balance pass**: a headless bot plays run 1 and checks the GDD 2 unlock timeline | 2 | Release |

Notes:
- Supernova (M8) comes before the Bestiary (M9): it opens at 9:00, while the Bestiary often opens only in run 2.
- The M12 bot can start small from M4 on, so pacing problems show up as each module lands.
- Before M1, export the Balance sheet as `.xlsx` into `balance/`.
