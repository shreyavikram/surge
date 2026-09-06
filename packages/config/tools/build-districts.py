#!/usr/bin/env python3
"""Build congressional-district focus data from public sources.

Outputs:
  packages/config/data/focus-districts.json   areas (kind=district) + production shares per commodity (district and state)
  apps/web/public/geo/cd119.geojson            generalized 119th Congress district boundaries (TIGERweb)
  apps/web/public/geo/states.geojson           generalized state boundaries (TIGERweb)

Sources:
  NASS QuickStats, 2022 Census of Agriculture, county level (NASS_API_KEY in .env)
  Census county→CD119 relationship file (land-area parts allocate county output to districts)
  Census TIGERweb Legislative/State_County map services (no key)
  District population = state population ÷ districts (districts are drawn to equal population); income = state median,
  until a Census API key is available (CENSUS_API_KEY) — then ACS 1-yr B01003/B19013 per district.
"""
import json, os, sys, time, urllib.request, urllib.parse, csv, io

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
def env(k):
    v = os.environ.get(k)
    if v: return v
    try:
        for line in open(os.path.join(ROOT, '.env')):
            if line.startswith(k + '='): return line.strip().split('=', 1)[1]
    except FileNotFoundError: pass
    return None

NASS_KEY = env('NASS_API_KEY'); CENSUS_KEY = env('CENSUS_API_KEY')
if not NASS_KEY: sys.exit('NASS_API_KEY missing')

import hashlib
CACHE = os.path.join(ROOT, 'packages/config/tools/cache'); os.makedirs(CACHE, exist_ok=True)
def get(url, tries=3, cache=True):
    key = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest())
    if cache and os.path.exists(key): return open(key, 'rb').read()
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'SURGE/0.1'}), timeout=300) as r:
                data = r.read()
                if cache: open(key, 'wb').write(data)
                return data
        except urllib.error.HTTPError as e:
            if e.code == 400: print('no data (400) for', url[-120:], file=sys.stderr); return b'{"data":[]}'
            print('retry', i, url[:100], e, file=sys.stderr); time.sleep(3 * (i + 1))
        except Exception as e:
            print('retry', i, url[:100], e, file=sys.stderr); time.sleep(3 * (i + 1))
    raise SystemExit('failed ' + url[:120])

# 1. crosswalk county → CD119 by land-area part
print('crosswalk…', file=sys.stderr)
xw = get('https://www2.census.gov/geo/docs/maps-data/data/rel2020/cd-sld/tab20_cd11920_county20_natl.txt').decode('utf-8-sig')
parts = {}  # county geoid → list of (cd geoid, share)
for row in csv.DictReader(io.StringIO(xw), delimiter='|'):
    cd, county = row['GEOID_CD119_20'], row['GEOID_COUNTY_20']
    if not cd or not county or cd.endswith('ZZ'): continue
    land_part = float(row['AREALAND_PART'] or 0); land_county = float(row['AREALAND_COUNTY_20'] or 0)
    share = land_part / land_county if land_county > 0 else 0
    parts.setdefault(county, []).append((cd, share))
for county, lst in parts.items():
    tot = sum(s for _, s in lst)
    parts[county] = [(cd, s / tot) for cd, s in lst] if tot > 0 else [(cd, 1 / len(lst)) for cd, _ in lst]
print('counties in crosswalk', len(parts), file=sys.stderr)

# 2. NASS county series (2022 Census of Agriculture)
SERIES = {
  'eggs': ['CHICKENS, LAYERS - INVENTORY'],
  'chicken': ['CHICKENS, BROILERS - SALES, MEASURED IN HEAD'],
  'turkey': ['TURKEYS - SALES, MEASURED IN HEAD'],
  'beef': ['CATTLE, INCL CALVES - INVENTORY'],
  'pork': ['HOGS - INVENTORY'],
  'milk': ['CATTLE, COWS, MILK - INVENTORY'],
  'cheese': ['CATTLE, COWS, MILK - INVENTORY'],
  'milk-farm': ['CATTLE, COWS, MILK - INVENTORY'],
  'bread': ['WHEAT - PRODUCTION, MEASURED IN BU'],
  'wheat': ['WHEAT - PRODUCTION, MEASURED IN BU'],
  'rice': ['RICE - PRODUCTION, MEASURED IN CWT', 'RICE - ACRES HARVESTED'],
  'potatoes': ['POTATOES - PRODUCTION, MEASURED IN CWT', 'POTATOES - ACRES HARVESTED'],
  'lettuce': ['LETTUCE - ACRES HARVESTED'],
  'tomatoes': ['TOMATOES - ACRES HARVESTED'],
  'fresh-vegetables': ['VEGETABLE TOTALS - ACRES HARVESTED'],
  'apples': ['APPLES - ACRES BEARING & NON-BEARING'],
  'citrus': ['ORANGES - ACRES BEARING & NON-BEARING', 'GRAPEFRUIT - ACRES BEARING & NON-BEARING'],
  'sugar': ['SUGARBEETS - PRODUCTION, MEASURED IN TONS', 'SUGARCANE - PRODUCTION, MEASURED IN TONS', 'SUGARBEETS - ACRES HARVESTED', 'SUGARCANE - ACRES HARVESTED'],
  'fats-oils': ['SOYBEANS - PRODUCTION, MEASURED IN BU'],
  'soybeans': ['SOYBEANS - PRODUCTION, MEASURED IN BU'],
  'corn': ['CORN, GRAIN - PRODUCTION, MEASURED IN BU'],
}
def nass(short_desc):
    q = urllib.parse.urlencode({'key': NASS_KEY, 'source_desc': 'CENSUS', 'year': '2022', 'agg_level_desc': 'COUNTY', 'short_desc': short_desc, 'domain_desc': 'TOTAL', 'format': 'JSON'})
    raw = get('https://quickstats.nass.usda.gov/api/api_GET/?' + q)
    try: rows = json.loads(raw).get('data', [])
    except Exception as e:
        print('bad json for', short_desc, str(e)[:80], file=sys.stderr); return {}
    out = {}
    for r in rows:
        v = (r.get('Value') or '').replace(',', '').strip()
        if not v or v.startswith('('): continue  # (D) withheld → 0 (documented)
        geoid = r.get('state_ansi', '') + r.get('county_ansi', '')
        if len(geoid) != 5: continue
        out[geoid] = out.get(geoid, 0) + float(v)
    return out

county_by_commodity = {}
for cid, descs in SERIES.items():
    acc = {}
    for d in descs:
        print('NASS', cid, d, file=sys.stderr)
        got = nass(d)
        for g, v in got.items(): acc[g] = acc.get(g, 0) + v
        time.sleep(1)
        if got and cid not in ('sugar', 'citrus'): break  # first description with data wins
    county_by_commodity[cid] = acc
    print('  counties', len(acc), 'total', sum(acc.values()), file=sys.stderr)

# 3. allocate to districts and states
prod_district, prod_state = {}, {}
for cid, counties in county_by_commodity.items():
    d, s = {}, {}
    tot = sum(counties.values())
    for geoid, v in counties.items():
        st = geoid[:2]
        s[st] = s.get(st, 0) + v
        for cd, share in parts.get(geoid, []):
            d[cd] = d.get(cd, 0) + v * share
    if tot > 0:
        prod_district[cid] = {k: round(v / tot, 6) for k, v in d.items() if v / tot >= 1e-5}
        prod_state[cid] = {k: round(v / tot, 6) for k, v in s.items()}

# 4. geometries
print('TIGERweb districts…', file=sys.stderr)
def tiger(layer_url, out_fields):
    feats = []
    offset = 0
    while True:
        q = urllib.parse.urlencode({'where': '1=1', 'outFields': out_fields, 'f': 'geojson', 'geometryPrecision': 3, 'maxAllowableOffset': 0.03, 'resultOffset': offset, 'resultRecordCount': 500})
        d = json.loads(get(layer_url + '/query?' + q))
        f = d.get('features', [])
        feats.extend(f)
        if len(f) < 500: break
        offset += 500
    return feats
cd_feats = tiger('https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/4', 'GEOID,STATE,BASENAME,NAME,CENTLAT,CENTLON')
st_feats = tiger('https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0', 'GEOID,STUSAB,NAME,CENTLAT,CENTLON')
print('districts', len(cd_feats), 'states', len(st_feats), file=sys.stderr)

FIPS = {f['properties']['GEOID']: f['properties']['STUSAB'] for f in st_feats}
focus = json.load(open(os.path.join(ROOT, 'packages/config/data/focus.json')))
state_info = {a['id']: a for a in focus['areas'] if a['kind'] == 'state'}
by_state_count = {}
for f in cd_feats: by_state_count[f['properties']['STATE']] = by_state_count.get(f['properties']['STATE'], 0) + 1

# optional ACS per district
acs = {}
if CENSUS_KEY:
    try:
        d = json.loads(get(f'https://api.census.gov/data/2023/acs/acs1?get=NAME,B01003_001E,B19013_001E&for=congressional%20district:*&key={CENSUS_KEY}'))
        for row in d[1:]:
            acs[row[3] + row[4]] = (float(row[1]), float(row[2]) if row[2] not in (None, '', '-666666666') else None)
        print('ACS districts', len(acs), file=sys.stderr)
    except Exception as e:
        print('ACS failed', e, file=sys.stderr)

areas = []
for f in cd_feats:
    p = f['properties']; fips = p['STATE']; st = FIPS.get(fips)
    if not st or st not in state_info: continue
    info = state_info[st]
    num = p['BASENAME']
    if not num.isdigit(): continue  # territories / undefined
    did = f"{st}-{'AL' if num in ('00', '98') else num.zfill(2)}"
    n = by_state_count.get(fips, 1)
    pop, inc = acs.get(p['GEOID'], (None, None))
    areas.append({'id': did, 'name': f"{info['name']} {'at-large' if did.endswith('AL') else 'district ' + str(int(num))}", 'state': st, 'kind': 'district',
                  'population': int(pop) if pop else int(info['population'] / n), 'medianIncome': int(inc) if inc else info['medianIncome'],
                  'region': info['region'], 'lat': float(p['CENTLAT']), 'lng': float(p['CENTLON'])})
    f['properties'] = {'id': did, 'name': areas[-1]['name'], 'state': st}
    f['id'] = did
for f in st_feats:
    p = f['properties']; f['properties'] = {'id': p['STUSAB'], 'name': p['NAME']}; f['id'] = p['STUSAB']

# district production keyed by district id (same rule as above)
cd_feats = [f for f in cd_feats if f['properties'].get('id')]
def did_for(geoid):
    fips, num = geoid[:2], geoid[2:]
    st = FIPS.get(fips)
    if not st or not num.isdigit(): return None
    return f"{st}-{'AL' if num in ('00', '98') else num.zfill(2)}"
production = {}
for cid, m in prod_district.items():
    production[cid] = {}
    for geoid, v in m.items():
        did = did_for(geoid)
        if did: production[cid][did] = production[cid].get(did, 0) + v
    for st, v in prod_state.get(cid, {}).items():
        code = FIPS.get(st)
        if code: production[cid][code] = v

out = {'source': 'NASS 2022 Census of Agriculture county series allocated to 119th Congress districts by county land-area share (Census rel2020 crosswalk); (D) withheld cells treated as 0; population per district = state population ÷ districts unless ACS 1-yr 2023 available; geometry TIGERweb generalized',
       'series': SERIES, 'areas': areas, 'production': production}
json.dump(out, open(os.path.join(ROOT, 'packages/config/data/focus-districts.json'), 'w'), separators=(',', ':'))
json.dump({'type': 'FeatureCollection', 'features': cd_feats}, open(os.path.join(ROOT, 'apps/web/public/geo/cd119.geojson'), 'w'), separators=(',', ':'))
json.dump({'type': 'FeatureCollection', 'features': st_feats}, open(os.path.join(ROOT, 'apps/web/public/geo/states.geojson'), 'w'), separators=(',', ':'))
print('wrote focus-districts.json with', len(areas), 'districts and', len(production), 'commodities', file=sys.stderr)
