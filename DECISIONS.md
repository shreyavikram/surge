# DECISIONS

Notable design and modeling decisions, with the reason. Newest at the bottom.

1. **TypeScript monorepo, engine runs in the browser.** The Simulator must recompute instantly when a
   severity slider moves, a two-person team benefits from one language, and the server exists only to
   hold credentials, cache feeds, and enforce the vetted gate. Python would split the codebase.
2. **Zero-dependency engine.** The welfare, price, and mitigation math must be inspectable and
   deterministic; a 60×60 Jacobi eigenvalue routine is 40 lines and needs no library.
3. **ERS ERR-139 as the demand system.** The team chose ERS; ERR-139 is the only ERS source with a full
   43×43 unconditional elasticity matrix with standard errors. Andreyeva et al. (2010) ranges bound the
   sensitivity band. The matrix is extracted by script from the report text and committed.
4. **Second-order Hicksian CV as headline, single-good CS as replica.** CV is path-independent across
   multiple price changes (needed for combined scenarios) and captures substitution; the replica is what
   the published calibrations computed and lets the reader see the two agree.
5. **Precision-weighted Slutsky symmetrization; nonfood left as published.** See methodology §3. Nonfood's
   price never moves in any SURGE shock, so its cross terms never enter CV.
6. **Observed vs modeled price path is an exposed assumption.** The published literature disagrees by 3x
   on how much of the 2022 egg price rise HPAI caused. SURGE shows both and labels which is in use.
7. **Recovery lag as a uniform 5–12 month ramp with a 0.35 producer offset.** Calibrated to Ferrier's
   quarterly shortfalls; a single 6-month step fits Q3 but not Q4, a 9-month step the reverse.
8. **Replays are valued at their own counterfactual price.** The 2022 shock priced at 2024's $2.73
   overstated the loss by 40%; the case file carries the FRED counterfactual and the engine uses it.
9. **Retail commodities versus upstream inputs.** Consumers face retail categories; farm inputs (corn,
   soybeans, wheat, fertilizer, energy, farm milk) reach them through ERR-57 cost shares. A wheat drought
   raises bread prices through cost, it does not remove bread from shelves.
10. **Modeled constants.** Rerouting share 0.3 for blocked imports, world-price transmission 0.5, freight
    wedge 0.05 at full chokepoint closure, one month of rerouting delay, facility offline for 75% of its
    duration. All are surfaced as assumptions and should be revisited with data.
11. **Crop seasonal timing simplified.** Losses begin at the shock month and run one marketing year; the
    harvest calendar is not yet used. Recorded so the economist can decide whether it matters.
12. **Infant formula elasticity assumed −0.3 with zero cross terms.** No ERS estimate exists; labeled modeled.
13. **Mitigation levers are additional to baseline recovery.** The Sturgis restart is not a lever because
    the facility shortfall path already returns to zero; counting it double-credited domestic ramp.
14. **Lever active windows.** Precedents were time-limited (FDA discretion May–Nov 2022; USDA egg import
    commitments Jan–Jun 2025), so levers carry an `activeMonths` window that dependents inherit.
15. **Classification thresholds** 25% and 10% of cumulative gap are conventions, not estimates, and are
    exported as constants.
16. **Monthly time step; public aggregation state-week; scenarios in browser storage.** Hackathon scope.

## 2026-09-06: after the team critique

17. **Severity is a fraction of the affected channel.** 100% on an import threat means imports from that source cease; on a domestic threat the region loses its whole output; on a tariff it is the ad valorem rate. Feeds convert alert levels at ingestion (damageAtSeverity1). Reason: the team wanted one legible dial; the engine no longer mixes alert scores with physical counts.
18. **Producer revenue is the focus area's own producers.** Domestic losses land on producers in the shocked region in proportion to production share; everyone else gains from the price. Import blocks leave US producers with a pure price gain. Reason: "everything US-, state-, or district-centered."
19. **Districts come from county census data, not population weights.** NASS 2022 Census of Agriculture county series → Census county→CD119 crosswalk by land-area share. Withheld (D) cells are zero. Reason: crops differ by district.
20. **The map is a heatmap only.** Countries, states, and chokepoint straits are shaded stable/anticipated/unstable with intensity rules stated in the legend; no dot mode. With a focus, only areas that matter to it are colored.
21. **An LLM may propose, never decide.** Gemini proposes threat candidates from a fixed vocabulary inside a data block; `validateCandidate` is the last word; the rule-based interpreter always runs.
22. **Hazards in foreign supplier regions cut US imports** (import share × origin share), so a Mexican drought reaches US tomatoes without a new rule.
23. **Red-team review fixes (2026-09-06, overnight).** A read-only review agent found thirteen logic and unit errors the tests did not catch; each is now pinned by `packages/engine/test/review-fixes.test.ts` and `apps/server/test/review-fixes.test.ts`. (a) The retail lag pushed the last months of a shock past the axis, so a one-month shock on a lagged commodity cost nothing: the axis now extends by the lag. (b) Crop losses scaled with the duration dial; they now run one marketing year whatever the dial says. (c) Weather cannot destroy manufactured or wholly imported goods at home (bread, cheese, formula, bananas, coffee): domestic hazards skip them; foreign hazards still cut imports. (d) Livestock disease in a foreign supplier region now cuts US imports (import share × origin share), matching item 22. (e) The world-price rule clears the lost share of world exports on the world market with an excess-demand elasticity of 0.35 (2022 wheat: about 14% of trade at risk, +40%), and the US price follows the world price fully once the US trades a quarter of its use either way; the earlier 0.5 transmission gave Ukraine wheat +2%. (f) Producer revenue is valued at the farm/wholesale share of the retail price (ERS price spreads; bread 6%, eggs 55%), not the retail price. (g) A relief lever whose requirement is switched off is unavailable. (h) Chicken and turkey inventories are standing flocks (1.24B, 65M head), not annual slaughter, so APHIS bird counts give the right severity. (i) Fluid milk exports carry an export elasticity of −2 instead of 0, which had made a 5% shortfall a 61% price rise. (j) Coffee carries a stocks-to-use of 0.23 so a one-month Suez delay is buffered by pipeline stocks. (k) The gazetteer places foreign points by country code, never by a neighbour's bounding box, and keeps input-cost and facility items that name their region. (l) EIA severity inverts the engine's clearing rule including the export term. (m) FIRMS counts hotspots once per state; GTA ignores foreign tariffs and import bans on US goods, which lower US prices rather than cut supply; the feed registry keeps the last successful fetch when a refresh fails instead of falling back to the older committed snapshot. Also: the plains-wheat region's bounding box now covers its states (Washington moved to the Pacific Northwest), and the vegetable-oil world export shares are shares of all vegetable-oil trade (Indonesia 0.30, Ukraine 0.05).

24. **The marketing site is a separate, framework-free static app that cannot lie about the model.**
    `apps/site` is plain HTML/CSS/JS deployed as its own Render service, so the terminal's live URL
    is untouched by it. Its aesthetic comes from the DN Hacks deck (paper ground, two-tone serif
    headline, Courier-lineage labels) and its structure from commodity-intelligence solution pages
    (hero, hard stat bar, itemized coverage taxonomy, alternating product blocks, method, business
    case). Both maps are generated from the terminal's own geodata and cited sources — the world map
    coloured by each country's share of US food imports (Census customs value), the district map by
    each district's share of national production (NASS 2022 Census of Agriculture) — rather than
    drawn for effect. `apps/site/test/claims.test.ts` asserts every count on the page against the
    config file it came from, so a marketing number cannot drift from the model it describes.
