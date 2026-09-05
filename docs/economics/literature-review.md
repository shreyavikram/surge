# SURGE economics: literature review and method basis

Status: research complete, method chosen, pending review by the team economist.
Written 2026-09-05. Every number below carries its source; nothing here is modeled.

## 1. Why this document exists

The welfare figure is SURGE's make-or-break output. The spec requires a measure that
captures substitution across commodities, validated against the published $1.4 billion
egg calibration, with the math derived explicitly and tested. This review establishes
what the literature actually did, which parameters are defensible, and where the
published numbers disagree and why. The method decision is in section 8.

## 2. Published welfare estimates for HPAI egg shocks

| Study | Episode | Method | Price effect attributed to HPAI | Consumer loss |
|---|---|---|---|---|
| Mitchell, Thompson, Malone (2024), *Food Policy* 126:102655 | 2022–23 | Econometric price model with biological lags (cumulative effect of successive depopulations); single-good consumer surplus | Retail egg prices +7.2% to +9.2% | $930M to $1.195B |
| Mitchell, Thompson, Malone (2025), Fryar Center FC-2025-001 | Calendar 2024 | Extension of the 2024 paper; single-good consumer surplus with own-price elasticity | +9% retail | $1,414.28M |
| Ferrier, Saavoss, Williamson (2024), NCCC-134 proceedings | Q2–Q4 2022 | Equilibrium displacement model (Paarlberg et al. 2008), 19 commodities, quarterly; counterfactual = Dec-2021 WASDE forecast | Retail counterfactual 22.5% (Q2), 9.5% (Q3), 23.9% (Q4) below observed (Scenario 2) | $3.562B (Q2–Q4, production plus trade); $4.066B production only |
| Innovate Animal Ag (2025) | May 2024–Apr 2025 | Expenditure difference vs. non-outbreak-year average; no elasticity; not a welfare measure | n/a | $14.5B |

Three lessons:

1. The $1.41B anchor is a **single-good Marshallian consumer surplus** for **2024**, not 2022.
   The Fryar report publishes its full input table, so it can be reproduced exactly:
   counterfactual retail price $2.73/dozen, per-capita shell-egg consumption 202 eggs,
   own-price elasticity −0.228, price change +9%, quantity change −2%.
2. Estimates for the *same* episode differ by 3x (Mitchell $0.93–1.2B vs. Ferrier $3.6–4.1B
   for 2022) because they attribute different amounts of the observed price rise to HPAI.
   Ferrier's EDM produces counterfactual prices "well above the pre-HPAI forecast range of
   $1.25 to $1.35" and the authors say their result "is likely an underestimate". Observed
   retail prices went from about $1.93 (Jan 2022) to $4.82 (Jan 2023, FRED APU0000708111).
   The **counterfactual price path is the dominant assumption**, more than the elasticity.
3. Mitchell et al. find that models ignoring biological production lags underestimate the
   consumer surplus change by a factor of 1.4 to 24.7. The lag structure is not optional.

Ferrier et al. also report that their "exact" single-market welfare formula and the Brester,
Atwood, Boland (2023) approximation differ by under 0.4% per quarter. For a single price
change the choice of formula is immaterial; it matters only when several prices move.

## 3. Demand elasticities

### Eggs, own-price (retail, United States)

| Source | Value | Notes |
|---|---|---|
| Okrent & Alston (2012), ERS ERR-139, unconditional | −0.24 (significant) | Expenditure elasticity 0.03; most inelastic of the meat-and-eggs group |
| Okrent & Alston (2012), ERR-139 Table A.4, conditional on meat-group spending | −0.26 (SE 0.06) | Meat-group expenditure elasticity 0.72 |
| Huang (1993), reported in ERR-139 Table 6 | −0.11 | Expenditure elasticity 0.29 |
| Huang (1996), used in ERS ERR-57 EDM | −0.1103 | Quarterly, wholesale-level final demand |
| ERS Commodity and Food Elasticities database | −0.1429 | Database no longer updated |
| Andreyeva, Long, Brownell (2010) meta-analysis | 0.27 mean (absolute), range 0.06–1.28, n=14 | |
| Mitchell, Thompson, Malone (2025) | −0.228 | "Estimated average demand elasticity from the literature" |
| Ferrier, Saavoss, Williamson (2024) | −0.27 | Paarlberg model parameterization |

Defensible range: −0.11 to −0.27. SURGE default −0.24 (ERR-139 unconditional, the ERS
source the team chose), with the sensitivity slider spanning −0.06 to −0.50 and the
literature values marked on it.

### Cross-price effects involving eggs (ERR-139 Table A.4, conditional Marshallian, 1998–2010)

Egg demand with respect to the price of: beef −0.14, pork −0.07, other red meat −0.27,
poultry +0.05, fish −0.02, eggs −0.26. Standard errors 0.15–0.19, so none of the cross
terms is statistically distinguishable from zero.

Demand for other meats with respect to the egg price: beef −0.05, pork −0.03, other red
meat −0.10, poultry +0.01, fish −0.02.

Interpretation the product must state plainly: **eggs are a staple with weak, mostly
complementary links to meats.** When egg prices spike, consumers mostly keep buying eggs
and pay more; measured substitution toward other proteins is small and noisy. The
"what people switch to" readout will be honest about that rather than inventing a large
substitution story.

### Own-price elasticities for other commodities

| Commodity | ERR-139 unconditional (retail) | Andreyeva et al. mean | ERR-57 EDM (wholesale, quarterly) |
|---|---|---|---|
| Beef | −0.70 | 0.75 | −1.521 |
| Pork | −1.26 | 0.72 | −1.45 |
| Poultry | −0.81 | 0.68 | −2.677 |
| Fish | −0.84 | n/a | n/a |
| Milk | −0.10 | 0.59 | −0.397 (dairy) |
| Cheese | −0.70 | 0.44 | |
| Fruit (various) | −0.58 to −1.10 | 0.70 | |
| Vegetables | (potatoes −0.42, lettuce −0.84) | 0.58 | |
| Cereals | (rice/pasta −0.07, breakfast cereal −1.05) | 0.60 | wheat −0.309, rice −0.328, coarse grains −0.40 |
| Fats/oils | | 0.48 | soy oil −0.314 |
| Infant formula | no ERS estimate; literature treats as highly inelastic | | |

Group-level (ERR-139 first stage): cereals and bakery −0.58, meat and eggs −0.31,
dairy −0.05, fruits and vegetables −0.79, nonalcoholic beverages −0.65, other FAH −0.98,
FAFH and alcohol −0.71. Cross-price effects among groups are "non-negligible for meats"
and small elsewhere (ERR-57 text).

## 4. Budget shares (BLS Consumer Expenditure Survey, via FRED, average per consumer unit, 2024)

| Item | Annual $ | Share of total spending | Share of food at home |
|---|---|---|---|
| Total expenditures | 78,535 | | |
| Food at home | 6,224 | 7.9% | |
| Eggs | 105 | 0.13% | 1.7% |
| Poultry | 267 | 0.34% | 4.3% |
| Beef | 408 | 0.52% | 6.6% |
| Pork | 260 | 0.33% | 4.2% |
| Dairy products | 631 | 0.80% | 10.1% |
| Cereals and cereal products | 240 | 0.31% | 3.9% |

Egg spending per consumer unit rose from $68 (2021) to $105 (2024) with roughly flat
quantities, which is the price shock showing up in the survey.

Because the egg budget share is about one-tenth of one percent, income effects on egg
demand are negligible and compensating variation, equivalent variation, and Marshallian
surplus coincide to well under 1% for a single egg-price change (Willig 1976). The
multi-good machinery earns its keep in combined scenarios, not in the egg case alone.

## 5. Supply side and biology

| Fact | Value | Source |
|---|---|---|
| Table-egg layers depopulated, 2022 | 43.3M (Ferrier Table 1) / 43.4M (WATTPoultry) | APHIS |
| 2022 timing | 30.7M Feb–Jun; 12.6M Sep–Dec; March alone 16.9M | WATTPoultry, ERS chart of note |
| January 2022 layer flock | 395.0M (Ferrier Table 1) | ERS |
| Flock on April 1, 2022 | 305.2M | ERS Livestock, Dairy, and Poultry Outlook, April 2022 |
| Depopulated 2024 | 38.4M layers, 29 flocks | APHIS via Fryar |
| Jan–Feb 2025 | about 30M layers | Fryar/uaex |
| Losses as % of January flock | 11.0% (2022), 11.6% (2015) | Ferrier Table 1 |
| Production shortfall vs. WASDE forecast, 2022 | Q2 5.7%, Q3 4.7%, Q4 6.5% (annual 4.7%) | Ferrier Table 4 |
| Shell-egg production 2022 vs 2021 | −2.4%; average annual egg price +141% | Ferrier |
| Required downtime before restocking | 9–13 weeks (Ferrier); 14- or 28-day fallow after virus elimination plus environmental sampling | APHIS restock criteria |
| 2015 average confirmation-to-restock-approval | 111 days | APHIS via search |
| Pullet rearing | 16–17 weeks; lay begins about 20 weeks | Cornell CVM |
| Fryar's working assumption | "six months for a new flock to reach maturity and begin laying" | Fryar 2025 |
| Layer supply response | elasticity 0.15 of layer numbers to lagged output (quarterly); bird numbers tied 1:1 to egg output | ERR-57 App. table 11 |
| Feed cost share of egg unit revenue | 22.9% (coarse grain 11.9%, meal 10.7%) | ERR-57 App. table 2 |
| Egg export share of production | 4.1% (2018), 5.5% (2012–14) | Ferrier Table 2 |
| Export demand elasticity for eggs | −5.0 | ERR-57 App. table 12 |
| Frozen egg products in cold storage | about 2.3M lbs (Nov 2025) | NASS Cold Storage |

Modeling implication: hens lost do not equal production lost. A depopulated house is out
for the downtime plus the time to obtain and mature replacement pullets. SURGE will model
each depopulation as a step drop in laying inventory that recovers after a configurable
lag (default 6 months, range 4–9), convert inventory to production with the NASS rate of
lay, and validate the resulting quarterly shortfall against Ferrier's 5.7 / 4.7 / 6.5%.

## 6. Price transmission

* Farm value was about 35% of the retail egg price in 2004 (ERS price spreads); the rest
  is marketing margin. If the margin is fixed in dollars, a 100% wholesale rise becomes a
  35% retail rise; if proportional, 100%. In 2022 the New York wholesale carton price
  rose up to 217% year over year (Ferrier) while retail rose about 150% peak to peak
  (FRED), implying a pass-through of roughly 0.7 on a proportional basis.
* Retail lags wholesale and falls more slowly than it rises (asymmetric transmission;
  farmdoc daily, March 2025; ERS 2011 finds lags for eggs and milk at the upper end,
  5–6 months, for general commodity-to-retail transmission, while Mitchell et al. observe
  9% week-over-week retail increases during outbreaks).
* SURGE parameterizes this as pass-through share θ (default 0.7) and lag L (default 1
  month for wholesale-driven spikes), both exposed.

## 7. Welfare measurement: theory used

Notation: goods i = 1..n, prices p, budget shares w_i, Marshallian elasticities ε_ij,
expenditure elasticities η_i, compensated (Hicksian) elasticities ε^c_ij.

* Compensating variation is the change in the expenditure function at the initial
  utility: CV = e(p¹, u⁰) − e(p⁰, u⁰). Its second-order Taylor expansion in prices is
  CV ≈ Σ_i x_i Δp_i + ½ Σ_i Σ_j (∂h_i/∂p_j) Δp_i Δp_j, where h is Hicksian demand
  (Mas-Colell, Whinston, Green ch. 3; Harberger 1971 for the triangle form).
* In elasticity form with total expenditure M: CV/M ≈ Σ_i w_i π_i + ½ Σ_i Σ_j w_i ε^c_ij π_i π_j,
  where π_i = Δp_i / p_i.
* Slutsky: ε^c_ij = ε_ij + w_j η_i. Symmetry requires w_i ε^c_ij = w_j ε^c_ji; the engine
  symmetrizes the published matrix by averaging the two implied values and reports the
  adjustment. Negative semidefiniteness is checked and reported.
* For a single price change this collapses to CV ≈ p x π (1 + ½ ε^c π), the familiar
  trapezoid. With constant-elasticity Marshallian demand the exact surplus is
  ΔCS = p⁰ x⁰ [(1+π)^(1+ε) − 1]/(1+ε), which is what Mitchell et al. and Ferrier et al.
  compute ("exact method"). Both are implemented; they agree within 1% for egg-sized shocks.
* Willig (1976): |CV − CS| / CS is bounded by roughly ½ η (CS/M), negligible at egg budget
  shares. Hausman (1981) provides exact measures from Marshallian demand; not needed here.
* Path dependence: Marshallian surplus summed over several price changes depends on the
  order of integration unless the Slutsky matrix is symmetric; Hicksian CV does not. This
  is why combined Simulator scenarios use CV, never a sum of single-good surpluses.

## 8. Method decision

1. **Price stage (structural, per commodity):** physical shortfall path from the biology
   model → wholesale price via inverse demand with short-run supply fixed, net of trade
   buffers (exports fall with elasticity −5 and share 4%; imports enter as a mitigation
   lever) → retail via pass-through θ and lag L. Reports Δp, Δq monthly.
2. **Welfare stage (multi-good Hicksian CV, second order):** ERR-139 elasticities, CEX
   budget shares, US population from FRED. Headline number. Reports per-commodity
   contributions, substitution quantities from cross-price elasticities, and the
   sensitivity band across the elasticity range.
3. **Published-method replica (single-good constant-elasticity CS):** shown beside the
   headline, used for the calibration test.
4. **Counterfactual choice exposed:** "modeled price path" (structural) vs. "observed price
   path" (FRED, retrospective replays only) with an attribution share defaulting to the
   published econometric estimate where one exists. The product shows both and labels which
   is in use, because this choice moves the answer more than any elasticity.

Validation tests the engine must pass:

* Fryar inputs (p⁰ 2.73, 202 eggs, ε −0.228, π 0.09, population 340.1M) → $1.41B within 2%.
  The residual is the unpublished population base.
* Ferrier price stage: a 5.7% supply shortfall with ε −0.27 and no trade buffer gives
  π ≈ 21%, consistent with their 22.5% (Q2) and 23.9% (Q4) counterfactual gaps.
* Multi-good CV with only the egg price moving equals the single-good CV to within 0.5%.
* Combined scenario CV is independent of the order shocks are applied.

## 9. Mitigation precedents

| Lever | Precedent | Quantities | Lead time | Cost signal |
|---|---|---|---|---|
| Regulatory relaxation unlocking imports | FDA Infant Formula Enforcement Discretion, May 2022 | 18.4M cans ≈ 395.6M 8-oz bottle-equivalents approved by 27 Jul 2022 | Days to approve; weeks to ship | Review cost only; policy expired 14 Nov 2022 |
| Airlift logistics | Operation Fly Formula, from 22 May 2022 | First flight 78,000 lbs (>0.5M bottles); ~64M bottles by early Aug; >83M by 2 Sep 2022 | Days | DoD/commercial freight; a subset of the approved volume |
| Import facilitation for eggs | USDA five-pronged plan, Feb–Jun 2025 | >26M dozen shell eggs (Turkey 57%, plus Brazil, Honduras, Mexico, S. Korea) for breaking, plus 14M dozen-equivalents of egg products, Jan–Jun 2025 | Weeks | Part of $1B plan: $500M biosecurity, $400M indemnity, $100M vaccine research |
| Regulatory relaxation, domestic supply | NCC petition to let surplus broiler hatching eggs go to breakers | ≈400M eggs/yr (≈33M dozen) | Immediate if granted | Denied Jun 2023; re-petitioned Feb 2025, unresolved |
| Stockpile release | China central frozen pork reserves | >200,000 t Dec 2019–early 2020; 127,100 t Sep–Oct 2022 in six batches | Days | State reserve program; US holds no egg reserve (cold storage ≈2.3M lbs) |
| Domestic capacity ramp | Layer repopulation | Bounded by downtime (9–13 wks) plus pullet supply (17–20 wks) | 4–9 months | Indemnity ($1.8B cumulative since 2022 per Innovate Animal Ag) |
| Demand-side | Retailer purchase limits, Feb 2025 | Trader Joe's 1 dozen/day; Costco 3 cartons; some Kroger 2 dozen | Immediate | Rationing, not supply |

Scale check that the mitigation view must make visible: about 30M layers lost in
Jan–Feb 2025 at 0.8 eggs/hen/day over a six-month recovery is roughly 4.4B eggs
(370M dozen). Imports of about 40M dozen-equivalents over six months covered about a
tenth of that. For eggs, biology does the work and every lever is marginal; for infant
formula, the regulatory unlock was the binding constraint and the airlift a fraction of
it. SURGE shows both honestly.

## 10. Questions the team economist should rule on

1. Default elasticity −0.24 (ERR-139) versus −0.228 (Mitchell) versus −0.27 (Ferrier).
2. Whether to present the modeled or the observed-attributed price path as the headline
   for retrospective replays. Proposal: observed-attributed for replays, modeled for
   Simulator scenarios, always labeled.
3. Recovery lag default (6 months) and whether to draw it from APHIS restock timing
   directly when the vetted data path is available.
4. Whether cross-price terms that are statistically insignificant should be zeroed by
   default (proposal: use point estimates, show the significance flag).

## 11. Sources

* Mitchell, Thompson, Malone (2025). *The Economic Impact of HPAI on U.S. Egg Consumers: Estimating a $1.41 Billion Loss in Consumer Surplus.* Fryar Center FC-2025-001. https://fryar-risk-center.uada.edu/files/2025/02/2024-HPAI-Impacts-Egg-Prices.pdf
* Mitchell, Thompson, Malone (2024). *Biological lags and market dynamics in vertically coordinated food supply chains: HPAI impacts on U.S. egg prices.* Food Policy 126:102655. https://www.sciencedirect.com/science/article/pii/S0306919224000666
* Ferrier, Saavoss, Williamson (2024). *Welfare Effects of the 2022 U.S. HPAI Outbreak.* NCCC-134. https://farmdoc.illinois.edu/assets/meetings/nccc134/conf_2024/pdf/Ferrier_Saavoss_Williamson%20NCCC-134%202024.pdf
* Paarlberg, Seitzinger, Lee, Mathews (2008). *Economic Impacts of Foreign Animal Disease.* ERS ERR-57, Appendix B. https://www.ers.usda.gov/publications/pub-details?pubid=45991
* Okrent, Alston (2012). *The Demand for Disaggregated Food-Away-From-Home and Food-at-Home Products in the United States.* ERS ERR-139. https://www.ers.usda.gov/sites/default/files/_laserfiche/publications/45003/30438_err139.pdf
* Andreyeva, Long, Brownell (2010). *The Impact of Food Prices on Consumption.* AJPH 100:216–222. https://pmc.ncbi.nlm.nih.gov/articles/PMC2804646
* ERS Commodity and Food Elasticities database. https://ers.usda.gov/data-products/commodity-and-food-elasticities/about
* BLS Consumer Expenditure Survey series via FRED: CXUTOTALEXPLB0101M, CXUFOODHOMELB0101M, CXU080110LB0101M (eggs), CXUPOULTRYLB0101M, CXUBEEFLB0101M, CXUPORKLB0101M, CXUDAIRYLB0101M, CXUCEREALLB0101M.
* FRED APU0000708111 (average retail price, eggs, grade A large, per dozen).
* ERS chart of note, April 2022 flock. https://ers.usda.gov/data-products/charts-of-note/103873
* WATTPoultry, 2022–24 overview of HPAI's effect on the US layer industry. https://www.wattagnet.com/poultry-meat/diseases-health/avian-influenza/news/15683189/202224-overview-of-hpais-effect-on-the-us-layer-industry
* APHIS restocking criteria. https://www.aphis.usda.gov/sites/default/files/criteriarestock.pdf
* Cornell CVM, HPAI poultry resource. https://www.vet.cornell.edu/highly-pathogenic-avian-influenza-bird-flu-resource-center/poultry
* ERS Amber Waves (2014), Food Price Transmissions From Farm to Retail. https://www.ers.usda.gov/amber-waves/2014/may/food-price-transmissions-from-farm-to-retail
* farmdoc daily (Mar 2025), Wholesale Egg Prices Plummet, Retail Prices Remain Elevated. https://farmpolicynews.illinois.edu/2025/03/wholesale-egg-prices-plummet-retail-prices-remain-elevated/
* Innovate Animal Ag (2025), HPAI costs. https://innovateanimalag.org/hpai-costs-2025
* USDA press releases, 20 Mar 2025 and 26 Jun 2025, five-pronged HPAI strategy. https://www.usda.gov/about-usda/news/press-releases/2025/06/26/secretary-rollins-provides-update-bird-flu-strategy-egg-prices-continue-fall
* National Chicken Council petition (Feb 2025). https://www.nationalchickencouncil.org/national-chicken-council-offers-measure-to-help-alleviate-egg-shortage-in-wake-of-bird-flu/
* CNBC (Feb 2025), retailer egg purchase limits. https://www.cnbc.com/2025/02/12/trader-joes-costco-kroger-limit-egg-purchases.html
* White House Operation Fly Formula releases (Jun–Sep 2022); Bobbie Medical clinicians' guide (395.6M bottle figure). https://medical.hibobbie.com/resource/understanding-operation-fly-formula
* Fortune (22 May 2022), first 78,000-lb flight. https://fortune.com/2022/05/22/78000-pounds-infant-formula-arrives-in-us-military
* CNBC (Jul 2022), Sturgis restart. https://www.cnbc.com/2022/07/09/production-resumes-at-troubled-abbott-baby-formula-factory.html
* Global Times / FAS on China pork reserves. https://www.fas.usda.gov/data/china-swine-and-pork-market-interventions-ineffective-managing-rising-prices
* NASS Cold Storage. https://www.nass.usda.gov/Publications/Todays_Reports/reports/cost0125.pdf
* Willig (1976) AER 66:589–597; Hausman (1981) AER 71:662–676; Harberger (1971) JEL 9:785–797; Mas-Colell, Whinston, Green (1995) ch. 3; Deaton, Muellbauer (1980).
