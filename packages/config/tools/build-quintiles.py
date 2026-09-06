#!/usr/bin/env python3
"""Household spending by income quintile per commodity, from BLS CEX via FRED (no key needed).
Writes packages/config/data/quintile-spending.json: commodity id → [Q1..Q5] annual USD per consumer unit."""
import json, os, urllib.request, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
CATS = {  # CEX category → FRED series stem
  'eggs': 'CXU080110', 'beef': 'CXUBEEF', 'pork': 'CXUPORK', 'poultry': 'CXUPOULTRY', 'dairy': 'CXUDAIRY',
  'cereals': 'CXUCERBAKRY', 'fresh_fruit': 'CXUFRSHFRUT', 'fresh_veg': 'CXUFRESHVEG', 'fats_oils': 'CXUFATSOILS', 'sweets': 'CXUSWEETS', 'food_home': 'CXUFOODHOME',
}
MAP = {  # commodity → CEX category
  'eggs': 'eggs', 'chicken': 'poultry', 'turkey': 'poultry', 'beef': 'beef', 'pork': 'pork', 'milk': 'dairy', 'cheese': 'dairy',
  'bread': 'cereals', 'rice': 'cereals', 'potatoes': 'fresh_veg', 'lettuce': 'fresh_veg', 'tomatoes': 'fresh_veg', 'fresh-vegetables': 'fresh_veg',
  'apples': 'fresh_fruit', 'bananas': 'fresh_fruit', 'citrus': 'fresh_fruit', 'coffee': 'food_home', 'sugar': 'sweets', 'fats-oils': 'fats_oils', 'infant-formula': 'food_home',
}
def latest(series):
    url = f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}'
    txt = urllib.request.urlopen(url, timeout=60).read().decode()
    rows = [l.split(',') for l in txt.strip().split('\n')[1:] if ',' in l and not l.endswith(',.')]
    return (rows[-1][0][:4], float(rows[-1][1])) if rows else (None, None)
out = {'source': 'BLS Consumer Expenditure Survey via FRED (CXU… LB0102M–LB0106M, quintiles of income before taxes), latest year', 'year': None, 'categories': {}, 'byCommodity': {}}
for cat, stem in CATS.items():
    vals = []
    for q in range(2, 7):
        y, v = latest(f'{stem}LB010{q}M')
        if v is None: break
        vals.append(v); out['year'] = out['year'] or y
    if len(vals) == 5: out['categories'][cat] = vals
    print(cat, vals, file=sys.stderr)
for cid, cat in MAP.items():
    if cat in out['categories']: out['byCommodity'][cid] = out['categories'][cat]
json.dump(out, open(os.path.join(ROOT, 'packages/config/data/quintile-spending.json'), 'w'), indent=1)
print('wrote', len(out['byCommodity']), 'commodities, year', out['year'], file=sys.stderr)
