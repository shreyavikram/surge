# SURGE Plan 2: Server, Feeds, Gate, and the Structural AI Layer

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans or subagent-driven-development. TDD throughout. Steps use checkbox (`- [ ]`).

**Goal:** A Hono server that turns live public feeds into ranked `Threat`s for the web app, serves the calibrated series, enforces the dual-use vetted gate, and adds the three structural-AI components (threat extraction, an analyst tool-loop, briefs) — every one keyless-safe, snapshot-backed, and guarded so AI never emits a number the engine did not compute.

**Architecture:** `apps/server` (Hono 4 + `@hono/node-server`, Node 24) imports `@surge/engine` and `@surge/config` as source. A feed registry caches each adapter with a TTL and falls back to a committed snapshot (marking it `stale`) on any error or when `SURGE_FORCE_OUTAGE=<id>` is set. `threats.ts` maps normalized feed items to `Threat`s through the region gazetteer and ranks them with the engine. The AI layer is on the server only: Claude proposes, a deterministic validator/guard disposes. Feed text is always passed as delimited data, never as instructions.

**Tech Stack:** Node 24.20 (`~/.local/bin`), Hono `^4.6`, `@hono/node-server` `^1.13`, `zod` `^3.23`, `@anthropic-ai/sdk` (pin at install; handoff notes 0.124.0), vitest 3. No database.

## Global Constraints

- **Keyless-safe:** the server boots and every route works with no `.env`. Keyed feeds report `requiresKey` and serve their snapshot; the AI layer returns templated fallbacks when `ANTHROPIC_API_KEY` is absent. No secret is ever logged or returned.
- **Snapshot fallback:** every adapter has a committed `data/snapshots/<id>.json` with `fetchedAt`. On fetch error or forced outage the registry serves it with `stale: true` and a `/api/health` row.
- **Provenance:** every `Threat` and series carries a `SourceStamp` (`feed`, `url?`, `fetchedAt?`, `kind`, `stale?`). The web app already renders these chips.
- **AI never computes a number** (spec §11). The analyst and brief pass through the engine's tool outputs; a numeric guard rejects any response containing a number absent from those outputs and falls back to a template. The extraction validator is the last word on any `Threat` candidate.
- **Prompt-injection defense:** feed/user text goes inside a delimited data block in the *user* message, never the system prompt; tools are allow-listed; the validator re-checks category, commodity ids, region membership, physical kind, and dates against the config.
- **Feeds are data, not instructions.** Nothing read from a feed can change server behavior beyond producing a validated `Threat`.
- Run commands with `PATH="$HOME/.local/bin:$PATH"`. Commit after every task, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File structure

```
apps/server/package.json              @surge/server; deps hono, @hono/node-server, zod, @anthropic-ai/sdk; dev vitest, tsx, @types/node
apps/server/tsconfig.json
apps/server/vitest.config.ts
apps/server/src/index.ts              createApp(): Hono; serves apps/web/dist statically; listen on PORT
apps/server/src/env.ts                readEnv(): typed process.env access (keys optional)
apps/server/src/feeds/types.ts        FeedAdapter, FeedResult, FeedItem, HealthRow
apps/server/src/feeds/registry.ts     FeedRegistry: TTL cache, snapshot fallback, SURGE_FORCE_OUTAGE, health()
apps/server/src/feeds/snapshots.ts    loadSnapshot(id) / writeSnapshot(id, data) (reads data/snapshots)
apps/server/src/feeds/gdacs.ts        drought/flood/storm/wildfire/disease alerts (no key)
apps/server/src/feeds/portwatch.ts    28 chokepoints daily transit (no key)
apps/server/src/feeds/fred.ts         retail price series + population/CEX (no key; FRED_API_KEY optional)
apps/server/src/feeds/usdm.ts         US Drought Monitor by area% (no key)
apps/server/src/feeds/openmeteo.ts    heat anomalies over production regions (no key)
apps/server/src/feeds/aphis.ts        HPAI detections summary (no key; archive per-detection via snapshot)
apps/server/src/feeds/firms.ts        wildfire hotspots (FIRMS_MAP_KEY)
apps/server/src/feeds/nass.ts         layer inventory / cold storage (NASS_API_KEY)
apps/server/src/feeds/eia.ts          diesel / natural gas (EIA_API_KEY)
apps/server/src/feeds/gta.ts          tariffs / export bans (GTA_API_KEY)
apps/server/src/feeds/acled.ts        conflict events (ACLED OAuth)
apps/server/src/feeds/ifpri.ts        food export restrictions (snapshot/structural)
apps/server/src/feeds/index.ts        allAdapters[]
apps/server/src/threats.ts            feedItemsToThreats(items, ctx): Threat[] via region bbox → commodity relevance
apps/server/src/gate.ts               isVetted(req), redactThreat(threat, vetted)
apps/server/src/ai/guard.ts           extractNumbers(text); assertGrounded(text, allowed): {ok, offenders}
apps/server/src/ai/tools.ts           engine tool definitions + dispatch (list_threats, run_threat, run_scenario, compare_scenarios, explain_assumptions)
apps/server/src/ai/client.ts          getClient(env): Anthropic | null; MODEL
apps/server/src/ai/extract.ts         extractThreatCandidates(text, ctx) + validateThreatCandidate(c, ctx)
apps/server/src/ai/analyst.ts         askAnalyst(question, ctx): tool-loop + guard + template fallback
apps/server/src/ai/brief.ts           writeBrief(impact, mitigation, ctx): guarded; templateBrief() fallback
apps/server/src/routes/*.ts           health, context, threats, series, cases, brief, ask, vetted
apps/server/test/**                   fixtures/*.json (recorded), one test per adapter + registry + gate + threats + guard + extract eval + brief guard
apps/server/scripts/snapshot.ts       run every adapter, write data/snapshots/<id>.json
data/snapshots/*.json                 committed fallbacks
```

## Tasks (each ends green + committed)

### Task 1 — server scaffold
`apps/server` package (Hono + node-server), `createApp()` with `/api/health` returning `{ ok: true }`, `index.ts` listens on `PORT` (default 8787) and serves `apps/web/dist` when present. Test: `createApp()` responds 200 on `/api/health` (supertest-style via `app.request`). Commit.

### Task 2 — feed types + registry + snapshots
`FeedAdapter { id; kind; ttlMs; requiresKey?; fetch(env): Promise<FeedResult>; snapshotName }`, `FeedResult { items: FeedItem[]; source: SourceStamp }`, `FeedItem` (normalized: `{ category?, lat, lng, admin?, iso3?, severity?, physical?, start, end?, name, text?, raw }`). `FeedRegistry.get(id, env)`: return cached if fresh; else `fetch`; on throw or `SURGE_FORCE_OUTAGE` contains id → `loadSnapshot` with `stale: true`; record `HealthRow`. Tests (fixtures, no network): fresh fetch caches; forced outage serves snapshot `stale:true`; missing-key adapter serves snapshot and health row says `requiresKey`. Commit.

### Task 3 — no-key adapters (GDACS, PortWatch, FRED)
Parse recorded fixtures into `FeedItem[]`; map GDACS alertlevel→severity (0.2/0.5/1.0), category from `eventtype`; PortWatch → per-chokepoint transit decline vs baseline; FRED CSV → `{series, months, values}`. One fixture test each asserting field mapping. Commit after each adapter.

### Task 4 — threats.ts
`feedItemsToThreats(items, ctx)`: for each item, find regions whose bbox contains the point (or the item's regionId), attach commodities from that region's shares as `{id, relevance}`, set category/severity/physical, build `SourceStamp`. Then engine `rankThreats`. Test: recorded GDACS+PortWatch items → threats with known commodities, finite CV, ranked. Commit.

### Task 5 — routes + gate
`/api/health` (registry rows), `/api/context` (config for the web: commodities, regions, plate, levers, population, totalExpenditure), `/api/threats` (live+snapshot, gated), `/api/series/:id` (FRED), `/api/cases` (case files), `/api/vetted` (POST key → cookie). `gate.ts`: `isVetted` from cookie vs `SURGE_VETTED_KEY`; `redactThreat` strips `gated` and county/premises fields unless vetted. Tests: `/api/threats` strips gated fields without cookie; with valid cookie keeps them. Commit.

### Task 6 — AI guard + tools  *(read the claude-api skill first)*
`guard.ts`: `extractNumbers(text)` tolerant of `1.41B`, `1,414`, `9%`, `$2.73`; `assertGrounded(text, allowedNumbers)` returns offenders (numbers in text not within tolerance of any allowed). `tools.ts`: JSON-schema tool defs (`strict:true`, `additionalProperties:false`) + a dispatcher that runs the engine (`list_threats`, `run_threat`, `run_scenario`, `compare_scenarios`, `explain_assumptions`) and returns both a text result and the set of numbers it contains (for the guard). Tests: guard rejects a hallucinated number, accepts formatting variants; each tool dispatches deterministically. Commit.

### Task 7 — briefs
`writeBrief(impact, mitigation, ctx)`: builds the allowed-number set from the inputs, asks Claude for prose (data block = the numbers, system prompt = role + "use only the provided numbers"), runs the guard, falls back to `templateBrief()` on guard failure or no key. Tests: `templateBrief` contains the headline CV; a brief with an out-of-set number is rejected → template. Commit.

### Task 8 — analyst
`askAnalyst(question, ctx)`: manual tool-use loop (`messages.create`, loop while `stop_reason==='tool_use'`, push assistant content then `tool_result` blocks), allow-listed tools, accumulate allowed numbers across tool outputs, guard the final text, template fallback. Question text goes in a delimited data block. Tests (recorded tool outputs, no live call): loop dispatches tools; guarded answer; injection string in the question does not change tool selection. Commit.

### Task 9 — extraction + eval
`extractThreatCandidates(text, ctx)` (structured output; keyless → returns []), `validateThreatCandidate(c, ctx)`: category in enum, commodity ids in config, point inside a known region bbox, physical kind allowed for the category, dates parse. `test/fixtures/extraction/*.json` labeled items + recorded model outputs; eval runs the validator, reports category accuracy and commodity precision/recall; threshold accuracy ≥ 0.8. Commit.

### Task 10 — snapshots + refresh script
Commit `data/snapshots/<id>.json` for every adapter (from fixtures where no network). `scripts/snapshot.ts` runs each adapter live and rewrites its snapshot; `npm run snapshot`. Commit.

### Task 11 — remaining adapters
usdm, openmeteo, aphis, firms, nass, eia, gta, acled, ifpri — fixture test + snapshot each. Commit per adapter.

### Task 12 — wire the web to the server
Web `getContext`/threat list read `/api/*` when reachable, else fall back to the in-browser config + seeds (so the app still runs with no server). Feed-status badge in the top bar reflects `/api/health`. Commit.

## Notes carried from the handoff
- Verified no-key endpoints and series ids are in `HANDOFF.md` (PortWatch chokepoint query, GDACS event list, FRED CSV, USDM, Open-Meteo, APHIS Tableau CSV).
- SDK: `@anthropic-ai/sdk`; model `claude-opus-5`; adaptive thinking (omit param); structured output via `client.messages.parse({ output_config: { format: zodOutputFormat(Schema) } })`; manual tool loop as above; never prefill assistant text; `max_tokens` ~16000. **Re-verify against the claude-api skill at Task 6.**
- Do not loosen a calibration tolerance to pass; do not add a config number without a source.
```
