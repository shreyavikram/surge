# Greenfield

Live at **https://greenfield-w77m.onrender.com**. (Repository name and package scopes still say SURGE, the project's working title.)

Greenfield is an agro-defense readiness tool for the American food supply: a live map of threats, a
deterministic model of what each threat costs consumers, and a view of where relief could come from.
Eggs (2022 replay, 2024 calibration) and infant formula (2022) are the calibrated cases; every
commodity in the configuration flows through the same engine.

## Layout

- `packages/engine` — pure TypeScript engine: biology, price stage, welfare, mitigation, scenarios. Zero runtime dependencies, tested with vitest.
- `packages/config` — cited configuration: commodities, inputs, ERS ERR-139 demand system (extracted by `tools/extract-err139.py`), threat rules, regions, levers, plate, cases.
- `apps/web` — Vite + React + MapLibre client. Runs the engine in the browser over the config and the calibrated cases; no server needed for the prototype. Live threat map, CV-ranked watchlist, Impact / Plate / Relief drawer, and a Simulator.
- `apps/site` — the public marketing site: hand-written HTML/CSS/JS, no framework, no build step. Its two maps are generated from the same geodata and cited sources the terminal uses (`tools/build-graphics.mjs`), and `test/claims.test.ts` pins every count it prints to the file that count came from.
- `docs/economics` — literature review, methodology derivations, extracted source texts.
- `docs/superpowers` — design spec and implementation plans.
- `DECISIONS.md` — notable decisions and why.

## Run the tests

```bash
PATH="$HOME/.local/bin:$PATH" npm install && PATH="$HOME/.local/bin:$PATH" npm test
```

## Run the web app

```bash
PATH="$HOME/.local/bin:$PATH" npm install && PATH="$HOME/.local/bin:$PATH" npm run dev -w @surge/web
```

Then open the printed localhost URL (default `http://localhost:5173`) — best viewed at ≥1200px wide.
Build a production bundle with `npm run build -w @surge/web` (output in `apps/web/dist`).

### Run the marketing site

```bash
python3 -m http.server 4318 --directory apps/site
```

It is static, so any file server works. Regenerate the maps after changing the commodity,
origin-share, or district data with `npm run graphics -w @surge/site`.

### Demo script (2 minutes)

1. **Live** view: the watchlist is ranked by consumer welfare loss; click the top threat (a California
   drought) — the map flies to it and the drawer shows the dollar loss, the affected plate, and relief.
2. Click **HPAI layer depopulations, 2022** (a replay): the Impact panel reproduces the observed egg
   price path; open **Relief** to see the 2025 lever set (imports, repopulation, purchase limits) ranked.
3. **Simulator**: build a threat (e.g. Disease + Eggs), drag **severity** — the loss and the recovery
   curve recompute instantly. Save two scenarios and tick both to **compare**.

Every number carries a `measured` / `modeled` / `observed` chip and a source tooltip. Threats shown now
are honestly-labeled **seeds**; the live feed layer lands in the next stage.

## Deploy

- **Render (static site):** `render.yaml` builds `apps/web` and serves `apps/web/dist` with SPA
  routing — connect the repo and click "New Blueprint".
- **Marketing site:** live at **https://greenfield-site.onrender.com** — a second Render static
  service publishing `apps/site` as-is (also declared in `render.yaml`). Deliberately separate, so
  the terminal's URL is unaffected by anything the site does.
- **Docker:** `Dockerfile` builds the client and serves it with a zero-dep Node server (`docker build -t surge . && docker run -p 8080:8080 surge`).

The public URL needs the team's GitHub repo + Render account (see `docs/TEAM-TASKS.md §5`).

## Plans

1. Engine and config — **done** (85 tests green).
2. Server, live feeds, snapshots, vetted gate, AI extraction layer — designed (`HANDOFF.md`), next.
3. Web prototype: map, watchlist, impact, plate, relief, simulator — **done** (`docs/superpowers/plans/2026-09-06-plan3-web-prototype.md`).
4. Live feeds + structural AI (briefs, analyst) + full deploy — staged after the prototype.
