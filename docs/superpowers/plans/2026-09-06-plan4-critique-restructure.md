# SURGE Plan 4: Critique restructure (team review of prototype 1)

Source: team critique of the Opus prototype (2026-09-06), 28 items plus "crisis circles are too big".
Each item maps to a change below; the number in brackets is the critique number.

## A. Engine changes (TDD, packages/engine)
- [ ] `ImpactResult.welfare.cvByMonth: number[]` and `cvAnnual` (first 12 months) [20].
- [ ] Severity means the fraction of the affected supply channel lost: shock rules use `severity × region share` directly; hazard damage functions move to feed ingestion (alert level → estimated fraction) [9, 11].
- [ ] Substitution list excludes the shocked commodities' own items and the nonfood numeraire; `significant` keeps its meaning [16, 22].
- [ ] Cost/tariff shocks get an offset target: the supply increase that returns retail price to baseline, `s* = π_r × |(1−x)ε + xεₓ/θ|`, run through the lever planner as `MitigationPlan.offset = true` [24].
- [ ] Focus scaling: `scaleImpactToFocus(impact, focus)` returns state-level CV via `state-shares.json` (consumption share = population × regional per-capita spending × income index; production share for producer revenue) [26, 17].
- [ ] Input shocks (fertilizer, energy) flow to every commodity with a cost share; seeds and EIA feed create them [25].

## B. Web restructure (apps/web)
- [ ] Map: `map.resize()` on ResizeObserver + `load`; markers 5–14 px radius; unread red badge (localStorage `surge-read`); click → `easeTo` slight pan toward the dot; zoom ≥ 4 hides markers and shows region fills from `regions.json` bboxes; dotted outline for `status: 'breaking'`; greyed when outside focus [map size, 2, 13, 14, 18, 27, 26].
- [ ] Home state: no auto-selection; right drawer closed until a threat is chosen [1].
- [ ] Panel toggles: triangle at the top-right of each side panel; remove ☰ [19].
- [ ] Drawer tabs: Impact | Distribution | Relief; Plate removed [6, 17].
- [ ] Impact: welfare loss shown as Annual and Total side by side with info icons; producer revenue with info icon; commodity table rows expand into a price chart (month axis, $ y-axis, baseline reference); substitution table without self/nonfood and with a legend for significance; assumptions inside a collapsed dropdown; quintile bars and retail sparkline removed from this tab; no explanatory prose, duration shown once [3, 4, 5, 12, 16, 20, 21, 22].
- [ ] Distribution tab: US state choropleth of per-capita loss (us-atlas), quintile horizontal bars beneath [17].
- [ ] Relief tab: coverage and lever charts with month axis, y-axis, baseline; tariff offset plan [15, 24].
- [ ] Info icons with a glossary for every economics term [21].
- [ ] Scenario tabs in the top bar: Live + named scenarios (+ New). A scenario clones Live; each threat gets severity and duration dials in the drawer; "Describe a scenario" box runs the rule-based interpreter to add hypothetical threats; Compare table across scenarios including Live [7, 8, 10].
- [ ] Focus selector (US / state) in the top bar; numbers rescale; non-affecting threats greyed [26].
- [ ] Settings: email alerts (address, focus, toggle) [28].
- [ ] Copy pass: remove editorial notes and "Stage 2" remarks everywhere [3].

## C. Server (apps/server)
- [ ] Wire the web to `/api/threats`, `/api/health`, `/api/series/:id` with in-browser fallback (Plan 2 Task 12) [23].
- [ ] Adapters with fixtures + snapshots: USDM, FIRMS, GTA, EIA, APHIS, GDELT news (breaking), NASS; PortWatch and GDACS already exist [23, 25, 27].
- [ ] Ingestion severity mapping (alert level → fraction lost) with sources in `threat-types.json` [9].
- [ ] Rule-based scenario interpreter `ai/interpret.ts` (lexicon: commodities, countries, regions, hazards) exposed at `/api/interpret`; pluggable LLM behind the same interface [10].
- [ ] Alerts: `/api/alerts` subscribe/list; poller diffs new threat ids per refresh; nodemailer via `SMTP_URL`, queue shown in UI when unset [28].

## D. Deploy
- [ ] Render service from `render.yaml` via the Render API; env from `.env`; public URL to the team.
