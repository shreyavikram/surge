# Origin shares: Census measured vs regions.json

Source: US Census Bureau, USA Trade Online / International Trade API, general imports customs value by country, monthly ([API](https://api.census.gov/data/timeseries/intltrade/imports/hs)).
Window: 2025-08 to 2026-07. Generated 2026-09-06T13:39:35Z. 50 API requests; 0 failed codes.

A share is the origin country's general-imports customs value divided by the world total ("TOTAL FOR ALL COUNTRIES") summed over the window and over the commodity's HS codes. Regional aggregates (OECD, USMCA, EU, 1XXX, ...) are excluded. Origins under 0.5% are not listed, so the remainder is an implied "other". A FLAG marks a difference of more than 0.10 between the value in regions.json and the measured share.

Data file: `packages/config/data/origin-shares.json`.

## Flagged discrepancies (|file - measured| > 0.10), largest first

| # | Commodity | Region | ISO3 | File | Measured | Diff |
|---|---|---|---|---|---|---|
| 1 | turkey | canada | CAN | - | 100.0% | +100.0 pp |
| 2 | lettuce | mexico | MEX | - | 85.4% | +85.4 pp |
| 3 | potatoes | canada | CAN | - | 84.9% | +84.9 pp |
| 4 | sugar | mexico | MEX | 0.80 | 21.6% | -58.4 pp |
| 5 | eggs | turkey | TUR | 0.57 | 2.3% | -54.7 pp |
| 6 | citrus | mexico | MEX | - | 47.7% | +47.7 pp |
| 7 | bread | canada | CAN | - | 47.2% | +47.2 pp |
| 8 | fertilizer | canada | CAN | - | 43.9% | +43.9 pp |
| 9 | soybeans | canada | CAN | - | 42.5% | +42.5 pp |
| 10 | milk | mexico | MEX | - | 40.4% | +40.4 pp |
| 11 | eggs | canada | CAN | - | 37.4% | +37.4 pp |
| 12 | corn | canada | CAN | - | 34.2% | +34.2 pp |
| 13 | chicken | canada | CAN | - | 30.0% | +30.0 pp |
| 14 | fresh-vegetables | canada | CAN | - | 23.8% | +23.8 pp |
| 15 | bread | mexico | MEX | - | 23.1% | +23.1 pp |
| 16 | infant-formula | mexico | MEX | - | 22.8% | +22.8 pp |
| 17 | corn | turkey | TUR | - | 21.6% | +21.6 pp |
| 18 | tomatoes | canada | CAN | - | 20.4% | +20.4 pp |
| 19 | apples | canada | CAN | - | 20.4% | +20.4 pp |
| 20 | wheat | canada | CAN | 0.80 | 97.7% | +17.6 pp |
| 21 | eggs | brazil | BRA | 0.20 | 4.2% | -15.8 pp |
| 22 | coffee | brazil | BRA | 0.30 | 15.2% | -14.8 pp |
| 23 | rice | thailand | THA | 0.45 | 59.7% | +14.7 pp |
| 24 | soybeans | ukraine | UKR | - | 14.5% | +14.5 pp |
| 25 | lettuce | canada | CAN | - | 14.1% | +14.1 pp |
| 26 | pork | mexico | MEX | - | 12.7% | +12.7 pp |
| 27 | tomatoes | mexico | MEX | 0.90 | 78.3% | -11.7 pp |
| 28 | beef | canada | CAN | 0.30 | 18.8% | -11.2 pp |
| 29 | beef | brazil | BRA | 0.20 | 10.0% | -10.1 pp |

## Origins >= 5.0% with no region in regions.json

Countries the app cannot currently place threats on.

| ISO3 | Country | Commodities (measured share) |
|---|---|---|
| CHL | Chile | chicken 69.7%, apples 51.6%, citrus 22.6%, milk 22.3%, corn 11.8% |
| AUS | Australia | beef 28.1%, infant-formula 7.0% |
| ARG | Argentina | soybeans 27.2%, corn 21.0%, sugar 6.0% |
| ITA | Italy | cheese 26.1%, fats-oils 6.8% |
| IRL | Ireland | infant-formula 25.6%, cheese 5.9% |
| NZL | New Zealand | apples 25.0%, beef 10.0% |
| GBR | United Kingdom | infant-formula 22.0%, eggs 17.1% |
| FRA | France | cheese 16.6%, eggs 5.6% |
| ESP | Spain | fats-oils 11.0%, infant-formula 7.9%, cheese 7.2%, pork 5.2% |
| BEL | Belgium | potatoes 10.0% |
| DOM | Dominican Republic | sugar 9.3% |
| CHE | Switzerland | coffee 7.0% |
| PER | Peru | citrus 6.7%, coffee 6.1% |
| NLD | Netherlands | milk 6.6%, cheese 6.3% |
| SLV | El Salvador | sugar 6.6% |
| DNK | Denmark | pork 6.6% |
| ZAF | South Africa | citrus 5.6% |
| SAU | Saudi Arabia | fertilizer 5.2% |
| URY | Uruguay | beef 5.1% |
| QAT | Qatar | fertilizer 5.1% |
| GRC | Greece | cheese 5.0% |

## Per commodity

### eggs

HS 0407, 0408; 12-month general imports $122.1M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Canada | CAN | 37.4% | $45.7M |
| 2 | United Kingdom | GBR | 17.1% | $20.9M |
| 3 | Mexico | MEX | 8.0% | $9.7M |
| 4 | China | CHN | 7.4% | $9.0M |
| 5 | France | FRA | 5.6% | $6.9M |
| 6 | Brazil | BRA | 4.2% | $5.2M |
| 7 | Thailand | THA | 3.8% | $4.7M |
| 8 | Vietnam | VNM | 2.5% | $3.0M |

Listed origins (share >= 0.5%) cover 98.0%; implied other: 2.0%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| brazil | BRA | 0.20 | 4.2% | -15.8 pp | FLAG |
| canada | CAN | - | 37.4% | +37.4 pp | FLAG |
| china | CHN | - | 7.4% | +7.4 pp |  |
| mexico | MEX | - | 8.0% | +8.0 pp |  |
| pakistan | PAK | - | 2.5% | +2.5 pp |  |
| thailand | THA | - | 3.8% | +3.8 pp |  |
| turkey | TUR | 0.57 | 2.3% | -54.7 pp | FLAG |
| vietnam | VNM | - | 2.5% | +2.5 pp |  |

Origins >= 5%% with no region in regions.json: United Kingdom (GBR, 17.1%), France (FRA, 5.6%)

### chicken

HS 020711, 020712, 020713, 020714; 12-month general imports $233.9M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Chile | CHL | 69.7% | $163.1M |
| 2 | Canada | CAN | 30.0% | $70.3M |

Listed origins (share >= 0.5%) cover 99.8%; implied other: 0.2%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| canada | CAN | - | 30.0% | +30.0 pp | FLAG |

Origins >= 5%% with no region in regions.json: Chile (CHL, 69.7%)

### turkey

HS 020724, 020725, 020726, 020727; 12-month general imports $61.7M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Canada | CAN | 100.0% | $61.7M |

Listed origins (share >= 0.5%) cover 100.0%; implied other: 0.0%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| canada | CAN | - | 100.0% | +100.0 pp | FLAG |

### beef

HS 0201, 0202; 12-month general imports $15484.3M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Australia | AUS | 28.1% | $4354.7M |
| 2 | Canada | CAN | 18.8% | $2906.1M |
| 3 | Mexico | MEX | 16.8% | $2604.8M |
| 4 | New Zealand | NZL | 10.0% | $1547.6M |
| 5 | Brazil | BRA | 10.0% | $1541.4M |
| 6 | Uruguay | URY | 5.1% | $793.6M |
| 7 | Argentina | ARG | 4.3% | $664.5M |
| 8 | Nicaragua | NIC | 3.3% | $513.4M |

Listed origins (share >= 0.5%) cover 99.6%; implied other: 0.4%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| brazil | BRA | 0.20 | 10.0% | -10.1 pp | FLAG |
| canada | CAN | 0.30 | 18.8% | -11.2 pp | FLAG |
| costa-rica | CRI | - | 0.6% | +0.6 pp |  |
| mexico | MEX | 0.25 | 16.8% | -8.2 pp |  |

Origins >= 5%% with no region in regions.json: Australia (AUS, 28.1%), New Zealand (NZL, 10.0%), Uruguay (URY, 5.1%)

### pork

HS 0203; 12-month general imports $1506.7M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Canada | CAN | 64.1% | $966.2M |
| 2 | Mexico | MEX | 12.7% | $191.4M |
| 3 | Denmark | DNK | 6.6% | $98.8M |
| 4 | Spain | ESP | 5.2% | $78.0M |
| 5 | Poland | POL | 3.2% | $47.9M |
| 6 | United Kingdom | GBR | 2.2% | $32.8M |
| 7 | Brazil | BRA | 2.2% | $32.7M |
| 8 | Netherlands | NLD | 2.0% | $30.6M |

Listed origins (share >= 0.5%) cover 99.9%; implied other: 0.1%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| brazil | BRA | - | 2.2% | +2.2 pp |  |
| canada | CAN | 0.60 | 64.1% | +4.1 pp |  |
| mexico | MEX | - | 12.7% | +12.7 pp | FLAG |

Origins >= 5%% with no region in regions.json: Denmark (DNK, 6.6%), Spain (ESP, 5.2%)

### milk

HS 0401, 0402; 12-month general imports $268.5M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Mexico | MEX | 40.4% | $108.6M |
| 2 | Chile | CHL | 22.3% | $60.0M |
| 3 | Canada | CAN | 7.1% | $19.0M |
| 4 | Netherlands | NLD | 6.6% | $17.8M |
| 5 | Peru | PER | 3.7% | $10.0M |
| 6 | New Zealand | NZL | 2.6% | $7.1M |
| 7 | Colombia | COL | 2.4% | $6.3M |
| 8 | Ireland | IRL | 2.2% | $5.9M |

Listed origins (share >= 0.5%) cover 95.7%; implied other: 4.3%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| brazil | BRA | - | 1.1% | +1.1 pp |  |
| canada | CAN | - | 7.1% | +7.1 pp |  |
| colombia | COL | - | 2.4% | +2.4 pp |  |
| mexico | MEX | - | 40.4% | +40.4 pp | FLAG |
| pakistan | PAK | - | 1.1% | +1.1 pp |  |
| ukraine | UKR | - | 1.1% | +1.1 pp |  |

Origins >= 5%% with no region in regions.json: Chile (CHL, 22.3%), Netherlands (NLD, 6.6%)

### cheese

HS 0406; 12-month general imports $1700.0M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Italy | ITA | 26.1% | $443.6M |
| 2 | France | FRA | 16.6% | $281.6M |
| 3 | Spain | ESP | 7.2% | $122.4M |
| 4 | Netherlands | NLD | 6.3% | $107.7M |
| 5 | Ireland | IRL | 5.9% | $100.2M |
| 6 | Greece | GRC | 5.0% | $85.2M |
| 7 | Canada | CAN | 4.4% | $75.4M |
| 8 | Switzerland | CHE | 3.7% | $62.3M |

Listed origins (share >= 0.5%) cover 95.4%; implied other: 4.6%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| canada | CAN | - | 4.4% | +4.4 pp |  |
| india | IND | - | 0.6% | +0.6 pp |  |
| mexico | MEX | - | 2.0% | +2.0 pp |  |
| turkey | TUR | - | 1.0% | +1.0 pp |  |

Origins >= 5%% with no region in regions.json: Italy (ITA, 26.1%), France (FRA, 16.6%), Spain (ESP, 7.2%), Netherlands (NLD, 6.3%), Ireland (IRL, 5.9%), Greece (GRC, 5.0%)

### bread

HS 1905; 12-month general imports $11002.1M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Canada | CAN | 47.2% | $5198.4M |
| 2 | Mexico | MEX | 23.1% | $2535.5M |
| 3 | Italy | ITA | 4.7% | $519.6M |
| 4 | France | FRA | 2.6% | $288.8M |
| 5 | Germany | DEU | 1.8% | $203.5M |
| 6 | Belgium | BEL | 1.7% | $181.1M |
| 7 | India | IND | 1.5% | $167.7M |
| 8 | South Korea | KOR | 1.4% | $152.2M |

Listed origins (share >= 0.5%) cover 93.6%; implied other: 6.4%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| canada | CAN | - | 47.2% | +47.2 pp | FLAG |
| china | CHN | - | 0.6% | +0.6 pp |  |
| india | IND | - | 1.5% | +1.5 pp |  |
| mexico | MEX | - | 23.1% | +23.1 pp | FLAG |
| thailand | THA | - | 1.0% | +1.0 pp |  |
| turkey | TUR | - | 0.7% | +0.7 pp |  |

### rice

HS 1006; 12-month general imports $1359.3M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Thailand | THA | 59.7% | $812.0M |
| 2 | India | IND | 23.3% | $316.9M |
| 3 | Pakistan | PAK | 2.6% | $35.3M |
| 4 | Argentina | ARG | 2.4% | $31.9M |
| 5 | China | CHN | 2.3% | $31.8M |
| 6 | Vietnam | VNM | 1.6% | $22.1M |
| 7 | Canada | CAN | 1.6% | $21.8M |
| 8 | Japan | JPN | 1.5% | $19.9M |

Listed origins (share >= 0.5%) cover 97.6%; implied other: 2.4%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| brazil | BRA | - | 0.8% | +0.8 pp |  |
| canada | CAN | - | 1.6% | +1.6 pp |  |
| china | CHN | - | 2.3% | +2.3 pp |  |
| india | IND | 0.30 | 23.3% | -6.7 pp |  |
| pakistan | PAK | 0.05 | 2.6% | -2.4 pp |  |
| thailand | THA | 0.45 | 59.7% | +14.7 pp | FLAG |
| vietnam | VNM | 0.05 | 1.6% | -3.4 pp |  |

### potatoes

HS 0701, 200410; 12-month general imports $2352.6M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Canada | CAN | 84.9% | $1997.4M |
| 2 | Belgium | BEL | 10.0% | $235.2M |
| 3 | Netherlands | NLD | 1.8% | $41.8M |
| 4 | Egypt | EGY | 1.0% | $23.0M |
| 5 | France | FRA | 0.9% | $20.2M |

Listed origins (share >= 0.5%) cover 98.5%; implied other: 1.5%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| canada | CAN | - | 84.9% | +84.9 pp | FLAG |

Origins >= 5%% with no region in regions.json: Belgium (BEL, 10.0%)

### lettuce

HS 0705; 12-month general imports $541.9M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Mexico | MEX | 85.4% | $462.7M |
| 2 | Canada | CAN | 14.1% | $76.5M |

Listed origins (share >= 0.5%) cover 99.5%; implied other: 0.5%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| canada | CAN | - | 14.1% | +14.1 pp | FLAG |
| mexico | MEX | - | 85.4% | +85.4 pp | FLAG |

### tomatoes

HS 0702; 12-month general imports $2920.1M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Mexico | MEX | 78.3% | $2286.9M |
| 2 | Canada | CAN | 20.4% | $596.5M |
| 3 | Guatemala | GTM | 0.8% | $22.4M |

Listed origins (share >= 0.5%) cover 99.5%; implied other: 0.5%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| canada | CAN | - | 20.4% | +20.4 pp | FLAG |
| guatemala | GTM | - | 0.8% | +0.8 pp |  |
| mexico | MEX | 0.90 | 78.3% | -11.7 pp | FLAG |

### fresh-vegetables

HS 0703, 0704, 0706, 0707, 0708, 0709; 12-month general imports $7507.8M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Mexico | MEX | 65.0% | $4881.8M |
| 2 | Canada | CAN | 23.8% | $1785.9M |
| 3 | Peru | PER | 4.2% | $318.8M |
| 4 | Guatemala | GTM | 1.8% | $135.7M |
| 5 | China | CHN | 1.5% | $108.7M |
| 6 | Spain | ESP | 0.8% | $61.8M |
| 7 | Honduras | HND | 0.5% | $41.1M |

Listed origins (share >= 0.5%) cover 97.7%; implied other: 2.3%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| canada | CAN | - | 23.8% | +23.8 pp | FLAG |
| china | CHN | 0.03 | 1.5% | -1.5 pp |  |
| guatemala | GTM | 0.02 | 1.8% | -0.2 pp |  |
| honduras | HND | - | 0.5% | +0.5 pp |  |
| mexico | MEX | 0.70 | 65.0% | -5.0 pp |  |

### apples

HS 080810; 12-month general imports $118.3M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Chile | CHL | 51.6% | $61.1M |
| 2 | New Zealand | NZL | 25.0% | $29.5M |
| 3 | Canada | CAN | 20.4% | $24.1M |
| 4 | China | CHN | 1.1% | $1.3M |
| 5 | Argentina | ARG | 0.9% | $1.0M |
| 6 | Australia | AUS | 0.6% | $0.7M |

Listed origins (share >= 0.5%) cover 99.5%; implied other: 0.5%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| canada | CAN | - | 20.4% | +20.4 pp | FLAG |
| china | CHN | 0.02 | 1.1% | -0.9 pp |  |

Origins >= 5%% with no region in regions.json: Chile (CHL, 51.6%), New Zealand (NZL, 25.0%)

### bananas

HS 0803; 12-month general imports $3134.4M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Guatemala | GTM | 39.4% | $1233.8M |
| 2 | Ecuador | ECU | 20.8% | $650.6M |
| 3 | Colombia | COL | 10.8% | $339.9M |
| 4 | Costa Rica | CRI | 10.2% | $321.0M |
| 5 | Mexico | MEX | 8.1% | $252.5M |
| 6 | Honduras | HND | 7.8% | $245.1M |
| 7 | Panama | PAN | 1.2% | $36.4M |
| 8 | Peru | PER | 1.0% | $32.3M |

Listed origins (share >= 0.5%) cover 99.3%; implied other: 0.7%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| colombia | COL | 0.05 | 10.8% | +5.8 pp |  |
| costa-rica | CRI | 0.15 | 10.2% | -4.8 pp |  |
| ecuador | ECU | 0.20 | 20.8% | +0.8 pp |  |
| guatemala | GTM | 0.35 | 39.4% | +4.4 pp |  |
| honduras | HND | 0.10 | 7.8% | -2.2 pp |  |
| mexico | MEX | - | 8.1% | +8.1 pp |  |

### citrus

HS 0805; 12-month general imports $1880.8M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Mexico | MEX | 47.7% | $897.2M |
| 2 | Chile | CHL | 22.6% | $424.9M |
| 3 | Peru | PER | 6.7% | $125.8M |
| 4 | Colombia | COL | 6.1% | $115.3M |
| 5 | South Africa | ZAF | 5.6% | $104.5M |
| 6 | Morocco | MAR | 4.0% | $74.7M |
| 7 | Argentina | ARG | 2.5% | $48.0M |
| 8 | Uruguay | URY | 1.6% | $29.5M |

Listed origins (share >= 0.5%) cover 98.0%; implied other: 2.0%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| colombia | COL | - | 6.1% | +6.1 pp |  |
| mexico | MEX | - | 47.7% | +47.7 pp | FLAG |

Origins >= 5%% with no region in regions.json: Chile (CHL, 22.6%), Peru (PER, 6.7%), South Africa (ZAF, 5.6%)

### coffee

HS 0901; 12-month general imports $11651.5M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Colombia | COL | 21.4% | $2493.4M |
| 2 | Brazil | BRA | 15.2% | $1768.9M |
| 3 | Honduras | HND | 8.1% | $942.8M |
| 4 | Switzerland | CHE | 7.0% | $817.2M |
| 5 | Mexico | MEX | 6.9% | $798.4M |
| 6 | Guatemala | GTM | 6.6% | $765.7M |
| 7 | Peru | PER | 6.1% | $712.9M |
| 8 | Vietnam | VNM | 4.7% | $542.7M |

Listed origins (share >= 0.5%) cover 96.7%; implied other: 3.3%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| brazil | BRA | 0.30 | 15.2% | -14.8 pp | FLAG |
| canada | CAN | - | 3.6% | +3.6 pp |  |
| colombia | COL | 0.20 | 21.4% | +1.4 pp |  |
| costa-rica | CRI | - | 1.6% | +1.6 pp |  |
| guatemala | GTM | 0.05 | 6.6% | +1.6 pp |  |
| honduras | HND | 0.06 | 8.1% | +2.1 pp |  |
| indonesia | IDN | 0.08 | 3.5% | -4.5 pp |  |
| mexico | MEX | - | 6.9% | +6.9 pp |  |
| vietnam | VNM | 0.10 | 4.7% | -5.3 pp |  |

Origins >= 5%% with no region in regions.json: Switzerland (CHE, 7.0%), Peru (PER, 6.1%)

### sugar

HS 1701; 12-month general imports $1429.5M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Mexico | MEX | 21.6% | $309.3M |
| 2 | Guatemala | GTM | 9.9% | $141.2M |
| 3 | Brazil | BRA | 9.5% | $135.8M |
| 4 | Dominican Republic | DOM | 9.3% | $133.7M |
| 5 | Colombia | COL | 7.4% | $105.3M |
| 6 | El Salvador | SLV | 6.6% | $94.7M |
| 7 | Argentina | ARG | 6.0% | $85.7M |
| 8 | Australia | AUS | 4.6% | $65.9M |

Listed origins (share >= 0.5%) cover 96.8%; implied other: 3.2%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| brazil | BRA | 0.10 | 9.5% | -0.5 pp |  |
| canada | CAN | - | 1.3% | +1.3 pp |  |
| colombia | COL | - | 7.4% | +7.4 pp |  |
| costa-rica | CRI | - | 3.0% | +3.0 pp |  |
| guatemala | GTM | - | 9.9% | +9.9 pp |  |
| honduras | HND | - | 2.4% | +2.4 pp |  |
| mexico | MEX | 0.80 | 21.6% | -58.4 pp | FLAG |
| thailand | THA | - | 0.8% | +0.8 pp |  |

Origins >= 5%% with no region in regions.json: Dominican Republic (DOM, 9.3%), El Salvador (SLV, 6.6%), Argentina (ARG, 6.0%)

### fats-oils

HS 1507, 1508, 1509, 1511, 1512, 1514, 1515; 12-month general imports $9565.4M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Canada | CAN | 43.7% | $4180.6M |
| 2 | Indonesia | IDN | 13.6% | $1303.7M |
| 3 | Spain | ESP | 11.0% | $1052.0M |
| 4 | Italy | ITA | 6.8% | $653.7M |
| 5 | Mexico | MEX | 6.3% | $598.6M |
| 6 | Tunisia | TUN | 4.6% | $439.2M |
| 7 | Malaysia | MYS | 2.1% | $203.9M |
| 8 | Argentina | ARG | 1.5% | $144.5M |

Listed origins (share >= 0.5%) cover 95.1%; implied other: 4.9%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| canada | CAN | 0.50 | 43.7% | -6.3 pp |  |
| china | CHN | 0.02 | 0.0% | -2.0 pp |  |
| indonesia | IDN | 0.15 | 13.6% | -1.4 pp |  |
| india | IND | - | 1.3% | +1.3 pp |  |
| mexico | MEX | - | 6.3% | +6.3 pp |  |
| turkey | TUR | - | 0.8% | +0.8 pp |  |
| ukraine | UKR | 0.05 | 0.8% | -4.2 pp |  |

Origins >= 5%% with no region in regions.json: Spain (ESP, 11.0%), Italy (ITA, 6.8%)

### infant-formula

HS 190110; 12-month general imports $354.7M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Ireland | IRL | 25.6% | $90.8M |
| 2 | Mexico | MEX | 22.8% | $81.0M |
| 3 | United Kingdom | GBR | 22.0% | $78.1M |
| 4 | Spain | ESP | 7.9% | $28.2M |
| 5 | Australia | AUS | 7.0% | $24.7M |
| 6 | Germany | DEU | 3.5% | $12.4M |
| 7 | Netherlands | NLD | 3.4% | $12.0M |
| 8 | Austria | AUT | 3.0% | $10.8M |

Listed origins (share >= 0.5%) cover 99.0%; implied other: 1.0%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| canada | CAN | - | 0.6% | +0.6 pp |  |
| mexico | MEX | - | 22.8% | +22.8 pp | FLAG |

Origins >= 5%% with no region in regions.json: Ireland (IRL, 25.6%), United Kingdom (GBR, 22.0%), Spain (ESP, 7.9%), Australia (AUS, 7.0%)

### fertilizer

HS 3102, 3104, 3105; 12-month general imports $8512.3M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Canada | CAN | 43.9% | $3735.7M |
| 2 | Russia | RUS | 18.9% | $1606.6M |
| 3 | Saudi Arabia | SAU | 5.2% | $445.4M |
| 4 | Qatar | QAT | 5.1% | $434.5M |
| 5 | Algeria | DZA | 2.6% | $223.3M |
| 6 | Mexico | MEX | 2.6% | $223.0M |
| 7 | Trinidad and Tobago | TTO | 2.2% | $186.3M |
| 8 | Oman | OMN | 2.1% | $178.4M |

Listed origins (share >= 0.5%) cover 95.5%; implied other: 4.5%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| canada | CAN | - | 43.9% | +43.9 pp | FLAG |
| china | CHN | 0.05 | 0.0% | -5.0 pp |  |
| mexico | MEX | - | 2.6% | +2.6 pp |  |
| russia | RUS | 0.12 | 18.9% | +6.9 pp |  |

Origins >= 5%% with no region in regions.json: Saudi Arabia (SAU, 5.2%), Qatar (QAT, 5.1%)

### wheat

HS 1001; 12-month general imports $633.8M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Canada | CAN | 97.7% | $618.9M |
| 2 | Poland | POL | 1.4% | $9.0M |
| 3 | Argentina | ARG | 0.7% | $4.6M |

Listed origins (share >= 0.5%) cover 99.8%; implied other: 0.2%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| canada | CAN | 0.80 | 97.7% | +17.6 pp | FLAG |

### corn

HS 1005; 12-month general imports $260.6M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Canada | CAN | 34.2% | $89.1M |
| 2 | Turkey | TUR | 21.6% | $56.4M |
| 3 | Argentina | ARG | 21.0% | $54.7M |
| 4 | Chile | CHL | 11.8% | $30.7M |
| 5 | Brazil | BRA | 3.4% | $8.8M |
| 6 | France | FRA | 2.5% | $6.5M |
| 7 | Peru | PER | 2.5% | $6.4M |
| 8 | Mexico | MEX | 2.4% | $6.2M |

Listed origins (share >= 0.5%) cover 99.3%; implied other: 0.7%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| brazil | BRA | - | 3.4% | +3.4 pp |  |
| canada | CAN | - | 34.2% | +34.2 pp | FLAG |
| mexico | MEX | - | 2.4% | +2.4 pp |  |
| turkey | TUR | - | 21.6% | +21.6 pp | FLAG |

Origins >= 5%% with no region in regions.json: Argentina (ARG, 21.0%), Chile (CHL, 11.8%)

### soybeans

HS 1201; 12-month general imports $354.3M.

| # | Origin | ISO3 | Share | Value |
|---|---|---|---|---|
| 1 | Canada | CAN | 42.5% | $150.5M |
| 2 | Argentina | ARG | 27.2% | $96.2M |
| 3 | Ukraine | UKR | 14.5% | $51.4M |
| 4 | Turkey | TUR | 7.3% | $26.0M |
| 5 | Uruguay | URY | 3.8% | $13.5M |
| 6 | Russia | RUS | 2.8% | $9.7M |
| 7 | Chile | CHL | 0.9% | $3.4M |
| 8 | China | CHN | 0.6% | $2.1M |

Listed origins (share >= 0.5%) cover 99.6%; implied other: 0.4%.

regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):

| Region | ISO3 | File | Measured | Diff | |
|---|---|---|---|---|---|
| canada | CAN | - | 42.5% | +42.5 pp | FLAG |
| china | CHN | - | 0.6% | +0.6 pp |  |
| russia | RUS | - | 2.8% | +2.8 pp |  |
| turkey | TUR | - | 7.3% | +7.3 pp |  |
| ukraine | UKR | - | 14.5% | +14.5 pp | FLAG |

Origins >= 5%% with no region in regions.json: Argentina (ARG, 27.2%)

