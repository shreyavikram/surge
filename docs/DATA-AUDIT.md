# Data audit — every data process in Greenfield, its mechanism, confidence, and how to improve it

Written 2026-09-06 (overnight pass) in answer to the team note: *"do a thorough audit of all the data-related processes in this tool and record the mechanism, your level of confidence in that mechanism, and ways to improve it."*

Confidence is rated on one scale:

| Rating | Meaning |
|---|---|
| **High** | Official data, exact mechanism, pinned by a test against a published number |
| **Medium** | Official data or a published method, with a modelling step or an approximation between the data and the map |
| **Low** | A heuristic, a hand-typed number, or a source that can misfire; use for direction, not magnitude |

Every number the app shows is labelled *measured* (from data) or *modeled* (from a rule) in the Assumptions dropdown of the Impact drawer. This document is the long form of those labels.

---

## Part A. Live feeds (what puts colour on the map)

### A1. Google News RSS → Gemini classification → threats (yellow "anticipated")

**Mechanism.** `apps/server/src/feeds/news.ts` polls Google News RSS for ~30 fixed queries (`when:3d`) covering diseases, weather, trade actions and named suppliers. Headlines and descriptions go to Gemini (`gemini-3.6-flash`) in batches of 40 with a fixed vocabulary of categories, regions and commodities (`ai/news-llm.ts`). Gemini may only *propose*; every candidate is re-validated by the deterministic `validateCandidate`, a relief-action guard (donations, vigils, aid, reopenings are rejected), a place guard, and a confidence floor of 0.7. Without a Gemini key the rule-based interpreter runs instead, and only keeps headlines with an explicit category *and* an explicit place. Status is always `breaking` (yellow); severity is the category default unless a loss percentage sits next to loss language.

**Confidence: Low-to-Medium.** The classifier now produces sensible descriptions and rejects non-events, but a headline is still a headline: the direction is usually right, the magnitude is a default. The 2026-09-06 review found and fixed substring matching in the rule path ("Warm winter" → war, "prices" → rice, "Indiana" → India) and percent-as-severity ("prices up 60%" became 60% of the flock).

**Improvements.** (1) Add a second vote: a headline becomes a threat only when two independent outlets report it within 72 h. (2) Feed Gemini the article body (via the RSS link) rather than the headline. (3) Keep a labelled set of 200 headlines and measure precision/recall on every prompt change. (4) Replace Google News (non-commercial terms) with GDELT once a dedicated IP or key removes the rate limits.

### A2. APHIS HPAI detections (red "unstable", eggs / chicken / turkey)

**Mechanism.** `feeds/aphis-archive.ts` reads the per-detection CSV exported by hand from the APHIS dashboard (*X - Table by Confirmation Date*). Detections are summed by month and commodity; birds affected ÷ the standing national flock = severity, shaped over months by the detection timeline; the livestock rule then applies the recovery ramp (5–12 months for layers). County rows are gated (public build shows state-week aggregates).

**Confidence: High for the counts, Medium for the shape.** The 2022 replay reproduces Ferrier, Saavoss & Williamson's quarterly shortfalls within 2.5 points and Fryar's 2024 consumer loss within 2%. The review corrected chicken and turkey inventories from annual slaughter to standing flocks (1.24 B and 65 M head), which had understated broiler and turkey severities 7× and 3×.

**Improvements.** (1) Automate the export (the APHIS dashboard has no API; a headless download of the Tableau CSV is feasible). (2) Use NASS layer inventory by state for the region share instead of the fixed production shares. (3) Model repopulation from APHIS restocking dates rather than a uniform ramp.

### A3. US Drought Monitor (yellow/red by state)

**Mechanism.** `feeds/usdm.ts` pulls the weekly state statistics for 38 agricultural states. A state enters when ≥ 20% of its area is in D2 or worse. Alert score = (0.4·D2-only + 0.7·D3-only + 1.0·D4) share of area; ingestion multiplies by the drought damage cap (35% yield loss at score 1, from the 2012 corn analogue). Each state is its own production region, so losses land on that state's crops in proportion to its county-built production shares.

**Confidence: Medium.** The data are official and weekly. The mapping from area share to yield loss is a single linear cap; real losses depend on crop stage and irrigation (California's irrigated valleys lose far less than dryland Kansas at the same D-level).

**Improvements.** (1) Weight by crop calendar (a July D3 hurts corn, a January D3 mostly does not). (2) Split irrigated vs dryland acreage (NASS irrigation census). (3) Replace the cap with the USDA crop-condition regression (good/excellent share → yield).

### A4. GDACS (floods, storms, wildfires, worldwide)

**Mechanism.** `feeds/gdacs.ts` reads the GDACS RSS/GeoJSON; alert level → score (Green 0.2, Orange 0.5, Red 1.0); ingestion applies the category cap (flood 25%, storm 20%, wildfire 10%). The point is placed by **country code** into the supplier region covering that country (the review removed the bounding-box lookup that handed Bolivian fires to Brazil). A foreign hazard cuts US imports by import share × origin share.

**Confidence: Low for magnitude.** A single GDACS point is scaled to the whole country's output: an Orange storm in Yucatán currently reads as 10% of all Mexican tomatoes. Direction and place are right.

**Improvements.** (1) Scale by the event's affected area relative to the country's cropland (GDACS gives affected population and polygon; NASA cropland rasters give the denominator). (2) Use the region's crop calendar. (3) Require an Orange or Red alert for a supply shock; Green becomes information only.

### A5. NASA FIRMS hotspots (wildfire, US states)

**Mechanism.** `feeds/firms.ts` counts VIIRS hotspots in the last 48 h inside each state's bounding box (≥ 150 to appear); score = count / 2000, cap 10%. The review fixed triple-counting across nested regions.

**Confidence: Low.** Hotspot counts include agricultural burning and prescribed fire; a bounding box is not a state.

**Improvements.** (1) Intersect with state polygons and cropland. (2) Use FIRMS fire radiative power and NIFC incident perimeters. (3) Only count hotspots on or adjacent to cropland or rangeland.

### A6. IMF PortWatch (chokepoints)

**Mechanism.** `feeds/portwatch.ts` compares 7-day transit counts through Suez/Red Sea, Hormuz, Panama and the Black Sea with the 2019–23 baseline; decline fraction = severity. The chokepoint rule gives one month of delay shortfall (import share × chokepoint share × decline, buffered by pipeline stocks) plus a freight wedge (5% of wholesale at full closure).

**Confidence: Medium for the transit decline, Low for the chokepoint import shares** (hand-typed from trade-route literature; e.g. coffee 10% via Suez).

**Improvements.** (1) Derive chokepoint shares per commodity from Census imports by origin × standard routing (origin → US coast). (2) Calibrate the freight wedge to the 2024 Red Sea episode (container rates ×3, retail effect small).

### A7. EIA (diesel and natural gas → fertilizer and energy inputs)

**Mechanism.** `feeds/eia.ts` reads weekly diesel and monthly Henry Hub series; a rise above the 12-month mean of ≥ 15% becomes an input-cost threat; severity inverts the engine's clearing rule (fixed in the review to include the export term). Costs reach commodities through ERR-57 cost shares.

**Confidence: Medium.** Official prices; the cost-share pass-through is the standard ERS input-output logic, but it ignores hedging and contract lags.

**Improvements.** (1) Add the World Bank fertilizer indices (urea, DAP, potash) as inputs instead of proxying fertilizer by natural gas. (2) Lag by the fertilizer purchase calendar (fall/spring).

### A8. Global Trade Alert (tariffs, export bans, embargoes)

**Mechanism.** `feeds/gta.ts` maps interventions announced in the last 180 days by type to categories; HS chapter → commodities; the region is the origin (US action) or the implementer (supplier export curb). Foreign tariffs and import bans on US goods are now skipped (they lower US prices). Tariff severity = the ad valorem rate parsed from the title.

**Confidence: Low.** The API is rate-limited (429) on the shared key, so the snapshot is stale; the chapter map is coarse (HS 04 = milk, cheese *and* eggs).

**Improvements.** (1) Use the GTA bulk download nightly instead of the API. (2) Map at HS-4 (`feeds/trade.ts` already carries the codes). (3) Read the tariff rate from the intervention's structured field, not the title.

### A9. US Census Bureau imports by origin (new: "import decline", yellow → red)

**Mechanism.** `feeds/trade.ts` queries the International Trade API for each commodity's HS-4/HS-6 codes (`HS_CODES`), fifteen months of general-import customs value by country. For every origin that supplied ≥ 10% of the commodity's imports a year earlier (and ≥ $5 M over the window), the last three reported months are compared with the same three months a year earlier; a fall of ≥ 20% becomes an *import decline* threat with severity = the measured fraction of that channel lost. The threat is placed on the origin's region and starts as **anticipated**. `price-stress.ts` then applies the FAO Indicator of Food Price Anomalies to the BLS retail price of the same commodity; when store prices are moderately or abnormally high for the season, the threat becomes **unstable** and the popup says the shortfall is already on shelves.

**Confidence: High for the decline itself, Medium for what it means.** Values are official and the arithmetic is exact and tested. Caveats: (1) customs value, not quantity, so price changes move the number (a 20% cheaper coffee crop looks like a 20% decline); (2) Census publishes with a ~6-week lag; (3) a decline can be benign (Brazil's egg shipments fell 100% because the 2025 emergency imports ended as the US flock recovered).

**Improvements.** (1) Use `GEN_QY1_MO` quantities for commodities with a single unit (kg) and value only where units differ. (2) Add a seasonal baseline (three-year same-month mean) instead of one year back. (3) Show the declining origin's replacement (which origins rose) in the popup: the data are already fetched.

### A10. FRED (BLS average retail prices) and the FAO price-anomaly indicator

**Mechanism.** `feeds/fred.ts` pulls BLS average prices for 17 commodities (pork was added; apples' series ended in 2017, and BLS publishes no turkey, fresh-vegetable or infant-formula average price; fats-oils uses the CPI item index for the indicator only). `engine/anomaly.ts` implements the FAO IFPA exactly as in Baquedano (2015) / SDG 2.c.1: compound quarterly and annual growth rates, standardised against the same calendar month in earlier years, combined with variance-share weights; ≥ 0.5 moderately high, ≥ 1 abnormally high. `/api/price-stress` exposes every score.

**Confidence: High.** Published method, official prices, unit-tested on synthetic seasonal series; the live scores on 2026-07 data (lettuce 0.76 moderately high, pork and cheese abnormally low) are consistent with the FAO GIEWS readings for the US.

**Improvements.** (1) Add regional BLS series (four Census regions) so price stress can be shown per state cluster. (2) Add the ERS Food Price Outlook categories to fill the gaps (fresh vegetables, other meats).

### A11. Feed registry (freshness)

**Mechanism.** Stale-while-revalidate cache per feed with TTLs from 1 h (GDACS) to 24 h (FRED, Census); on a failed refresh the last successful fetch is served (fixed in the review; previously the older committed snapshot was), then the snapshot; a failed feed is retried after 5 minutes. `/api/health` shows each feed's status and age.

**Confidence: High.** Tested.

---

## Part B. Reference data (what the engine multiplies by)

### B1. Import-origin shares per country (now measured)

**Mechanism.** `packages/config/tools/build-origin-shares.py` pulls twelve months of Census imports by country for every commodity's HS codes and writes `data/origin-shares.json` (value shares, origins ≥ 0.5%). At load time these **replace** the hand-typed `usImportOriginShare` of every single-country region, and every country supplying ≥ 2% of some commodity's imports becomes a region of its own (54 supplier countries, geometry from Natural Earth in `data/country-geo.json`). The comparison with the old hand-typed numbers is in `packages/config/tools/origin-shares-report.md`: Mexico's tomato share was typed as 0.90 and measures 0.78; Mexico's sugar share was typed as 0.80 and measures 0.22; Brazil's coffee share was typed as 0.30 and measures 0.15 (Colombia leads at 0.21); Guatemala's banana share was typed as 0.35 and measures 0.39.

**Confidence: High** for the shares as value shares; **Medium** as quantity shares (unit values differ by origin: Italian cheese is dearer per kilo than Mexican).

**Improvements.** Quantity shares where units allow; refresh monthly from the same script (it takes ~2 minutes and no key beyond the free Census key).

### B2. Commodity import shares (imports ÷ consumption)

**Mechanism.** Hand-typed in `commodities.json` from ERS/FAS sources (tomatoes 0.6, coffee 0.99, bananas 1.0, eggs 0.01, beef 0.12 …).

**Confidence: Medium.** Right order of magnitude; a few are dated.

**Improvements.** Compute from Census import quantity ÷ (NASS production + imports − exports) per year in the same tool.

### B3. Demand elasticities (ERS ERR-139, Okrent & Alston 2012)

**Mechanism.** `demand-system.json` holds the unconditional Marshallian elasticity matrix for the food-at-home items plus a non-food numeraire; the engine converts to Hicksian, symmetrises with precision weights, and checks negative semi-definiteness. Own-price elasticities per commodity carry a published range that sets the uncertainty band.

**Confidence: High for the source, Medium for the mapping** of 20 retail commodities onto ERR-139 items (bread → "non-white bread", fresh vegetables → the ERR-139 vegetable aggregate). Two ERR-139 items (flour +0.07, soups +0.19) have positive own-price elasticities and the infant-formula row (assumed) breaks homogeneity by −0.25; none is ever shocked.

**Improvements.** Re-estimate with the ERS 2023 food-at-home elasticities update if the economist prefers; drop the assumed formula row for a conditional Rotterdam block.

### B4. Baselines (annual quantity, retail price, farm share)

**Mechanism.** Per-capita consumption (ERS Food Availability) × population, and the 2024 FRED average price; the farm/wholesale share of the retail price (ERS Price Spreads / Food Dollar, rounded) now values producer revenue (review fix: bread producers were credited at the retail price, 16× too much).

**Confidence: Medium.** Consumption figures are approximate for several items ("~28 lb bananas"); farm shares are rounded.

**Improvements.** Pull ERS Food Availability and Price Spreads tables directly (both are CSV downloads).

### B5. Production shares by state and district (NASS)

**Mechanism.** `tools/build-districts.py` pulls the NASS 2022 Census of Agriculture county series with the NASS key, crosswalks counties to 119th-Congress districts by land-area share (Census `tab20` file), and sums to states. 436 districts including at-large.

**Confidence: High for the crops NASS reports at county level, Medium elsewhere**: withheld (D) cells are treated as zero, and manufactured goods (bread, cheese, formula) carry the input's geography.

**Improvements.** Impute withheld cells from state totals; use the 2024 survey acreage for crops with big year-to-year swings.

### B6. Consumption shares by area (population × regional CEX index × income elasticity)

**Mechanism.** Area population (ACS, Census key) × the BLS CEX regional food-at-home index × (income ÷ US median)^0.3.

**Confidence: Medium.** Standard, coarse.

**Improvements.** Use CEX by MSA size and the ERS Food Environment Atlas county spending.

### B7. Countries' share of all US food imports (`countries.json`, map shading)

**Mechanism.** Hand-typed from USDA ERS/FAS agricultural import tables for ~40 countries.

**Confidence: Medium.** Improvement: derive from the Census pull summed over all food chapters (HS 01–24) in the same tool; one extra request per chapter.

### B8. Relief levers (`levers.json`)

**Mechanism.** Precedent-based (2022 formula: FDA discretion, Operation Fly Formula; 2025 eggs: USDA import facilitation) plus five template levers per commodity with capacity, stock, lead time and cost multiples. Dependencies are honoured (review fix).

**Confidence: Low-to-Medium.** Capacities are order-of-magnitude.

**Improvements.** Tie capacities to FAS partner export capacity and to the Census origin data (a lever "imports from X" cannot exceed X's recent shipments × a surge factor).

---

## Part C. Engine rules (how data becomes a dollar figure)

| Rule | Mechanism | Confidence | Improve by |
|---|---|---|---|
| Price clearing | π_r = −s / ((1−x)ε + xεₓ/θ), short-run supply fixed; retail lag θ, lag months from ERS price-spread studies | High (derivation in methodology §2; egg 2024 within 2%) | Commodity-specific lags from AMS wholesale vs BLS retail |
| Welfare | Second-order Hicksian CV over the ERR-139 system, non-food numeraire; single-good CS replica for the check | High | — |
| Livestock disease | severity × region share × standing inventory, uniform 5–12 month recovery ramp, producer offset 0.35 | High (Ferrier quarterly profile) | Species-specific ramps |
| Crop hazard | severity × cap × region share, one marketing year, stocks buffer ≤ ½ stocks-to-use; domestic hazards skip manufactured and wholly imported goods (review fix) | Medium | Crop calendars |
| Trade block / import decline | import share × origin share × severity × (1 − 0.3 rerouting) | Medium (rerouting share is a convention) | Estimate rerouting from the 2018–19 tariff episode |
| Tariff | cost wedge = rate × import share × origin share | Medium (assumes full pass-through) | Pass-through 0.5–0.9 from Fajgelbaum et al. 2020 |
| World price | world price rise = lost share of world exports ÷ 0.35 (world excess-demand elasticity); full transmission once the US trades ≥ 25% of use | Medium (2022 wheat: ~14% of trade at risk, +40%) | Commodity-specific trade elasticities |
| Chokepoint | one month of delay shortfall (buffered by stocks) + freight wedge 5% × decline | Low-Medium | Calibrate to 2024 Red Sea |
| Input cost | farm-gate clearing then ERR-57 cost shares | Medium | Hedging lags |
| Facility | capacity out for 75% of duration, 2-month ramp | Medium (Sturgis 2022) | — |
| Map heat | hue = status (stable / anticipated / unstable), shade = √(supply share / saturation) | High (definition, not estimate) | — |

---

## Part D. What the red-team review found (2026-09-06) and what remains

Fixed and pinned by tests (`packages/engine/test/review-fixes.test.ts`, `apps/server/test/review-fixes.test.ts`, DECISIONS.md #23): retail lag truncating short shocks; crop losses scaling with the duration dial; weather destroying bread/cheese/formula/bananas/coffee at home; foreign flocks not reaching US imports; world-price rule 20× too weak; producer revenue at retail price; lever dependencies ignored; chicken/turkey inventories as annual slaughter; milk export elasticity 0 (5% shortfall → +61%); coffee with no pipeline stocks; gazetteer by bounding box; EIA severity inverting the wrong formula; FIRMS triple counting; GTA embargo direction; registry discarding a newer cache; plains-wheat bounding box; vegetable-oil world shares; substring matching and percent-as-severity in the interpreter.

Still open (documented, not fixed):

1. **GDACS point → whole-country scaling** (A4). Needs affected-area data.
2. **Chokepoint import shares are hand-typed** (A6).
3. **Countries' all-food import shares are hand-typed** (B7); Census can replace them.
4. **Commodity import shares are hand-typed** (B2); Census + NASS can replace them.
5. **Demand-system oddities** (B3): two positive own-price elasticities and one homogeneity violation in never-shocked rows.
6. **Value vs quantity** in the Census pulls (A9, B1).
7. **Google News terms** (A1): non-commercial; GDELT is the licensed replacement once rate limits allow.
