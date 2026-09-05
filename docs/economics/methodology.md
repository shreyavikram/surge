# SURGE methodology (engine derivations)

Every formula here is implemented in `packages/engine/src` and tested in `packages/engine/test`.
Sources and parameter choices: `docs/economics/literature-review.md`. Notation: monthly time step t;
π = proportional price change; s = shortfall as a fraction of baseline supply; ε < 0 demand elasticity.

## 1. Physical shortfall (`biology.ts`)

**Livestock.** Inventory in production I(t) = I₀ − Σₖ Lₖ·(1 − r(t − tₖ)), where Lₖ head are lost in
month tₖ and r(k) is the share of a lost cohort back in production k months later:
r(k) = 0 for k < lagMin; (k − lagMin + 1)/(lagMax − lagMin + 1) for lagMin ≤ k ≤ lagMax; 1 after.
The uniform ramp reflects that houses restock at different times (mandated downtime of 9–13 weeks,
pullets reaching lay at 17–20 weeks, and industry reports of "a year or more" for some premises).
Shortfall s(t) = (1 − ω)·(I₀ − I(t))/I₀, with ω the producer offset for delayed culling, delayed
molting, and higher lay rates that partially replace lost output. Layer defaults: lagMin 5,
lagMax 12, ω 0.35. Validation: the 2022 depopulation timeline reproduces Ferrier, Saavoss,
Williamson (2024) Table 4 quarterly shortfalls (5.7 / 4.7 / 6.5%) within 2.5 points each and
the Q2–Q4 mean within 1 point.

**Crops.** A yield loss δ on a region holding share σ of national supply gives
s = δ·σ·(1 − min(0.5, stocks-to-use)) from the shock month for one marketing year. Seasonal timing
relative to the harvest calendar is a documented simplification (DECISIONS.md).

**Manufacturing.** s = capacity-out fraction for the outage months, then a linear ramp back.

## 2. Price stage (`price.ts`)

Short-run supply is fixed by biology. Domestic consumers respond to retail prices, foreign buyers
to wholesale. With export share x, domestic elasticity ε, export demand elasticity εₓ ≤ 0, and
retail pass-through θ (π_r = θ·π_w), market clearing in log changes is

  (1 − x)·ε·π_r + x·εₓ·π_w = −s  ⇒  π_r = −s / ((1 − x)·ε + x·εₓ/θ),  π_w = π_r/θ.

Cost wedges c(t) from tariffs, input prices, or freight add to π_w. Retail lags wholesale by L
months. Quantity: Δq/q = ε·π_r. Check: a 5.7% shortfall at ε = −0.27 with no trade buffer gives
π_r = 21%, against Ferrier's EDM 22.5–25.6%.

Replays may instead use the observed FRED series: π_r(t) = a·(P_obs(t)/P_cf(t) − 1), where the
counterfactual P_cf is the pre-shock level or a forecast and a is the share of the deviation
attributed to the threat. The literature disagrees on a by a factor of three for 2022 (Mitchell et
al. 7–9% average effect; Ferrier et al. 22–24% in peak quarters), so a is exposed as an assumption.
A replay values the shock at its own counterfactual price, never at the config year's price.

**Inputs.** Farm and upstream inputs (corn, soybeans, wheat, fertilizer, energy, farm milk) clear
with θ = 1 and their price change reaches each retail commodity as a cost wedge equal to the
input's cost share of that commodity's unit revenue (ERR-57 revenue shares).

## 3. Welfare (`welfare.ts`, `demand-system.ts`, `impact.ts`)

Compensating variation is the change in the expenditure function at initial utility,
CV = e(p¹, u⁰) − e(p⁰, u⁰). By Shephard's lemma ∂e/∂pᵢ = hᵢ (Hicksian demand) and the
second derivatives form the Slutsky matrix, so the second-order Taylor expansion is

  CV ≈ Σᵢ Xᵢ πᵢ + ½ Σᵢ Σⱼ Xᵢ ε^cᵢⱼ πᵢ πⱼ,

with Xᵢ = pᵢ hᵢ baseline expenditure and ε^cᵢⱼ the compensated elasticity. Slutsky converts the
published Marshallian matrix: ε^cᵢⱼ = εᵢⱼ + wⱼ ηᵢ, with wⱼ the budget share and ηᵢ the
expenditure elasticity.

**Symmetry.** Theory requires Sᵢⱼ = wᵢ ε^cᵢⱼ = Sⱼᵢ. The two published estimates of each term are
combined by inverse-variance weighting with var(Sᵢⱼ) = (wᵢ·SEᵢⱼ)², so the estimate from the
smaller-share good's own equation dominates. Naive averaging rescales the large good's noise by
wⱼ/wᵢ, about 5,000 for nonfood against frozen beverages, and produced adjustments of 24 in
elasticity units. Nonfood is the numeraire: its price never moves in a SURGE shock, so its cross
terms never enter CV, and its row and column are left as published. The largest adjustment among
food pairs is reported in `checks.slutskySymmetryAdjustment`.

**Curvature.** Negative semidefiniteness of S is checked with Jacobi eigenvalues and reported in
`checks.negativeSemidefinite`. The published ERR-139 matrix does not satisfy it (largest eigenvalue
about 0.03); this is typical of unconstrained estimates and is shown, not hidden.

**EV and bounds.** EV ≈ CV − (Σᵢ Xᵢ ηᵢ πᵢ)(Σₖ Xₖ πₖ)/M, the Willig (1976) income correction.
At egg budget shares (0.14% of spending) CV, EV, and Marshallian surplus coincide to well under 1%.

**Single-good replica.** With q = q₀(p/p₀)^ε, ΔCS = X₀[(1 + π)^(1+ε) − 1]/(1 + ε), the "exact
method" of Mitchell, Thompson, Malone (2025) and Ferrier et al. (2024). Reported beside CV.

**Items and commodities.** ERR-139's 43 items plus infant formula form the demand system.
Commodities map to items; where several share one item (chicken and turkey → poultry) the item's π
is the expenditure-weighted mean of theirs and the item's welfare is split back in proportion to
each commodity's Xᵢπᵢ. Monthly π vectors are summed over the horizon.

**Substitution.** Δqⱼ/qⱼ = Σᵢ εⱼᵢ πᵢ (Marshallian, at the peak month), flagged significant when
|εⱼᵢ| ≥ 1.645·SEⱼᵢ. For eggs the cross terms are small and mostly complementary, and the product
says so.

**Incidence.** Per-household loss by income quintile = spendₖ·π̄·(1 + ½ε^cπ̄) over the months prices
moved, with spendₖ from CEX by quintile where available.

## 4. Calibration and validation

* Fryar Center FC-2025-001 inputs (p⁰ $2.73, 202 eggs per person, ε −0.228, π 9%, population
  340.1M) reproduce the published $1,414.28M within 2% by both the replica and CV; the residual is
  the report's unstated population base.
* Ferrier et al. (2024): quarterly 2022 shortfalls within 2.5 points; price stage within their range.
* Multi-good CV equals the single-good replica within 0.5% when only eggs move.
* Combined-scenario CV is independent of shock order.
* 2022 replay on the observed path with attribution 0.5 lands between Mitchell's $0.93–1.2B and
  Ferrier's $3.6–4.1B.

## 5. Mitigation (`mitigation.ts`)

Gap g(t) in physical units after baseline recovery (biology already embedded). Demand-side levers
remove ρ·g(t) and are reported as rationing, never supply. Supply levers become available at their
effective lead (the maximum over their unlock chain), for their active window (bounded by the
requirement's window), ramp linearly, are capped by stock, and are allocated cheapest-first by
unit cost. Regulatory levers with a `stock` cap the cumulative units of everything that requires
them and are credited with what they enable. Each lever reports its share of the cumulative gap
(how much of the problem it solved) and of delivered relief (how much of the response it was).
Classification on gap share: ≥ 25% "does the work", ≥ 10% "contributes", else "marginal".
The uncovered share is borne by consumers through price and stock-outs.

## 6. Scenarios (`scenario.ts`)

Shocks are unioned onto one monthly axis; the π vector is joint, so CV is computed once per month
over all moved goods and is path-independent. Two threats on the same commodity and region with
overlapping months conflict and the user chooses a version. Compare reports total and per-commodity
CV, worst commodity, mitigation cost, time to recover, and incidence by quintile.
