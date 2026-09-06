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
