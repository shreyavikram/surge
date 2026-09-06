# Greenfield (formerly SURGE) handoff (updated 2026-09-06, morning after the overnight pass)

Read this first if you are continuing the build in a new session, on a new account, or with a
different model. Everything below is also in the repo; this is the map.

## Latest state (morning of 2026-09-06, after the overnight pass)

- Live: https://surge-bafg.onrender.com, deployed from `main` of https://github.com/shreyavikram/surge (Render service `srv-daebn5ht0dsc739jbsmg`). **Always push `main` (`git push origin HEAD`) and then trigger a deploy** with `POST https://api.render.com/v1/services/srv-daebn5ht0dsc739jbsmg/deploys` using `RENDER_API_KEY` from `.env`; Render's GitHub sync lags a push by ~30 s, and a deploy triggered too early rebuilds the previous commit. Poll `/deploys?limit=1` until `live`.
- Tests: engine 133, server 70+, config 8, web 4, all green; `npm run typecheck` clean in every workspace.
- Overnight work (all committed): (1) a read-only red-team review found 13 logic/unit errors, all fixed and pinned (DECISIONS.md #23, `packages/engine/test/review-fixes.test.ts`, `apps/server/test/review-fixes.test.ts`); (2) `docs/DATA-AUDIT.md` records mechanism, confidence and improvements for every data process; (3) FAO price-anomaly indicator (`packages/engine/src/anomaly.ts`) on BLS retail prices via FRED, exposed at `/api/price-stress` and shown as the "Store prices vs. the usual season" strip in the watchlist; (4) US Census imports-by-origin feed (`apps/server/src/feeds/trade.ts`): a ≥ 20% three-month decline from a ≥ 10% origin becomes an *import decline* threat (new category), anticipated (yellow) until store prices are abnormal, then unstable (red); (5) `packages/config/tools/build-origin-shares.py` measured every commodity's origin shares from Census data; `origin-shares.json` now replaces the hand-typed `usImportOriginShare` numbers and adds 36 supplier-country regions (`country-geo.json`), comparison in `packages/config/tools/origin-shares-report.md`; (6) interpreter matches whole words only and reads a percentage as severity only next to loss language; (7) headline-only hazard severities are capped (3% national, 15% regional) unless the headline quotes a loss figure.
- Map: **the simple map (`MapFallback.tsx`, our own geometry, English names, no tile provider) is the default** since CARTO's free tiles began stamping "API KEY REQUIRED" on every tile (2026-09-06 morning). Street-map tiles (OpenStreetMap, no key) are opt-in from Settings → Map style. Yellow is labelled "possible disruption" everywhere; hover text states the supply share for every status and adapts to the commodity filter.
- Morning-after pass (2026-09-06): the DATA-AUDIT improvements were implemented where feasible (Part E of `docs/DATA-AUDIT.md` lists each item as done / not done with reasons and the revised confidence table): crop-calendar weights, irrigation discount, GDACS population scaling (Green dropped), FIRMS polygons + radiative power, chokepoint shares from measured origins × routing, three-year seasonal Census baseline with replacement origins, HS-level GTA mapping, two-outlet news corroboration with a labelled headline set, measured all-food import shares (`countries.json`, 90 countries), and a monthly GitHub Action that re-measures origins.
- Yellow layer: Google News RSS → Gemini `gemini-3.6-flash` classification (fallback models in `ai/news-llm.ts`) → deterministic validation and relief/place guards; rules-only path when no key.
- APHIS per-detection archive is in (`data/snapshots/aphis-detections.csv`, `packages/config/tools/convert-aphis.py`); refresh by hand from the APHIS dashboard export.
- Keys in `.env` only: FRED, NASS, FIRMS, EIA (**rotate: it was exposed in a public fixture for a short window**), GTA, AMS, RENDER, GEMINI, RESEND, CENSUS, SURGE_VETTED_KEY. The Census key is optional (500 requests/day without it).
- **Email alerts (2026-09-06 late morning).** Render's free instance has no disk, so the subscriber file was wiped by every deploy and nothing ever ran the alert job. Now: `AlertStore` persists to Upstash Redis when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set on Render (free tier; **the one new signup worth doing**), else to a local file; subscribing sends a confirmation email with the current matches; `/api/alerts/run` is called every 30 min in-process and by `.github/workflows/alerts.yml`; the first run on an empty store is a baseline. Resend sends from `onboarding@resend.dev`, which only delivers to the Resend account owner's address until a domain is verified (set `ALERT_FROM` after verifying).
- Local dev: `.claude/launch.json` has `server` (Hono 8787) and `vite` (5173, proxies `/api`).

## What changed on 2026-09-06 (read before anything else)

- Branch `plan3-web-prototype` holds everything; `main` is behind. The web app was restructured after the team's 28-point critique (docs/superpowers/plans/2026-09-06-plan4-critique-restructure.md).
- Engine: severity now means the fraction of the affected supply channel lost; `cvByMonth`/`cvAnnual`; substitution excludes the shocked item and nonfood; tariff/cost shocks get an offset target for relief; producer revenue distinguishes domestic losses from import losses; `focus.ts` attributes loss to states and congressional districts; `heat.ts` colors suppliers and states; `interpret.ts` turns typed text into validated threat candidates.
- Config: `focus.json` (states) + `focus-districts.json` (429 districts from NASS county census via the Census crosswalk; rebuild with `python3 packages/config/tools/build-districts.py`), `countries.json` (US food-import shares), regions carry `countries` (ISO3) lists, `us-national` region added.
- Web: heatmap-only map (no dots), scenario tabs with dials and a typed-scenario box, left-toolbar filters (area multi-select, commodities, kind), Impact/Distribution/Relief drawer, charts with axes, info glossary, unread badges, settings with email alerts. Geo files in `apps/web/public/geo/` (countries, states, cd119).
- Server: adapters gdacs, portwatch, fred, usdm, firms, eia, gdelt, aphis, gta with fixtures and `data/snapshots`; `/api/interpret` (Gemini `gemini-3.6-flash` proposer + rule-based, validated), `/api/alerts` (Resend or SMTP, else queued), `/api/alerts/run` diffs new threats. `npm run snapshot -w @surge/server` refreshes snapshots.
- Deploy: `Dockerfile` + `render.yaml` run the Hono server with the built client in one container. Live at https://surge-bafg.onrender.com (Render service `srv-daebn5ht0dsc739jbsmg`, owner `tea-dae73kmq1p3s7387gmdg`, auto-deploys from `main` of the public repo https://github.com/shreyavikram/surge). Env vars are set in Render. Vite dev proxies `/api` to `localhost:8787`.
- Security note (2026-09-06): two raw EIA fixture files echoed the EIA API key; they were deleted and history was rewritten, but the repo was public for a window, so the EIA key should be rotated.
- Known gaps: GDELT rate-limits (one request per 5 s per IP) so the news feed often serves its error state until the deployed IP behaves; APHIS per-detection data still needs the manual dashboard download; GDACS events outside gazetteer regions are dropped; district population/income is the state figure divided by district count until a Census API key is added (`CENSUS_API_KEY`).

## State of the repo

- Branch `main`, clean tree, 85 tests green (`packages/engine` 79, `packages/config` 6).
- **Plan 1 (engine + config) is complete and merged.** The deterministic core exists and is
  calibrated: `packages/engine/src/{biology,price,welfare,demand-system,shock,impact,mitigation,scenario}.ts`.
- **Plan 2 (server, feeds, snapshots, gate, AI layer) is designed but not yet written as a plan
  file.** Its content is in this document under "Plan 2".
- Plans 3 (web app) and 4 (simulator, briefs, deploy) follow the spec sections 6 and 7.

Run tests:
```bash
export PATH="$HOME/.local/bin:$PATH"   # Node 24.20 lives in ~/.local/opt/node; no Homebrew on this Mac
npm install && npm test && npm run typecheck
```

## Documents to read, in order

1. `SURGE_3layer_spec.md` in ~/Downloads (the original brief; copy it into `docs/` if it is missing).
2. `docs/superpowers/specs/2026-09-05-surge-design.md` — approved design, including §11 AI layer and §12 persona.
3. `docs/economics/literature-review.md` — every parameter and the published benchmarks.
4. `docs/economics/methodology.md` — the equations the code implements.
5. `DECISIONS.md` — sixteen judgment calls with reasons. Do not silently reverse them.
6. `docs/superpowers/plans/2026-09-05-plan1-engine-config.md` — how Plan 1 was built (task format to reuse).
7. `docs/TEAM-TASKS.md` — what the two humans are doing in parallel; check `docs/REVIEW.md` if it exists.

## Who the user is and what they asked for

- Two-person hackathon team (DNHacks) plus an economist reviewer. Demo from a public URL. No time pressure stated.
- Scope: **all products in the American food supply**, not only eggs. Eggs (2022 replay, 2024 calibration) and infant formula (2022) are the calibrated cases.
- Economics must be checked against literature; the user expects the assistant to be the primary economics expert. Every number carries a source and a measured/modeled label.
- Judging rubric (saved in memory and summarized in spec §11): AI must be structural, not a bolt-on; design needs a named persona; feasibility needs cost/security/regulation notes.
- Working style the user accepted: autonomous execution, commit after every task, brief updates, a REVIEW.md channel for their comments.

## Things that bit us (do not rediscover)

- git on this machine is 2.23: `git init -b main` fails; the repo was renamed to `main` after the fact.
- TypeScript `module: NodeNext` requires `import x from './a.json' with { type: 'json' }`; vitest handles it.
- Slutsky symmetrization must be precision-weighted and must skip the nonfood numeraire (methodology §3), else adjustments explode.
- A replay (observed price path) must value the shock at its own counterfactual price, not the config year's; `impact.ts` does this via `opts.observed.counterfactualPrice`.
- The ERR-139 appendix omits the frozen-foods column on its first row page; 13 cells are set to 0 and listed in `demand-system.json.unreportedCells`.
- Mitigation levers are additional to baseline recovery; do not add "plant restarts" or "repopulation" as levers, the shortfall path already recovers.
- WebFetch is blocked (403) on ssrn.com, congress.gov, datalumos.org; curl with a browser UA also fails on DataLumos.

## Verified feed endpoints (all tested 2026-09-05, no key)

- IMF PortWatch daily chokepoints: `https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query?where=portid%3D%27chokepoint6%27&outFields=*&orderByFields=date%20DESC&resultRecordCount=60&f=json` — fields `date, portid, portname, n_total, capacity, n_container, n_dry_bulk, n_tanker`. 28 chokepoints; ids: chokepoint1 Suez, 2 Panama, 3 Bosporus, 4 Bab el-Mandeb, 5 Malacca, 6 Hormuz, 7 Cape of Good Hope, 8 Gibraltar, 9 Dover, 10 Oresund, 11 Taiwan, 12 Korea, 13 Tsugaru, 14 Luzon, 15 Lombok, 16 Ombai, 17 Bohai, 18 Torres, 19 Sunda, 20 Makassar, 21 Magellan, 22 Yucatan, 23 Windward, 24 Mona, 25 Balabac, 26 Bering, 27 Mindoro, 28 Kerch. Coordinates are not in the service; hardcode from the region gazetteer (add entries for the rest).
- GDACS events: `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=DR;FL;TC;WF;EQ;VO&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD` — GeoJSON with `eventtype, alertlevel (Green/Orange/Red), country, iso3, fromdate, todate, name, description`, point coordinates. Map alert level to severity 0.2/0.5/1.0 (threat-types.json says so).
- FRED CSV, no key: `https://fred.stlouisfed.org/graph/fredgraph.csv?id=<SERIES>`. Series in use: APU0000708111 (eggs), APU0000706111 (chicken), APU0000703112 (ground beef), APU0000709112 (milk), APU0000710212 (cheddar), APU0000702111 (bread), APU0000701312 (rice), APU0000712112 (potatoes), APU0000712211 (lettuce), APU0000712311 (tomatoes), APU0000711111 (apples), APU0000711211 (bananas), APU0000711311 (oranges), APU0000717311 (coffee), APU0000715211 (sugar), POPTHM (population), CXU080110LB0101M (CEX eggs), CXUTOTALEXPLB0101M, CXUFOODHOMELB0101M.
- US Drought Monitor, no key: national `https://usdmdataservices.unl.edu/api/USStatistics/GetDroughtSeverityStatisticsByAreaPercent?aoi=us&startdate=M/D/YYYY&enddate=M/D/YYYY&statisticsType=1`; state `.../api/StateStatistics/GetDroughtSeverityStatisticsByAreaPercent?aoi=<FIPS>&...` (CSV: MapDate, D0..D4 area shares).
- Open-Meteo, no key: `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&daily=temperature_2m_max&forecast_days=7`.
- APHIS HPAI: the public page embeds a Tableau Server view. CSV export of the dashboard's first sheet works: `https://publicdashboards.dl.usda.gov/t/MRP_PUB/views/VS_Avian_HPAIConfirmedDetections2022/HPAI2022ConfirmedDetections.csv?:showVizHome=no` (columns: Is Last Reporting Month, Month of Confirmed Diagnosis, Backyard Flocks). Per-detection rows (state, county, birds) are only reachable through the dashboard's Download → Data → Full data button in a browser; a human should do that once and save it as `data/snapshots/aphis-detections.csv` (kind: archive). The 2022 monthly timeline is already in `packages/config/data/cases/egg-2022.json`.
- Keyed (user is registering; read from `.env`): FRED_API_KEY (optional), NASS_API_KEY (QuickStats `https://quickstats.nass.usda.gov/api/api_GET/?key=..&commodity_desc=EGGS&...`), FIRMS_MAP_KEY (`https://firms.modaps.eosdis.nasa.gov/api/area/csv/{KEY}/VIIRS_SNPP_NRT/{west},{south},{east},{north}/{days}`), EIA_API_KEY, GTA_API_KEY (`https://api.globaltradealert.org/api/v1/data/` with Authorization header, body `{limit, offset}`), AMS_API_KEY (MyMarketNews), ANTHROPIC_API_KEY, ACLED (OAuth: email+password → 24h token; API access must be enabled by ACLED staff).

## Plan 2 (to be written as `docs/superpowers/plans/2026-09-06-plan2-server-feeds-ai.md`, then executed)

Package `apps/server`: Hono 4.13 + `@hono/node-server` 2.1 on Node 24. Zero database. Structure:

```
apps/server/src/index.ts            createApp() + listen; serves apps/web/dist statically in Plan 3
apps/server/src/feeds/types.ts      FeedAdapter { id, kind: 'live'|'archive'|'structural', ttlMs, requiresKey?, fetch(env): Promise<FeedResult>, snapshot: string }
apps/server/src/feeds/registry.ts   cache with TTL; on error or SURGE_FORCE_OUTAGE=<id> → load data/snapshots/<id>.json, mark stale; /api/health rows
apps/server/src/feeds/{gdacs,portwatch,fred,usdm,openmeteo,aphis,firms,nass,eia,gta,acled,ifpri}.ts
apps/server/src/threats.ts          feed items → Threat[] via config/regions (bbox intersection → commodity relevance), then rankThreats() from the engine
apps/server/src/gate.ts             SURGE_VETTED_KEY; cookie; strips Threat.gated and county fields unless vetted
apps/server/src/ai/extract.ts       LLM extraction of Threat candidates from unstructured feed text + deterministic validator (validateThreatCandidate) + eval set in test/fixtures/extraction/*.json
apps/server/src/ai/analyst.ts       manual tool-use loop over engine tools (list_threats, run_threat, run_scenario, compare_scenarios, explain_assumptions); numeric guard
apps/server/src/ai/brief.ts         brief from ImpactResult + MitigationPlan; numeric guard; templated fallback
apps/server/src/ai/guard.ts         extractNumbers(text) vs numbers present in tool outputs (tolerant of formatting: 1.41B, 1,414, 9%)
apps/server/src/routes/*.ts         /api/health, /api/context (config for the web), /api/threats, /api/series/:id, /api/cases, /api/brief, /api/ask, /api/vetted
data/snapshots/*.json               committed fallbacks with fetchedAt; `npm run snapshot` refreshes them
scripts/snapshot.ts                 runs every adapter and writes snapshots
```

Claude SDK facts (from the claude-api skill, current as of this session): package `@anthropic-ai/sdk` 0.124.0; model `claude-opus-5`; thinking is adaptive by default (omit the parameter); structured outputs via `client.messages.parse({ ..., output_config: { format: zodOutputFormat(Schema) } })` with `zod` 4 and `import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"`; `parsed_output` is null on failure; manual tool loop: `client.messages.create({ tools, messages })`, loop while `stop_reason === 'tool_use'`, push `{ role: 'assistant', content: response.content }` then a user message of `{ type: 'tool_result', tool_use_id, content }` blocks; tools may set `strict: true` with `additionalProperties: false`. Never prefill assistant text. Use `max_tokens` around 16000 for non-streaming. Feed text goes inside a delimited data block in the user message, never in the system prompt; the validator is the last word on anything extracted.

Tests for Plan 2 use recorded fixtures (no network): each adapter parses a fixture file; the registry test forces an outage and asserts the snapshot is served with `stale: true`; the gate test asserts county fields are stripped without the key; the extraction eval runs the validator over recorded model outputs and reports category accuracy and commodity precision/recall (threshold: accuracy ≥ 0.8 on the committed set); the guard test rejects a brief containing a number absent from inputs.

## Plan 3 and 4 in one paragraph each

Plan 3, web: Vite + React + MapLibre GL with OpenFreeMap tiles (`https://tiles.openfreemap.org/styles/liberty`, tested reachable, no key). Layout per spec §6: top bar (Live | Simulator, scenario tabs, feed status, theme), collapsible left watchlist ranked by CV from `rankThreats`, center map with markers sized by loss and colored by category, right drawer with Impact | Plate | Relief. Every number carries a measured/modeled chip and a source tooltip from `ImpactResult.assumptions`. The engine runs in the browser (import `@surge/engine` + `@surge/config`); the server only supplies threats and series. Light and dark themes. Trace decisions to `docs/design/persona.md`.

Plan 4: Simulator (drop threat on map → Threat with `source.kind: 'user'`, severity dial → `severityOverride`, save to localStorage, combine via `combineScenarios` with a conflict dialog, compare via `compareScenarios`), briefs and the analyst panel calling `/api/brief` and `/api/ask`, outage demo switch, Dockerfile (node:24-alpine) + `render.yaml`, deploy to Render from the GitHub repo the team creates.

## Can another model continue this?

Yes. The economics judgment is already encoded in the literature review, methodology, decisions, config sources, and tests; what remains is engineering against those. Two rules for whoever continues: do not change a number in `packages/config/data` without adding a source, and do not "fix" a failing calibration test by loosening its tolerance — the tolerances are the contract with the published literature.
