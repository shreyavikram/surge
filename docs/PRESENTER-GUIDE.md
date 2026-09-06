# Greenfield — how it works (presenter's guide)

Written 2026-09-06 for the DNHacks showcase. Everything here is true of the deployed build at https://greenfield-w77m.onrender.com; the long-form references are `docs/DATA-AUDIT.md` (every data process, with confidence ratings), `DECISIONS.md` (why each modelling choice was made) and `docs/economics/methodology.md` (the derivations).

## 1. The one-paragraph version

Greenfield is a live map of threats to the American food supply, priced for the people who eat the food. It pulls official data feeds every hour, screens the news for disruptions the data has not caught yet, and runs every threat through one deterministic economic model. The output for each threat is a consumer welfare loss in dollars, a price path per commodity, and a breakdown by state and congressional district, so a staffer can ask "what does this cost my district?" and get a number with its sources attached. Scenarios let you add a hypothetical threat and turn its dials; the Relief tab shows which levers close the gap; email alerts follow the same filters.

Three layers, in the order the judges will see them: the **map** (what is happening and where), the **model** (what it costs and whom), and **relief** (what would help).

## 2. What it draws from

Ten live feeds, each refreshed on its own schedule and cached so a slow source never blocks the page. If a source fails, the last good fetch is served, then a committed snapshot, and the health endpoint says which.

| Feed | What it gives Greenfield | Colour it can produce |
|---|---|---|
| USDA APHIS HPAI detections | Birds lost per month per commodity (eggs, chicken, turkey); the 2022 replay uses the exact monthly losses (43.1 M birds) | red |
| US Drought Monitor | Weekly share of each state in D2–D4 drought | red |
| GDACS | Floods, storms, wildfires worldwide with alert level and population affected | red |
| NASA FIRMS | Satellite fire hotspots with radiative power, placed in states by polygon | red |
| IMF PortWatch | Ship transits through Suez/Red Sea, Hormuz, Panama, Black Sea vs the 2019–23 baseline | red |
| EIA | Diesel and natural-gas prices (farm inputs) | red |
| US Census Bureau trade | Monthly imports by country for every commodity's HS codes; a ≥20% three-month drop from a ≥10% origin is an import decline | yellow, red once store prices react |
| BLS retail prices via FRED | Average store prices; scored with the FAO price-anomaly indicator | the "store prices vs the usual season" strip |
| Google News RSS + Gemini | Headlines screened for real disruptions; Gemini proposes, the deterministic validator decides | yellow |
| Global Trade Alert | Tariffs, export bans, embargoes | yellow / red |

Reference data underneath: the USDA ERS demand system (ERR-139, Okrent & Alston 2012) for elasticities; NASS 2022 Census of Agriculture county data crosswalked to the 436 congressional districts for who produces what; Census imports by origin, re-measured monthly, for who supplies what (54 supplier countries, $208 B of food imports a year); the Consumer Expenditure Survey for who spends what by region and income; ERS price spreads for the farm share of the retail dollar.

Every number the app shows is tagged **measured** (it came from data) or **modeled** (it came from a rule), and the Assumptions dropdown lists the source of each.

## 3. From a signal to a threat

A threat is a record with a category (drought, disease, export ban, tariff, import decline, chokepoint, input cost…), a place, the commodities it touches, a start month, and a **severity**. Severity has one meaning everywhere: the fraction of the affected supply channel that is lost. 100% on an import threat means imports from that source stop; 100% on a US region means it produces nothing; for a tariff it is the rate.

Two statuses. **Disruption under way** (red) means measured data show the channel is cut: APHIS depopulations, Drought Monitor area, Census imports down, PortWatch transits down. **Possible disruption** (yellow) means it has been reported but is not yet in shipping, supply, or price data.

The news path is deliberately strict, because a headline is not a measurement:

- Gemini reads each headline with a fixed vocabulary of categories, regions and commodities and may only *propose*; every proposal is re-validated by deterministic code.
- Relief actions (aid, donations, lifted bans), reference pages, and third-country trade actions ("EU bans Brazilian beef" does not cut US supply) are rejected.
- A threat needs two independent outlets, or a quoted loss figure, or a wire/official source.
- A nationwide placement needs nationwide wording; a headline naming a state lands on that state.
- Headline-only severities are capped: 3% of a national channel, 15% of a regional one, unless the headline quotes a loss.
- Measured beats reported: a drought headline for a state that the Drought Monitor already covers is dropped.

On 337 hand-labelled current headlines (100 real disruptions) the rule path scores precision 0.93 and recall 0.38; Gemini's raw judgement before the guards scores 0.62 and 0.79. That is why the guards sit after it.

Measured feeds have their own scaling: drought damage is weighted by a crop calendar and discounted by each state's irrigated share; GDACS events are scaled by the share of the country's population they touch, and Green alerts are ignored; fires count only above 1,500 MW of radiative power in a state; a Census decline is measured against the average of the same three months in the previous three years, and the popup names the origins whose shipments rose instead.

## 4. How a threat becomes dollars

Each threat is converted to monthly **shocks** per commodity: a supply path (fraction of US supply missing each month) and, for cost-type threats, a wholesale cost wedge. The rules:

- **Livestock disease**: birds lost ÷ the standing national flock, spread over the detection timeline, recovering on a uniform 5–12 month ramp with a producer offset of 0.35 (calibrated to the 2022 egg quarters).
- **Crop hazard**: severity × damage cap × the region's share of US output, for one marketing year, buffered by up to half the stocks-to-use ratio; weather cannot destroy manufactured or wholly imported goods at home.
- **Import loss** (export bans, measured declines): import share × origin share × severity, with 30% replaced from other origins.
- **Tariff**: a cost wedge of rate × import share × origin share.
- **World price** (war, instability in a big exporter): the lost share of world exports ÷ a world excess-demand elasticity of 0.35 (Ukraine and Russia together at half severity reproduce the 2022 wheat spike); the US price follows fully once the US trades a quarter of its use.
- **Chokepoint**: one month of delayed imports, buffered by pipeline stocks, plus a 5% freight wedge at full closure.
- **Input cost**: diesel, gas and fertilizer clear at the farm gate and reach bread, eggs, potatoes through ERS cost shares.

**Prices.** Short-run supply is fixed by biology, so the market clears on the demand side:

    retail price change π = −s / ((1 − x)·ε + x·εₓ/θ)

where s is the supply shortfall, ε the retail demand elasticity, x the export share, εₓ the export demand elasticity, and θ the retail pass-through; each commodity carries its own lag from wholesale to shelf.

**Welfare.** The headline number is the Hicksian **compensating variation**: the extra money households would need to be as well off as before the price rise. It is computed to second order over the whole ERS demand system, so cross-price effects (people buying more chicken when eggs jump) are inside the number, with a non-food numeraire and a symmetrised Slutsky matrix that passes the negativity check. The band around it comes from the published range of own-price elasticities.

**Calibration.** The 2024 egg episode reproduces Fryar's published consumer loss ($1.41 B) within 2%; the 2022 replay reproduces Ferrier, Saavoss and Williamson's quarterly shortfalls within 2.5 points. Those checks are pinned by tests and run on every commit.

**Producers.** Producer revenue is valued at the farm share of the retail dollar (bread 6%, eggs 55%), and only domestic losses reduce a producer's quantity; import cuts leave US producers with the higher price.

**Where it lands.** Consumer loss is split by consumption share (population × the regional food-at-home index × an income term); producer gains and losses by production share from the county census; the income-quintile view uses what each quintile spends on the hardest-hit item.

## 5. Ranking and the map

The watchlist ranks threats by **consumer welfare loss, total over the shock, for the chosen importer** (the US, a state, or a district). Annual and total are both shown; per person is total ÷ population. Filters recolour the map and re-rank the list for a commodity or threat type.

Map colour is two separate things. **Hue** is status: green stable, yellow possible disruption, red disruption under way, grey no measurable supply. **Shade** is only how much of US food (or of the filtered commodity) the place supplies. A threat colours a place only when it disrupts at least 0.05% of US supply or 5% of the place's own output; smaller ones are listed in the popup as too small to move prices, so a minor flood on a small rice supplier does not paint India red.

## 6. Relief

For the commodity with the largest physical gap, the Relief tab draws the missing supply month by month and closes it with **levers**: precedent-based ones (the 2022 FDA formula discretion, USDA's 2025 egg import facilitation) plus template levers for imports, stock release, demand-side rationing and accelerated repopulation. Levers are allocated cheapest-first subject to lead time, ramp, stock and regulatory-unlock caps, and classified by how much of the gap they closed (does the work / contributes / marginal). Price-only shocks (a tariff) get an offset target instead: the extra supply that would cancel the price rise.

## 7. Scenarios and alerts

A scenario copies the live picture. Add a hypothetical threat by describing it ("Iran closes Hormuz for three months, cutting fertilizer shipments 60%"; the interpreter proposes category, place, commodities, severity and duration, and Gemini proposes alternatives when a key is present) or by filling in the fields. Dials change severity and duration; Compare puts scenarios side by side; every hypothetical carries a dotted outline and is never mixed into the live picture. Email alerts use the same filters as the watchlist, arrive as each threat appears or as a weekly or monthly digest, and start with a confirmation listing what already matches.

## 8. Honesty features worth pointing at

- Every number is tagged measured or modeled, with its source one click away; possible threats list the reports behind them with links.
- Live threats' price charts stop at the current month; nothing is projected as if it had happened.
- `docs/DATA-AUDIT.md` rates every data process High / Medium / Low and says what would raise it; an independent review agent found thirteen logic errors before the demo and each is pinned by a regression test.
- 236 automated tests across the engine, server, configuration and client.

## 9. Questions the judges may ask

**Why welfare loss rather than the price increase?** A 20% jump in egg prices and a 20% jump in coffee prices cost households very different amounts, and people substitute. Compensating variation is the standard measure of what a price change costs consumers, and it is what the published egg studies report, which is what let us calibrate.

**Where do the elasticities come from?** USDA ERS Economic Research Report 139 (Okrent & Alston), the standard US food-at-home demand system, with published ranges from other studies setting the uncertainty band.

**How do you know the model is right?** It reproduces two published studies of the 2022 and 2024 egg episodes within 2% and 2.5 points, and those checks run as tests on every change. Where we could not validate, the number is labelled modeled and the assumption is exposed.

**What is the AI actually doing?** Reading headlines and proposing structured candidates, nothing more. Deterministic code validates every proposal, and the corroboration and placement rules sit after it. The economics contains no AI.

**What are the limits?** Import declines are measured by customs value, not quantity; a GDACS event is scaled by population, not cropland; chokepoint shares use a modeled routing table; headline severities are defaults. All of this is written down with a confidence rating.

**What would you build next?** Quantity-based trade data from the 10-digit lines, cropland intersections for hazards, a regional price stress view, and a verified email domain so alerts reach anyone.

## 10. Where the AI is, and why it is built this way

**The design in one line: the model reads, the code decides.** AI does the two jobs that deterministic code cannot: reading unstructured reporting into structured threat candidates, and reading a typed scenario into economic shocks. Everything after that is deterministic and tested, so a hallucination can never become a dollar figure without passing a validator.

**Is it removable?** Take the model out and two things disappear: the yellow layer (every possible disruption from reporting) and natural-language scenarios. The rule-only path catches 38 of every 100 real disruptions in the labelled set; with the model proposing first, the raw catch rate is 79 of 100 before the guards trim it for precision. The model doubles what the system sees.

**What is technically there, beyond a wrapper:**

- Constrained generation on a closed vocabulary (categories, 54+ regions, 26 commodities) returning a typed record: type, place, commodities, severity as a fraction of a channel, duration, confidence, one plain sentence.
- A hybrid interpreter: the rule-based parser and the model both propose; proposals are merged and validated by the same code path, so the app degrades gracefully to rules-only without a key or during an outage.
- A guard stack after the model: relief actions, reference pages, third-country trade actions, nationwide-placement wording, state relocation, corroboration (two outlets, a quoted loss, or an official source), severity caps (3% national, 15% regional), and measured-beats-reported de-duplication.
- Model operations: gemini-3.6-flash with two fallback models, batches of 40 headlines, retries with back-off on 429/503, snapshot fallback when everything fails.
- Evaluation as a test: 337 hand-labelled headlines (100 real disruptions) with a precision/recall test pinned in CI (rule path 0.93 / 0.38) and a live evaluation script for the model path (raw 0.62 / 0.79 before guards).
- Prompt-injection hygiene: headline text sits inside a data block the prompt tells the model to treat as data; the validator, not the model, has the last word; keys never leave the server.
- Agentic engineering in the build itself: an independent review agent red-teamed the engine and found thirteen logic errors, each now a regression test; other agents built the labelled set and the feed improvements.

**What we would say about the limits:** no fine-tuning (the vocabulary and validator do the work a fine-tune would); the guarded pipeline trades recall for precision on purpose; the evaluation set is small and labelled by us; the model is a third-party API, so the rules-only path exists.
