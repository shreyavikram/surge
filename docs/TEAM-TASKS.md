# Team tasks (parallel to the build)

Five things that help most right now, none of which block the engineering. Everything you produce
goes into this repo so it survives and I can pick it up on my next pass.

## 1. Review the documents

Read, in this order:

1. `docs/economics/literature-review.md` — what the published studies did and the numbers we rely on.
2. `docs/economics/methodology.md` — the equations the engine implements, one section per stage.
3. `docs/superpowers/specs/2026-09-05-surge-design.md` — the product design.
4. `DECISIONS.md` — every judgment call and why.

Put comments in **`docs/REVIEW.md`** (create it). Format, one block per comment:

```
### R1 — literature-review.md §3 elasticity default
Comment: ...
Proposed change: ...
Status: open
```

I answer inline under each block and set Status to accepted / declined-with-reason / done. Your
economist's review of methodology.md is the most valuable single thing on this list.

## 2. Register the free API keys

Create **`.env`** at the repo root (it is git-ignored, never commit it):

```
FRED_API_KEY=
NASS_API_KEY=
FIRMS_MAP_KEY=
EIA_API_KEY=
GTA_API_KEY=
AMS_API_KEY=
ANTHROPIC_API_KEY=
ACLED_EMAIL=
ACLED_PASSWORD=
```

| Key | Where | Notes |
|---|---|---|
| FRED | https://fredaccount.stlouisfed.org/apikeys | instant |
| NASS QuickStats | https://quickstats.nass.usda.gov/api | instant |
| NASA FIRMS | https://firms.modaps.eosdis.nasa.gov/api/map_key/ | instant |
| EIA | https://www.eia.gov/opendata/register.php | instant |
| Global Trade Alert | https://globaltradealert.org/api-access | may take a day |
| AMS MyMarketNews | https://mymarketnews.ams.usda.gov/mymarketnews-api | instant |
| Anthropic | https://console.anthropic.com/ | needed for briefs and the AI extraction layer |
| ACLED | https://acleddata.com/register then email access@acleddata.com for API access | start first, can take days |

## 3. Draft the persona

Create **`docs/design/persona.md`**. The design rubric scores a specific, deep persona and decisions
traced to it. Answer these, in prose, about one named person:

- Role and organization (for example: a supply-chain risk analyst at a national grocery chain, or a
  USDA/DHS food-defense desk officer, or a commodity trader's risk desk).
- The morning that goes wrong: what alert reaches them, what they must decide by noon, who they must
  convince, and what it costs them to be wrong in either direction.
- What they already use (Bloomberg, Kpler, USDA reports, spreadsheets) and what they distrust about it.
- What "trust" means to them: what has to be visible before they act on a number.
- Their constraints: time, attention, screen, sharing restrictions, need to defend the number upward.
- Three things they would never want the tool to do.

I will trace map, watchlist, chip labels, and gating decisions to this document.

## 4. Verify the approximate numbers

Every value below is marked approximate, assumed, or modeled in its source note. Fill the last
column with the verified value and the URL of the NASS, ERS, FAS, or other primary table. If the
current value is fine, write "confirmed" plus the URL. Edit this file directly.

| Where | Current values | Current source note | Verified value + URL |
|---|---|---|---|
| `commodities.json › eggs › supply` | `{"model": "livestock", "nationalInventory": 325000000, "recoveryLagMinMonths": 5, "recoveryLagMaxMonths": 12, "producerOffset": 0.35}` | NASS Chickens and Eggs table-egg layers Jan 2022 approx 325M (approximate; Plan 2 pulls QuickStats); lag: APHIS restock criteria 9-13 wk downtime + 17-20 wk pullets, industry 'a year or more'; offset from Ferrier 2024 Table 4 vs naive inventory loss | |
| `commodities.json › chicken › baseline` | `{"annualQuantity": 34000000000, "retailPrice": 1.98, "year": 2024}` | ERS per capita broiler consumption ~100 lb (approximate) × 340.1M; FRED APU0000706111 whole chicken 2024 avg | |
| `commodities.json › chicken › transmission` | `{"passThrough": 0.7, "lagMonths": 1}` | assumed same as eggs (modeled) | |
| `commodities.json › chicken › inputs › corn` | `costShare 0.25` | ERR-57 App. table 3 broiler feed shares (approximate) | |
| `commodities.json › chicken › inputs › soybeans` | `costShare 0.15` | ERR-57 App. table 3 (approximate) | |
| `commodities.json › turkey › baseline` | `{"annualQuantity": 5100000000, "retailPrice": 1.52, "year": 2022}` | Ferrier 2024 (observed 2022 retail $1.52/lb; ~15 lb per capita approximate) | |
| `commodities.json › turkey › transmission` | `{"passThrough": 0.7, "lagMonths": 1}` | assumed same as eggs (modeled) | |
| `commodities.json › turkey › inputs › corn` | `costShare 0.25` | ERR-57 App. table 3 (approximate) | |
| `commodities.json › turkey › inputs › soybeans` | `costShare 0.15` | ERR-57 App. table 3 (approximate) | |
| `commodities.json › beef › baseline` | `{"annualQuantity": 19700000000, "retailPrice": 5.5, "year": 2024}` | ERS ~58 lb per capita retail weight (approximate) × 340.1M; FRED APU0000703112 ground beef 2024 avg | |
| `commodities.json › beef › trade` | `{"exportShare": 0.11, "exportElasticity": -1.01, "importShare": 0.15}` | ERS Livestock and Meat International Trade Data (approximate); ERR-57 App. table 12 | |
| `commodities.json › beef › transmission` | `{"passThrough": 0.6, "lagMonths": 2}` | ERS Amber Waves 2014 beef 1-6 month lag (modeled) | |
| `commodities.json › beef › inputs › corn` | `costShare 0.1` | ERR-57 App. table 2 beef feed (approximate) | |
| `commodities.json › pork › baseline` | `{"annualQuantity": 17000000000, "retailPrice": 4.2, "year": 2024}` | ERS ~50 lb per capita retail weight (approximate) × 340.1M; FRED pork chops APU0000FD3101 2024 avg | |
| `commodities.json › pork › trade` | `{"exportShare": 0.25, "exportElasticity": -0.89, "importShare": 0.05}` | ERS trade data (approximate); ERR-57 App. table 12 | |
| `commodities.json › pork › transmission` | `{"passThrough": 0.6, "lagMonths": 2}` | ERS Amber Waves 2014 (modeled) | |
| `commodities.json › milk › baseline` | `{"annualQuantity": 5100000000, "retailPrice": 4.0, "year": 2024}` | ERS fluid milk ~15 gal per capita (approximate) × 340.1M; FRED APU0000709112 2024 avg | |
| `commodities.json › milk › trade` | `{"exportShare": 0.18, "exportElasticity": 0, "importShare": 0.02}` | USDEC dairy solids export share (approximate); ERR-57 App. table 12 (milk/dairy 0) | |
| `commodities.json › milk › transmission` | `{"passThrough": 0.6, "lagMonths": 2}` | ERS Amber Waves 2014 milk 5-6 month lag (modeled shorter for crises) | |
| `commodities.json › milk › inputs › corn` | `costShare 0.15` | ERR-57 App. table 3 dairy feed (approximate) | |
| `commodities.json › cheese › baseline` | `{"annualQuantity": 14300000000, "retailPrice": 5.8, "year": 2024}` | ERS ~42 lb per capita (approximate) × 340.1M; FRED APU0000710212 cheddar 2024 avg | |
| `commodities.json › cheese › trade` | `{"exportShare": 0.07, "exportElasticity": -1, "importShare": 0.03}` | USDEC (approximate) | |
| `commodities.json › cheese › transmission` | `{"passThrough": 0.6, "lagMonths": 2}` | assumed as milk (modeled) | |
| `commodities.json › cheese › inputs › milk-farm` | `costShare 0.5` | ERS price spreads dairy farm share (approximate) | |
| `commodities.json › bread › baseline` | `{"annualQuantity": 18000000000, "retailPrice": 2.0, "year": 2024}` | ERS ~53 lb flour-based bakery per capita (approximate) × 340.1M; FRED APU0000702111 white bread 2024 avg | |
| `commodities.json › bread › transmission` | `{"passThrough": 1.0, "lagMonths": 1}` | cost pass-through (modeled) | |
| `commodities.json › bread › inputs › energy` | `costShare 0.04` | ERS Food Dollar energy share (approximate) | |
| `commodities.json › rice › baseline` | `{"annualQuantity": 9000000000, "retailPrice": 1.0, "year": 2024}` | ERS ~27 lb per capita (approximate) × 340.1M; FRED APU0000701312 2024 avg | |
| `commodities.json › rice › trade` | `{"exportShare": 0.45, "exportElasticity": -5, "importShare": 0.25}` | ERS Rice Outlook (approximate); ERR-57 App. table 12 | |
| `commodities.json › rice › supply` | `{"model": "crop", "harvestMonth": 9, "stocksToUse": 0.2}` | ERS Rice Outlook (approximate) | |
| `commodities.json › rice › transmission` | `{"passThrough": 0.5, "lagMonths": 2}` | modeled | |
| `commodities.json › rice › inputs › fertilizer` | `costShare 0.1` | ERS commodity costs and returns rice (approximate) | |
| `commodities.json › potatoes › baseline` | `{"annualQuantity": 16000000000, "retailPrice": 1.0, "year": 2024}` | ERS ~47 lb fresh-equivalent per capita (approximate) × 340.1M; FRED APU0000712112 2024 avg | |
| `commodities.json › potatoes › trade` | `{"exportShare": 0.1, "exportElasticity": -1, "importShare": 0.1}` | ERS Vegetables and Pulses Outlook (approximate) | |
| `commodities.json › potatoes › transmission` | `{"passThrough": 0.5, "lagMonths": 1}` | modeled | |
| `commodities.json › potatoes › inputs › fertilizer` | `costShare 0.08` | approximate | |
| `commodities.json › lettuce › baseline` | `{"annualQuantity": 8000000000, "retailPrice": 1.7, "year": 2024}` | ERS ~24 lb per capita (approximate) × 340.1M; FRED APU0000712211 2024 avg | |
| `commodities.json › lettuce › trade` | `{"exportShare": 0.05, "exportElasticity": -1, "importShare": 0.15}` | ERS (approximate) | |
| `commodities.json › lettuce › transmission` | `{"passThrough": 0.6, "lagMonths": 0}` | modeled | |
| `commodities.json › tomatoes › baseline` | `{"annualQuantity": 7000000000, "retailPrice": 2.0, "year": 2024}` | ERS ~20 lb fresh per capita (approximate) × 340.1M; FRED APU0000712311 2024 avg | |
| `commodities.json › tomatoes › trade` | `{"exportShare": 0.05, "exportElasticity": -1, "importShare": 0.6}` | ERS: majority of fresh tomatoes imported, mostly Mexico (approximate) | |
| `commodities.json › tomatoes › transmission` | `{"passThrough": 0.6, "lagMonths": 0}` | modeled | |
| `commodities.json › fresh-vegetables › baseline` | `{"annualQuantity": 40000000000, "retailPrice": 1.8, "year": 2024}` | ERS fresh vegetables ex potatoes/lettuce/tomatoes ~120 lb per capita (approximate) × 340.1M | |
| `commodities.json › fresh-vegetables › trade` | `{"exportShare": 0.05, "exportElasticity": -1, "importShare": 0.35}` | ERS (approximate) | |
| `commodities.json › fresh-vegetables › transmission` | `{"passThrough": 0.6, "lagMonths": 0}` | modeled | |
| `commodities.json › apples › baseline` | `{"annualQuantity": 5500000000, "retailPrice": 1.7, "year": 2024}` | ERS ~16 lb fresh per capita (approximate) × 340.1M; FRED APU0000711111 2024 avg | |
| `commodities.json › apples › trade` | `{"exportShare": 0.25, "exportElasticity": -1, "importShare": 0.05}` | ERS Fruit and Tree Nuts Outlook (approximate) | |
| `commodities.json › apples › transmission` | `{"passThrough": 0.5, "lagMonths": 1}` | modeled | |
| `commodities.json › bananas › baseline` | `{"annualQuantity": 9500000000, "retailPrice": 0.63, "year": 2024}` | ERS ~28 lb per capita (approximate) × 340.1M; FRED APU0000711211 2024 avg | |
| `commodities.json › bananas › transmission` | `{"passThrough": 0.7, "lagMonths": 0}` | modeled | |
| `commodities.json › citrus › baseline` | `{"annualQuantity": 7000000000, "retailPrice": 1.6, "year": 2024}` | ERS ~21 lb fresh per capita (approximate) × 340.1M; FRED APU0000711311 oranges 2024 avg | |
| `commodities.json › citrus › trade` | `{"exportShare": 0.15, "exportElasticity": -1, "importShare": 0.3}` | ERS (approximate) | |
| `commodities.json › citrus › transmission` | `{"passThrough": 0.5, "lagMonths": 1}` | modeled | |
| `commodities.json › coffee › baseline` | `{"annualQuantity": 3400000000, "retailPrice": 6.5, "year": 2024}` | USDA FAS ~10 lb green-equivalent per capita (approximate) × 340.1M; FRED APU0000717311 2024 avg | |
| `commodities.json › coffee › transmission` | `{"passThrough": 0.6, "lagMonths": 3}` | roaster inventories and contracts (modeled) | |
| `commodities.json › sugar › baseline` | `{"annualQuantity": 22000000000, "retailPrice": 1.0, "year": 2024}` | ERS ~65 lb sugar per capita (approximate) × 340.1M; FRED APU0000715211 2024 avg | |
| `commodities.json › sugar › trade` | `{"exportShare": 0.0, "exportElasticity": 0, "importShare": 0.3}` | ERS Sugar and Sweeteners Outlook (TRQ; Mexico) approximate | |
| `commodities.json › sugar › transmission` | `{"passThrough": 0.5, "lagMonths": 2}` | modeled | |
| `commodities.json › fats-oils › baseline` | `{"annualQuantity": 25000000000, "retailPrice": 2.5, "year": 2024}` | ERS ~75 lb added fats/oils per capita (approximate) × 340.1M | |
| `commodities.json › fats-oils › trade` | `{"exportShare": 0.1, "exportElasticity": -2, "importShare": 0.2}` | ERS Oil Crops Outlook (approximate); ERR-57 soy oil -2 | |
| `commodities.json › fats-oils › transmission` | `{"passThrough": 0.6, "lagMonths": 1}` | modeled | |
| `commodities.json › fats-oils › inputs › soybeans` | `costShare 0.4` | ERS price spreads oils (approximate) | |
| `commodities.json › infant-formula › baseline` | `{"annualQuantity": 3400000000, "retailPrice": 1.5, "year": 2022}` | derived: 3.6M births/yr, ~70% any formula use in first 6 months, ~30 fl oz/day (approximate); price ~$0.19/fl oz prepared (approximate) | |
| `commodities.json › infant-formula › demand` | `{"ownPrice": -0.3, "range": [-0.2, -0.6], "expenditure": 0.05}` | assumed; no ERS estimate (see literature review §3) | |
| `commodities.json › infant-formula › transmission` | `{"passThrough": 0.5, "lagMonths": 0}` | shortage manifested as stock-outs more than price (modeled) | |
| `inputs.json › corn › trade` | `{"exportShare": 0.15, "exportElasticity": -1.5, "importShare": 0.0}` | ERS Feed Outlook (approximate); ERR-57 App. table 12 | |
| `inputs.json › corn › supply` | `{"model": "crop", "harvestMonth": 10, "stocksToUse": 0.12}` | WASDE (approximate) | |
| `inputs.json › soybeans › demand` | `{"totalElasticity": -0.5}` | ERR-57 soy oil -0.314, soymeal export -1.5 (blended, modeled) | |
| `inputs.json › soybeans › trade` | `{"exportShare": 0.45, "exportElasticity": -1.0, "importShare": 0.0}` | ERS Oil Crops Outlook (approximate); ERR-57 App. table 12 | |
| `inputs.json › soybeans › supply` | `{"model": "crop", "harvestMonth": 10, "stocksToUse": 0.08}` | WASDE (approximate) | |
| `inputs.json › wheat › trade` | `{"exportShare": 0.45, "exportElasticity": -0.7, "importShare": 0.05}` | ERS Wheat Outlook (approximate); ERR-57 App. table 12 | |
| `inputs.json › wheat › supply` | `{"model": "crop", "harvestMonth": 7, "stocksToUse": 0.4}` | WASDE (approximate) | |
| `inputs.json › fertilizer › demand` | `{"totalElasticity": -0.3}` | literature range -0.2 to -0.5 (modeled) | |
| `inputs.json › fertilizer › trade` | `{"exportShare": 0.1, "exportElasticity": -1, "importShare": 0.25}` | USDA/TFI: US imports ~25% of nitrogen use (approximate) | |
| `inputs.json › energy › demand` | `{"totalElasticity": -0.2}` | short-run diesel demand elasticity literature (modeled) | |
| `inputs.json › energy › trade` | `{"exportShare": 0.2, "exportElasticity": -1, "importShare": 0.1}` | EIA (approximate) | |
| `regions.json › us-midwest-corn-belt` | `{"usSupplyShare": {"corn": 0.55, "soybeans": 0.55, "eggs": 0.35, "pork": 0.35, "turkey": 0.35}}` | NASS Crop Production; Chickens and Eggs (IN, OH, PA, IA top layer states) approximate | |
| `regions.json › us-plains-wheat` | `{"usSupplyShare": {"wheat": 0.4, "beef": 0.3}}` | NASS Crop Production hard red winter wheat; cattle on feed (approximate) | |
| `regions.json › us-california-central-valley` | `{"usSupplyShare": {"milk": 0.18, "tomatoes": 0.3, "lettuce": 0.7, "fresh-vegetables": 0.4, "citrus": 0.3, "eggs": 0.04}}` | NASS California Agricultural Statistics (approximate) | |
| `regions.json › us-florida` | `{"usSupplyShare": {"citrus": 0.45, "tomatoes": 0.25, "sugar": 0.2}}` | NASS Citrus Fruits; Vegetables (approximate) | |
| `regions.json › us-pacific-northwest` | `{"usSupplyShare": {"apples": 0.7, "potatoes": 0.55, "wheat": 0.15}}` | NASS Noncitrus Fruits; Potatoes (approximate) | |
| `regions.json › us-southeast-broilers` | `{"usSupplyShare": {"chicken": 0.6, "eggs": 0.15}}` | NASS Poultry Production and Value (approximate) | |
| `regions.json › mexico` | `{"usImportOriginShare": {"tomatoes": 0.9, "fresh-vegetables": 0.7, "sugar": 0.8, "beef": 0.25}}` | USDA FAS GATS (approximate) | |
| `regions.json › canada` | `{"usImportOriginShare": {"beef": 0.3, "pork": 0.6, "wheat": 0.8, "fats-oils": 0.5}}` | USDA FAS GATS (approximate) | |
| `regions.json › brazil` | `{"usImportOriginShare": {"coffee": 0.3, "sugar": 0.1, "eggs": 0.2, "beef": 0.2}, "worldExportShare": {"soybeans": 0.5, "coffee": 0.35, "sugar": 0.4, "chicken": 0.35, "beef": 0.25}}` | USDA FAS PSD; FAS GATS (approximate); USDA Jun 2025 egg imports | |
| `regions.json › central-america-bananas` | `{"usImportOriginShare": {"bananas": 0.95, "coffee": 0.3}}` | USDA FAS GATS (approximate) | |
| `regions.json › black-sea` | `{"usImportOriginShare": {"fertilizer": 0.15}, "worldExportShare": {"wheat": 0.28, "fats-oils": 0.5, "corn": 0.15, "fertilizer": 0.2}}` | USDA FAS PSD 2021/22: Russia+Ukraine ~28% of wheat exports, ~75% sunflower oil; IFPRI fertilizer (approximate) | |
| `regions.json › hormuz` | `{"chokepointImportShare": {"fertilizer": 0.3, "energy": 0.1}}` | IMF PortWatch chokepoint; urea/ammonia seaborne trade share ~30% (IFPRI 2024, approximate) | |
| `regions.json › suez-red-sea` | `{"chokepointImportShare": {"coffee": 0.1, "rice": 0.15, "fats-oils": 0.1}}` | IMF PortWatch; trade routing Asia-Europe-US East Coast (approximate) | |
| `regions.json › panama-canal` | `{"chokepointImportShare": {"bananas": 0.1, "coffee": 0.1}}` | IMF PortWatch (approximate) | |
| `regions.json › vietnam-brazil-coffee` | `{"usImportOriginShare": {"coffee": 0.1}, "worldExportShare": {"coffee": 0.2}}` | USDA FAS Coffee (approximate) | |


## 5. Set up hosting

1. Create a GitHub repository (private is fine) and tell me the remote URL. I will push `main`
   and the working branch.
2. Create a Render account at https://render.com and connect it to the GitHub repo. I will add a
   `Dockerfile` and a `render.yaml`; the first deploy is a one-click "New Web Service" from the repo.
3. Add the `.env` keys as Render environment variables when the service exists (Render dashboard →
   Environment). Never paste keys into the repo.
