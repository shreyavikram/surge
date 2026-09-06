# Plan 5: overnight pass on the team's notes (2026-09-06)

Source: "Surge 1 Notes" PDF. Order: data integrity → branding → interface list → price-anomaly tracing → audit → performance → red team.
Progress is tracked here with [x]; every task commits, pushes, and deploys.

## A. Data integrity
- [x] A1 News classification through Gemini (event? type, place, commodities, one-line description) with the deterministic validator; rule-based fallback only. Kills "vigil"/"tree"/"donations" items and gives popups a real description.
- [x] A2 Interpreter: "invades", "cuts off exports", region-only scenarios (Russia/Ukraine) produce shocks.
- [x] A3 Split grouped regions: india / thailand / pakistan; ukraine / russia; guatemala / ecuador / honduras / costa-rica / colombia; vietnam / indonesia. Thailand no longer colors with India.
- [ ] A4 Price charts: explicit month ticks, a "now" marker, "shock ends" label; description of why prices return to normal.
- [ ] A5 Docs: DATA-AUDIT.md (mechanism, confidence, improvements per process).

## B. Branding
- [x] B1 Rename to Greenfield; temporary logo mark; spinning logo while the map loads; green accent palette; active tab green.

## C. Interface notes
- [ ] C1 Popups: brief description instead of headline list; no "nothing is reported"; no "darker green means"; show import share for yellow/red too; commodity-specific wording under a commodity filter.
- [ ] C2 English place names on the basemap (raster labels are English already; SVG has none).
- [ ] C3 Scenario tabs: instant close, naming, active tab green, Compare button styled and moved next to tabs, no relief cost in compare.
- [ ] C4 Scenario left panel: only that scenario's added threats, with the live threats in a collapsed group; hypothetical threats persist; view resets between tabs.
- [ ] C5 Don't zoom to a state on focus select.
- [ ] C6 Search box above the threat list; commodity filter grouped (fruits, vegetables, grains, meat, dairy, inputs); "Kind" renamed "Threat type".
- [ ] C7 Commodity filter recolors the map for that commodity (grey where the country doesn't supply it); list matching threats first, others collapsed.
- [ ] C8 Shades mean import share only (green/yellow/red intensity = share of US imports of the selected commodity or all food); state focus keeps green shading of suppliers.
- [ ] C9 Duration as an editable number (no cap); severity dial on green countries too (any supplier can be dialed).
- [ ] C10 Remove-from-scenario as a red button; "significant" labels replaced by grey "not significant" over the number.
- [ ] C11 Alerts as a floating button bottom-right.
- [ ] C12 Dotted outline only around the region the prompt names; interpreter proposes the full export list for the place.
- [ ] C13 Wyoming and the Dakotas district data.
- [ ] C14 Zoomable distribution map.
- [ ] C15 "Subheading" clarity: rename unclear section headers.

## D. Price-anomaly tracing
- [ ] D1 Category price anomalies from FRED (APU series vs trailing trend), Census International Trade API imports by origin for the mapped HS codes, origin declines → "import decline" threats with plain descriptions.

## E. Performance
- [ ] E1 Memoize engine runs per threat; compute mitigation lazily; debounce dials; memoize district producer maps.

## F. Red team
- [ ] F1 Review agent over engine, server, web for correctness; fix findings.
