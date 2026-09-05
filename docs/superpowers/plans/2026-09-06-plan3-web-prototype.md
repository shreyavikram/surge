# SURGE Plan 3 (prototype-first): Clickable Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A deployable, clickable SURGE web app — MapLibre threat map + CV-ranked watchlist + Impact/Plate/Relief drawer + a Simulator — running the finished `@surge/engine` **in the browser** over the two calibrated cases plus a seeded set of current-style threats, so the team has a prototype to iterate on before feeds and the AI layer are built.

**Architecture:** Vite + React + MapLibre GL. The engine and config packages are consumed as **source** via Vite aliases (`@surge/engine` → `packages/engine/src/index.ts`, `@surge/config` → `packages/config/src/index.ts`); no build step, no server. Threats come from a committed seed module now (Stage 2 replaces it with `/api/threats` from the feed server). Every number rendered carries a measured/modeled chip and a source tooltip drawn from `ImpactResult.assumptions` and `SourceStamp`.

**Tech Stack:** Node 24.20 (`~/.local/bin`), Vite 7, React 19, `maplibre-gl` 5, TypeScript 5, OpenFreeMap `liberty` vector tiles (no key).

## Global Constraints

- Engine runs unmodified in the browser; **do not** change `packages/engine` or `packages/config` data to make the UI easier (spec §2; DECISIONS). If the engine needs a new export, add it in a separate task and keep tests green.
- Every displayed number carries provenance: a `measured`/`modeled` chip (from `Assumption.kind`) and a source string tooltip. Seeded threats are labeled honestly as seeds, not live data (spec §5 "Numbers carry source stamps").
- Light and dark themes; tabular numerals; dense commodity-intelligence-terminal aesthetic (spec §6, §11 persona).
- Run all commands with `PATH="$HOME/.local/bin:$PATH"`.
- Commit after every task, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- The engine is authoritative: the UI never computes an economic number itself, it only formats what the engine returns (spec §11 "AI never computes a number" generalizes to the whole client).

## File structure

```
apps/web/package.json            @surge/web; deps react, react-dom, maplibre-gl; dev vite, @vitejs/plugin-react, typescript, @types/react(-dom)
apps/web/tsconfig.json           extends base; jsx react-jsx; bundler resolution
apps/web/vite.config.ts          react plugin; aliases to engine/config src; fs.allow repo root
apps/web/index.html              #root
apps/web/src/main.tsx            React root, imports theme.css
apps/web/src/engine.ts           re-exports loadContext/loadCase + helpers; buildThreatList()
apps/web/src/seed.ts             SEED_THREATS: current-style Threat[] (sourced, labeled as seeds) + case threats
apps/web/src/format.ts           usd(), pct(), signed(), compactUsd()
apps/web/src/theme.css           light/dark tokens, tabular numerals, layout
apps/web/src/state.ts            useScenarios() localStorage hook; Scenario helpers
apps/web/src/App.tsx             top bar, Live|Simulator switch, layout, selection state
apps/web/src/components/TopBar.tsx
apps/web/src/components/Watchlist.tsx     ranked by CV; category dot; loss; filters
apps/web/src/components/MapView.tsx       MapLibre; markers sized by loss, colored by category; select
apps/web/src/components/Drawer.tsx        Impact | Plate | Relief tabs
apps/web/src/components/Impact.tsx        price/qty sparklines, CV+band+replica, substitution, incidence, assumptions
apps/web/src/components/Relief.tsx        lever table, coverage sparkline, classification
apps/web/src/components/Plate.tsx         SVG input→farm→processing→plate; affected edges glow
apps/web/src/components/Sparkline.tsx     inline SVG sparkline w/ optional counterfactual
apps/web/src/components/Chip.tsx          measured/modeled/seed chip + title tooltip
apps/web/src/components/Simulator.tsx     drop threat (region/category/commodity/severity/duration), run, save, compare
apps/web/src/components/CategoryLegend.tsx
Dockerfile                        node:24-alpine multi-stage (added in Stage 4 / deploy)
```

## Category → color (single source of truth, `theme.css` vars + `engine.ts` map)

geopolitical (tariff/embargo/export_ban/war/instability/chokepoint/import_dependence) → amber family;
natural hazards (drought/heat/flood/storm/wildfire) → red family;
biological (pest/disease) → violet; supply (input_cost/facility) → teal. Exact hex in `theme.css`.

---

### Task 1: App scaffold builds and serves a blank shell

**Files:** create `apps/web/{package.json,tsconfig.json,vite.config.ts,index.html}`, `src/{main.tsx,App.tsx,theme.css}`.
**Interfaces:** Produces a running `vite dev` on a port; `App` renders "SURGE" top bar.

- [ ] Step 1: Write package.json, tsconfig, vite.config with aliases, index.html, main.tsx, a stub App, theme.css.
- [ ] Step 2: `PATH=... npm install` at repo root (adds workspace).
- [ ] Step 3: `PATH=... npm --workspace @surge/web run build` → expect success (proves engine+config compile in the web build).
- [ ] Step 4: Start dev server via preview_start, screenshot → top bar visible.
- [ ] Step 5: Commit.

### Task 2: Engine wrapper + seed threats + format helpers

**Files:** create `src/engine.ts`, `src/seed.ts`, `src/format.ts`.
**Interfaces:**
- Produces `getContext(): EngineContext` (memoized `loadContext()`); `CATEGORY_COLOR: Record<ThreatCategory,string>`; `buildThreatList(): {threat, observed?}[]` from `seed.ts` + `loadCase`.
- `runThreat`/`rankThreats`/`runScenario`/`compareScenarios`/`combineScenarios` re-exported from `@surge/engine`.
- `SEED_THREATS: Threat[]` — 8–10 current-style threats across categories/regions, each with an honest `source` stamp (`kind:'structural'`, note "illustrative seed — <feed> lands Stage 2"), realistic `physical` values and severities pulled from `threat-types.json` semantics.
- Verified by a tiny vitest (`apps/web/test/seed.test.ts`): every seed threat's commodity ids and regionId exist in the context, and `rankThreats(buildThreatList().map(t=>t.threat), ctx)` returns finite CVs.

- [ ] Step 1: Write failing seed test. Step 2: run, fails. Step 3: implement engine.ts/seed.ts/format.ts. Step 4: test passes + typecheck. Step 5: commit.

### Task 3: Watchlist + Map + selection (Live view)

**Files:** create `src/components/{Watchlist,MapView,CategoryLegend,Chip}.tsx`; wire into `App.tsx`.
**Interfaces:** `App` holds `selectedId`; `rankThreats` drives watchlist order; clicking a row or a marker sets selection and flies the map. Markers sized by `cv` (log scale), colored by category.

- [ ] Steps: build Watchlist (ranked, category dot, compact loss, group/category filter); MapView (MapLibre liberty style, markers, popups, select, dark style swap); verify in browser with screenshots; commit.

### Task 4: Impact panel

**Files:** create `src/components/{Drawer,Impact,Sparkline}.tsx`.
**Interfaces:** `Drawer` tabs Impact|Plate|Relief; `Impact` renders from `runThreat(...).impact`: retail price sparkline vs counterfactual (observed path for cases), quantity sparkline, headline `cv` (compactUsd) with `band` and `csReplica` beside it, `substitution` (significant first), `incidence` by quintile bars, `durationMonths`, and the full `assumptions` list each with a `Chip` (measured/modeled) + source tooltip. Egg-2022 case shows the observed price path and CV near the published $3.5B/$1.4B.

- [ ] Steps: Sparkline, Impact; verify egg-2022 and formula-2022 numbers in browser; commit.

### Task 5: Relief panel + Plate

**Files:** create `src/components/{Relief,Plate}.tsx`.
**Interfaces:** `Relief` renders `runThreat(...).mitigation[worstCommodity]`: lever table (name, type, capacity/lead/cost, precedent link, `classification`), coverage sparkline, total cost, time to close. `Plate` renders `ctx.plate` as a small SVG graph; edges touching a shocked commodity glow.

- [ ] Steps: Relief, Plate; verify formula case ranks regulatory > airlift; commit.

### Task 6: Simulator (drop, dial, save, compare)

**Files:** create `src/components/Simulator.tsx`, `src/state.ts`.
**Interfaces:** form → `Threat` with `source.kind:'user'`; severity slider → `severityOverride`; run through `runThreat`; save Scenario to localStorage (`useScenarios`); compare saved scenarios via `runScenario`+`compareScenarios` in a table. Combine-with-conflicts is stubbed with a note (Stage: full combine).

- [ ] Steps: state hook + Simulator; verify drop+dial+save+compare in browser; commit.

### Task 7: Theme polish + deploy readiness

**Files:** `Dockerfile`, `render.yaml`, README demo section.
- [ ] Multi-stage Dockerfile (build web, serve `dist` with a tiny static server or the Plan-2 Hono server once it exists); `render.yaml`; `npm --workspace @surge/web run build` clean; commit.

## Deferred to later stages (documented so the team can continue)

- **Stage 2 — live map:** `apps/server` (Hono) with GDACS, IMF PortWatch, FRED adapters + TTL cache + snapshot fallback + `/api/health`; web swaps `seed.ts` for `/api/threats`. (Plan 2 outline in `HANDOFF.md`.)
- **Stage 3 — structural AI:** `/api/brief` and `/api/ask` (analyst tool-loop over engine tools) with the numeric guard + templated fallback; a Brief button and an Ask box in the Drawer.
- **Stage 4 — breadth:** remaining feeds, LLM threat extraction + committed eval set, vetted gate, full combine dialog, Playwright e2e, deploy to the team's Render URL.

## Self-review notes

- Spec §6 coverage: top bar, watchlist, map, Impact/Plate/Relief, Simulator, chips/tooltips — all in Tasks 1–6. Vetted gate + briefs are server-side (deferred, documented).
- No number is computed in the client; all come from `ImpactResult`/`MitigationPlan` (Global Constraints).
- Types used (`Threat`, `ImpactResult`, `MitigationPlan`, `Scenario`, `CompareRow`, `RegionConfig`, `ThreatCategory`) are all exported from `@surge/engine` (verified against `types.ts`).
