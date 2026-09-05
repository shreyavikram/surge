# SURGE design spec

Date: 2026-09-05. Status: approved in conversation; written form for team review.
Source spec: `SURGE_3layer_spec.md` (v0.3). Economics basis: `docs/economics/literature-review.md`.

## 1. Scope

SURGE is an agro-defense readiness tool for the **whole American food supply**: a live map
of threats to it, a deterministic model of what each threat costs consumers, and a view of
where relief could come from. Eggs (2022 HPAI replay, 2024 calibration) and infant formula
(2022 Sturgis shutdown) are the two fully worked, calibrated cases, but every commodity in
the configuration flows through the same engine, and adding a commodity or threat type is a
matter of configuration and data, not code.

Two views: **Live** (real current threats from feeds, read-only) and **Simulator**
(hypothetical threats, savable scenarios in tabs, combine and compare).

Three capabilities behind stable interfaces: Threat map → Impact model → Relief model.

## 2. Architecture

One TypeScript monorepo, one deployable container.

```
surge/
  packages/engine/        pure TS, zero runtime deps, vitest
    src/types.ts            Threat, Shock, ImpactResult, MitigationPlan, Scenario
    src/shock.ts            threat → shock rules (config-driven)
    src/biology.ts          inventory/season paths → physical shortfall
    src/price.ts            shortfall → wholesale → retail price paths
    src/welfare.ts          multi-good Hicksian CV, single-good CS replica, bands, incidence
    src/mitigation.ts       lever allocation, coverage, cost, ranking
    src/scenario.ts         combine (with conflict detection) and compare
    src/demand-system.ts    build Slutsky matrix from config; symmetry + NSD checks
    test/                   calibration and invariant tests, fixtures from the literature
  packages/config/        JSON, versioned, cited
    commodities.json        every commodity: units, baselines, elasticities, shares, biology, trade, plate links
    demand-system.json      ERR-139 two-stage elasticity matrices + CEX budget shares (+ by income quintile)
    threat-types.json       category, shock rule, severity semantics, default duration
    regions.json            production-region gazetteer with commodity shares (world and US-import relevance)
    levers.json             mitigation lever templates with precedents, capacities, lead times, costs
    plate.json              input → farm → processing → plate product graph
    cases/                  egg-2022.json, egg-2024-calibration.json, formula-2022.json
  apps/server/            Hono on Node 24
    src/feeds/<source>.ts   fetch → normalize → cache (TTL) → snapshot fallback → health
    src/routes/             /api/threats, /api/series/:id, /api/health, /api/brief, /api/vetted
    src/gate.ts             vetted-access cookie; field-level redaction
    src/brief.ts            Claude call + numeric guard + template fallback
  apps/web/               Vite + React + MapLibre GL (OpenFreeMap tiles)
    src/views/Live, Simulator
    src/panels/Watchlist, Map, ThreatDetail (Impact | Plate | Relief), ScenarioTabs, Compare, Assumptions
    src/theme/              light and dark tokens, tabular numerals
  data/snapshots/         committed JSON per feed with fetchedAt, used on outage
  docs/                   literature review, methodology (derivations), DECISIONS.md, deploy
  Dockerfile              node:24-alpine, builds web, serves via server
```

Why: the engine must be deterministic, inspectable, and instant in the Simulator, so it runs
in the browser and is shared with the server (server uses it to rank the Live watchlist and
to produce brief inputs). The server exists to hold credentials, cache feeds, serve snapshots,
and enforce the dual-use gate. Both are the same language for a two-person team.

## 3. Interfaces (the contracts the three capabilities meet on)

```ts
type SourceKind = 'live' | 'archive' | 'computed' | 'structural' | 'user';
interface SourceStamp { feed: string; url?: string; fetchedAt?: string; kind: SourceKind; stale?: boolean }

interface Threat {
  id: string; name: string;
  category: ThreatCategory;             // tariff | embargo | export_ban | war | instability | chokepoint | import_dependence | drought | heat | flood | storm | wildfire | pest | disease
  kind: 'geopolitical' | 'natural';
  location: { lat: number; lng: number; admin?: string; iso3?: string; geometry?: GeoJSON };
  commodities: { id: string; relevance: number }[];   // relevance 0..1 from region gazetteer
  severity: number;                      // 0..1, category-specific semantics (threat-types.json)
  physical?: PhysicalShock;              // when the feed gives units (birds affected, transit drop %, area)
  start: string; end?: string;
  source: SourceStamp;
  gated?: { county?: string; premises?: number; daily?: unknown };   // stripped unless vetted
}

interface Shock {
  commodity: string; region: string;
  supplyPath: number[];                  // monthly fraction of baseline supply lost (>=0)
  costPath?: number[];                   // monthly fractional cost increase (input shocks, tariffs)
  start: string; months: number;
  passThrough: number; lagMonths: number;
  provenance: SourceStamp[];
}

interface ImpactResult {
  months: string[];
  price: { wholesalePct: number[]; retailPct: number[]; path: 'modeled' | 'observed' };
  quantity: { pct: number[] };
  shortfall: { units: number[]; unit: string };
  welfare: {
    cv: number;                          // headline, USD, multi-good Hicksian CV (second order)
    csReplica: number;                   // single-good constant-elasticity CS
    band: { low: number; high: number; over: 'elasticity' };
    byCommodity: Record<string, number>;
    substitution: { commodity: string; quantityPct: number; significant: boolean }[];
    incidence: { quintile: number; lossPerHousehold: number }[];
    producerRevenueChange: number;
  };
  durationMonths: number;
  assumptions: Assumption[];             // {key, value, unit, source, kind: 'measured'|'modeled'}
  checks: { slutskySymmetryAdjustment: number; negativeSemidefinite: boolean };
}

interface MitigationPlan {
  gap: { units: number[]; unit: string };
  levers: LeverResult[];                 // {id, type, unitsPath, cumulative, share, cost, leadMonths, precedent, unlocks?}
  coverage: number[];                    // fraction of monthly gap closed
  totalCost: number; timeToCloseMonths: number | null;
  ranking: { id: string; share: number; classification: 'does the work' | 'marginal' }[];
}
```

Threat → Shock: `shock.ts` applies the rule named in `threat-types.json` using the threat's
physical fields when present, else severity × the commodity's exposure in that region.
Shock → ImpactResult: `biology.ts` + `price.ts` + `welfare.ts`.
ImpactResult → MitigationPlan: `mitigation.ts` takes `shortfall.units` and the commodity's
lever set. Each stage is a pure function and is tested alone.

## 4. Engine

### 4.1 Threat → shock rules (config)

| Category | Rule | Physical inputs | Duration |
|---|---|---|---|
| disease (livestock) | animals affected ÷ national inventory → inventory loss; recovery after species lag | APHIS birds/animals affected | lag (eggs 6 mo default; broilers 2; turkeys 4; swine/cattle from config) |
| pest / crop disease | expected yield loss × affected share of national area | model risk level, region share | to next harvest |
| drought / heat / flood / storm / wildfire | hazard severity (alert level) × damage function × region's share of national supply | GDACS alert, USDM class, FIRMS density, Open-Meteo heat | crop: to next harvest; livestock: 1–3 mo |
| export ban / embargo | US import share from origin × (1 − rerouting share) | GTA/IFPRI intervention, origin, product | policy length |
| tariff | rate × import share → cost path | GTA | policy length |
| war / instability | region's share of world exports × US import share × transmission | ACLED intensity, region | 6 mo default |
| chokepoint | transit decline × share of US imports of commodity through it → delay shortfall + freight cost | PortWatch daily transit vs 2019–23 baseline | while depressed |
| import dependence | vulnerability multiplier only (no shock by itself) | FAOSTAT/Comtrade structural | n/a |
| input shock (fertilizer, feed, energy) | cost share × Δinput price → supply shift via supply elasticity (medium run) | EIA, FRED, chained threats | to next season |

Severity slider in the Simulator scales the physical quantity; dialing to zero yields zero loss.

### 4.2 Biology and seasonality (`biology.ts`)

* Livestock inventory model: I(t) = I₀ − Σₖ Lₖ·[tₖ ≤ t < tₖ + lag]; production Q(t) = I(t)·yield rate.
  Eggs: rate of lay from NASS (about 0.8 eggs/hen/day), shortfall in dozens.
* Crop season model: a single-season yield loss produces a shortfall spread over the marketing
  year until the next harvest, net of stocks drawdown (stocks-to-use from WASDE/PSD).
* Manufacturing model (formula, processed goods): capacity out × share → immediate shortfall,
  recovering at restart.
* Validation: 2022 egg path reproduces quarterly shortfalls of about 5.7 / 4.7 / 6.5% (Ferrier).

### 4.3 Price stage (`price.ts`)

Per month with s = shortfall/baseline, demand elasticity ε (<0), export share x, export demand
elasticity εₓ, import response m(π) from the mitigation plan when applied:
solve ε·π = −s + x·(−εₓ)·π/… (closed form for the linear case) → wholesale π_w.
Retail π_r(t) = θ·π_w(t − L). Defaults θ 0.7, L 1 for eggs; per commodity in config.
Observed path (replays only): FRED series minus counterfactual (pre-shock trend or WASDE
forecast) × attribution share (default to published econometric estimate; user adjustable).

### 4.4 Welfare (`welfare.ts`, derivation in `docs/economics/methodology.md`)

* Demand system: ERR-139 two-stage elasticities (first stage across food groups and nonfood;
  second stage within cereals/bakery, meat and eggs, dairy, fruits and vegetables) assembled into
  an unconditional Marshallian matrix, converted to Hicksian via Slutsky, symmetrized (adjustment
  reported), negative semidefiniteness checked. Budget shares from CEX 2024; population from FRED.
* Headline: CV ≈ M·[Σᵢ wᵢπᵢ + ½ ΣᵢΣⱼ wᵢ εᶜᵢⱼ πᵢπⱼ], summed over months, all commodities whose
  price moves. Reports EV as well (evaluated at new utility) and the Willig bound.
* Replica: single-good constant-elasticity CS, ΔCS = p⁰x⁰[(1+π)^(1+ε) − 1]/(1+ε).
* Band: recompute at low and high ends of the commodity's elasticity range.
* Substitution: Δqⱼ = εⱼᵢπᵢ for every j, with the significance flag from the source table.
* Incidence: loss per household by income quintile from CEX shares by income.
* Producer revenue change: (1+π)(1−s) − 1 on baseline revenue (labeled modeled).
* Tests: Fryar $1.41B within 2%; single vs multi-good within 0.5%; order independence for
  combined shocks; symmetric matrix; NSD.

### 4.5 Mitigation (`mitigation.ts`)

Levers (from `levers.json`, per commodity): import unlock (regulatory relaxation, unlocks
import capacity), imports (capacity/month, lead, freight cost), stockpile or cold-storage
release (stock level from NASS Cold Storage or config, lead days), domestic ramp (bounded by
biology: pullet supply, restart), redirect (breaker/hatching-egg reallocation), demand-side
(purchase limits: reduces gap by rationing share; labeled as rationing not supply).
Allocation: monthly greedy by cost per unit delivered subject to lead time, ramp, capacity, and
unlock dependencies. Outputs coverage curve, per-lever cumulative share, cost, time to close.
Classification: a lever "does the work" if it closes ≥ 25% of cumulative gap; else marginal.
Test: formula case ranks enforcement discretion above airlift; egg case shows repopulation
dominant and every other lever marginal.

### 4.6 Scenarios (`scenario.ts`)

Scenario = named set of threats (with per-threat severity overrides) + assumption overrides.
Combine: union; conflict = same commodity and overlapping region and time; user picks which
version to keep per conflict; welfare recomputed jointly. Compare: total and per-commodity CV,
worst-hit commodity, mitigation cost, time to recover, incidence by quintile.
Persistence: localStorage plus JSON export/import. Live threats can be forked into a scenario.

## 5. Data and feeds

| Source | Use | Access | Status in v1 |
|---|---|---|---|
| GDACS API | floods, storms, drought, wildfire alerts (global) | none | live |
| IMF PortWatch | 28 chokepoints daily transit; port disruptions | none | live |
| FRED CSV | retail prices (eggs, milk, bread, chicken, beef, rice, coffee, sugar…), population, CEX | none | live |
| US Drought Monitor | US drought by class | none | live |
| Open-Meteo | heat anomalies over production regions | none | live |
| APHIS Tableau export | HPAI detections summary (month, state) | none | live (public aggregate) |
| APHIS per-detection archive (DataLumos) | 2022–2025 detections for replay and vetted view | none | archive |
| NASA FIRMS | wildfire hotspots | free key | live when key set |
| NASS QuickStats | layer inventory, production, cold storage | free key | live when key set |
| EIA | diesel, natural gas (fertilizer input) | free key | live when key set |
| AMS MyMarketNews | wholesale egg/meat prices | free key | live when key set |
| Global Trade Alert | tariffs, export bans | free key | live when key set |
| ACLED | conflict events | account + enablement | live when enabled |
| IFPRI export restrictions | food export bans | none (manual) | snapshot |
| FAOSTAT / FAS PSD / Comtrade | import dependence, world shares | none / key | structural, precomputed |
| WASDE | stocks-to-use, forecasts | none (PDF/CSV) | snapshot |
| ERS ERR-139, CEX | elasticities, budget shares | none | structural |
| Earth Engine, SMAP, WAHIS, EMPRES-i | remote sensing, global animal disease | needs GCP / no API | not ingested; shown as labeled gap |

Every adapter: TTL cache, committed snapshot fallback with staleness badge, `/api/health`
entry, and a `SURGE_FORCE_OUTAGE=<feed>` switch for demos. Numbers carry source stamps to the UI.

## 6. UI

* Layout: top bar (SURGE, Live | Simulator, scenario tabs, feed status, theme); left watchlist
  (collapsible, ranked by CV loss, filters by commodity group and category, row select = map
  select + open detail); center map (MapLibre, OpenFreeMap vector tiles, light and dark styles,
  markers sized by loss and colored by category, clustering at low zoom, production-region
  outlines on hover, chokepoint flow lines only); right drawer with Impact | Plate | Relief.
* Impact: price and quantity sparklines with counterfactual, headline CV with band, replica
  beside it, substitution list with significance, incidence by quintile, duration; assumptions
  panel with sliders (elasticity with literature marks, recovery lag, pass-through, attribution
  share, price path toggle). Every number has a measured/modeled chip and a source tooltip.
* Plate: SVG graph inputs → farm → processing → plate items; affected edges glow with shock
  intensity; all commodities on the plate, not only the selected one.
* Relief: lever table (capacity, lead, cost, precedent), coverage chart, ranking with
  "does the work" / "marginal" labels.
* Simulator: click map to drop threat (category, commodity, severity, duration); severity
  dial; save; combine dialog with conflict resolution; compare table.
* Vetted access: settings → key → county/premises/daily fields and "facility" layer appear.
  Public default aggregates disease to state-week. No "deliberate vs natural" analysis in v1.
* Briefs: button generates a plain-language brief from the ImpactResult and MitigationPlan via
  Claude on the server; a guard rejects any brief containing a number absent from the inputs
  and falls back to a template.
* Aesthetic: dense commodity-intelligence terminal; map and plate carry the boldness; tabular
  numerals; restrained palette; light and dark.

## 7. Deployment and operations

Single Docker image (node:24-alpine): builds web, serves static and API from the server.
Target Render free web service (Fly.io as alternative). Env: feed keys, `ANTHROPIC_API_KEY`,
`SURGE_VETTED_KEY`. Snapshots baked into the image; in-process refresh on TTL. No database.

## 8. Testing

* Engine: vitest unit tests for every stage plus the calibration and invariant suite in 4.4–4.5.
* Config: schema validation (every commodity has the required fields and a cited source).
* Server: adapter tests against recorded fixtures; outage fallback test; gate redaction test.
* Web: component tests for watchlist ranking and assumptions recompute; one end-to-end smoke
  (Playwright) that runs the egg replay from map click to relief.

## 9. Build order

1. Engine + config + tests + calibration (nothing else until green).
2. Server feeds + snapshots + health + gate.
3. Web shell: map, watchlist, Live view from feeds.
4. Threat detail: Impact, Plate, Relief; egg replay and formula case end to end.
5. Simulator: drop, dial, save, combine, compare.
6. Briefs, theming polish, outage demo, deploy to public URL.
7. DECISIONS.md, methodology doc, README with key setup and demo script.

## 10. Decisions taken here (also recorded in DECISIONS.md)

Monthly time step. Commodity set v1: eggs, chicken, turkey, beef, pork, fish, milk, cheese,
other dairy, wheat/bread, rice, corn, soybeans/soy oil, vegetable oils, sugar, potatoes, fresh
vegetables, fresh fruit (apples, bananas, citrus, other), nuts, coffee, cocoa, orange juice,
infant formula; inputs: fertilizer, feed grains, energy. Default elasticity source ERR-139 with
Andreyeva ranges for bands. Default recovery lag for layers 6 months. Public aggregation
state-week. Scenarios in browser storage, no accounts.
