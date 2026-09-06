#!/usr/bin/env python3
"""Measure which countries the US imports each food commodity from, using the
Census Bureau International Trade API (monthly general imports, customs value,
by country of origin), so the hand-entered usImportOriginShare numbers in
packages/config/data/regions.json can be checked and later replaced.

Outputs:
  packages/config/data/origin-shares.json        measured origin shares per commodity over a 12-month window
  packages/config/tools/origin-shares-report.md  comparison against regions.json usImportOriginShare

Usage:  python3 packages/config/tools/build-origin-shares.py
Needs CENSUS_API_KEY in the environment or in <repo>/.env (the key is never printed).

Method: for every HS code of a commodity, fetch GEN_VAL_MO (general imports, customs
value, USD) for every country and month in the window, sum across months and codes,
and divide each country by the world total (the CTY_CODE "-" rows).  Regional
aggregates (OECD, USMCA, 1XXX, ...) are dropped; only 4-digit Schedule C country
codes whose first digit is 1-7 are countries.  Origins under 0.5% are folded into
an implied "other" remainder.  Stdlib only; ~2 requests per second; one retry on 5xx.
"""
import json, os, sys, time, urllib.request, urllib.parse, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
DATA = os.path.join(ROOT, 'packages', 'config', 'data')
OUT_JSON = os.path.join(DATA, 'origin-shares.json')
OUT_MD = os.path.join(ROOT, 'packages', 'config', 'tools', 'origin-shares-report.md')
REGIONS = os.path.join(DATA, 'regions.json')

BASE = 'https://api.census.gov/data/timeseries/intltrade/imports/hs'
SOURCE = ('US Census Bureau, USA Trade Online / International Trade API, '
          'general imports customs value by country, monthly')
MIN_SHARE = 0.005       # origins below this are not listed (implied "other")
FLAG_DIFF = 0.10        # |regions.json - measured| above this is flagged
UNPLACED_SHARE = 0.05   # origins at/above this with no region are listed
MIN_INTERVAL = 0.5      # seconds between request starts (~2 per second)
PROBE_MONTHS = 8        # how far back to look for the latest published month
WINDOW_MONTHS = 12

# commodity id (as in commodities.json / regions.json) -> HS codes (4-digit => HS4, 6-digit => HS6)
HS = {
    'eggs': ['0407', '0408'],
    'chicken': ['020711', '020712', '020713', '020714'],
    'turkey': ['020724', '020725', '020726', '020727'],
    'beef': ['0201', '0202'],
    'pork': ['0203'],
    'milk': ['0401', '0402'],
    'cheese': ['0406'],
    'bread': ['1905'],
    'rice': ['1006'],
    'potatoes': ['0701', '200410'],
    'lettuce': ['0705'],
    'tomatoes': ['0702'],
    'fresh-vegetables': ['0703', '0704', '0706', '0707', '0708', '0709'],
    'apples': ['080810'],
    'bananas': ['0803'],
    'citrus': ['0805'],
    'coffee': ['0901'],
    'sugar': ['1701'],
    'fats-oils': ['1507', '1508', '1509', '1511', '1512', '1514', '1515'],
    'infant-formula': ['190110'],
    'fertilizer': ['3102', '3104', '3105'],
    'wheat': ['1001'],
    'corn': ['1005'],
    'soybeans': ['1201'],
}

# Census Schedule C country code -> (ISO3, English name, CTY_NAME exactly as the API returns it).
# Every code below was observed in API responses for the HS codes above (2025-08..2026-07); the
# API name is re-checked at run time, and a code whose name no longer matches is treated as unmapped.
CENSUS = {
    # North America
    '1220': ('CAN', 'Canada', 'CANADA'),
    # Central America and Caribbean
    '2010': ('MEX', 'Mexico', 'MEXICO'),
    '2050': ('GTM', 'Guatemala', 'GUATEMALA'),
    '2080': ('BLZ', 'Belize', 'BELIZE'),
    '2110': ('SLV', 'El Salvador', 'EL SALVADOR'),
    '2150': ('HND', 'Honduras', 'HONDURAS'),
    '2190': ('NIC', 'Nicaragua', 'NICARAGUA'),
    '2230': ('CRI', 'Costa Rica', 'COSTA RICA'),
    '2250': ('PAN', 'Panama', 'PANAMA'),
    '2360': ('BHS', 'Bahamas', 'BAHAMAS'),
    '2410': ('JAM', 'Jamaica', 'JAMAICA'),
    '2430': ('TCA', 'Turks and Caicos Islands', 'TURKS AND CAICOS ISLANDS'),
    '2440': ('CYM', 'Cayman Islands', 'CAYMAN ISLANDS'),
    '2450': ('HTI', 'Haiti', 'HAITI'),
    '2470': ('DOM', 'Dominican Republic', 'DOMINICAN REPUBLIC'),
    '2484': ('ATG', 'Antigua and Barbuda', 'ANTIGUA AND BARBUDA'),
    '2486': ('DMA', 'Dominica', 'DOMINICA'),
    '2487': ('LCA', 'Saint Lucia', 'ST LUCIA'),
    '2489': ('GRD', 'Grenada', 'GRENADA'),
    '2720': ('BRB', 'Barbados', 'BARBADOS'),
    '2740': ('TTO', 'Trinidad and Tobago', 'TRINIDAD AND TOBAGO'),
    # South America
    '3010': ('COL', 'Colombia', 'COLOMBIA'),
    '3070': ('VEN', 'Venezuela', 'VENEZUELA'),
    '3120': ('GUY', 'Guyana', 'GUYANA'),
    '3310': ('ECU', 'Ecuador', 'ECUADOR'),
    '3330': ('PER', 'Peru', 'PERU'),
    '3350': ('BOL', 'Bolivia', 'BOLIVIA'),
    '3370': ('CHL', 'Chile', 'CHILE'),
    '3510': ('BRA', 'Brazil', 'BRAZIL'),
    '3530': ('PRY', 'Paraguay', 'PARAGUAY'),
    '3550': ('URY', 'Uruguay', 'URUGUAY'),
    '3570': ('ARG', 'Argentina', 'ARGENTINA'),
    # Europe
    '4000': ('ISL', 'Iceland', 'ICELAND'),
    '4010': ('SWE', 'Sweden', 'SWEDEN'),
    '4039': ('NOR', 'Norway', 'NORWAY'),
    '4050': ('FIN', 'Finland', 'FINLAND'),
    '4099': ('DNK', 'Denmark', 'DENMARK'),
    '4120': ('GBR', 'United Kingdom', 'UNITED KINGDOM'),
    '4190': ('IRL', 'Ireland', 'IRELAND'),
    '4210': ('NLD', 'Netherlands', 'NETHERLANDS'),
    '4231': ('BEL', 'Belgium', 'BELGIUM'),
    '4239': ('LUX', 'Luxembourg', 'LUXEMBOURG'),
    '4272': ('MCO', 'Monaco', 'MONACO'),
    '4279': ('FRA', 'France', 'FRANCE'),
    '4280': ('DEU', 'Germany', 'GERMANY'),
    '4330': ('AUT', 'Austria', 'AUSTRIA'),
    '4351': ('CZE', 'Czech Republic', 'CZECH REPUBLIC'),
    '4359': ('SVK', 'Slovakia', 'SLOVAKIA'),
    '4370': ('HUN', 'Hungary', 'HUNGARY'),
    '4419': ('CHE', 'Switzerland', 'SWITZERLAND'),
    '4470': ('EST', 'Estonia', 'ESTONIA'),
    '4490': ('LVA', 'Latvia', 'LATVIA'),
    '4510': ('LTU', 'Lithuania', 'LITHUANIA'),
    '4550': ('POL', 'Poland', 'POLAND'),
    '4621': ('RUS', 'Russia', 'RUSSIA'),
    '4622': ('BLR', 'Belarus', 'BELARUS'),
    '4623': ('UKR', 'Ukraine', 'UKRAINE'),
    '4631': ('ARM', 'Armenia', 'ARMENIA'),
    '4632': ('AZE', 'Azerbaijan', 'AZERBAIJAN'),
    '4633': ('GEO', 'Georgia', 'GEORGIA'),
    '4634': ('KAZ', 'Kazakhstan', 'KAZAKHSTAN'),
    '4635': ('KGZ', 'Kyrgyzstan', 'KYRGYZSTAN'),
    '4641': ('MDA', 'Moldova', 'MOLDOVA'),
    '4642': ('TJK', 'Tajikistan', 'TAJIKISTAN'),
    '4643': ('TKM', 'Turkmenistan', 'TURKMENISTAN'),
    '4644': ('UZB', 'Uzbekistan', 'UZBEKISTAN'),
    '4700': ('ESP', 'Spain', 'SPAIN'),
    '4710': ('PRT', 'Portugal', 'PORTUGAL'),
    '4730': ('MLT', 'Malta', 'MALTA'),
    '4751': ('SMR', 'San Marino', 'SAN MARINO'),
    '4759': ('ITA', 'Italy', 'ITALY'),
    '4791': ('HRV', 'Croatia', 'CROATIA'),
    '4792': ('SVN', 'Slovenia', 'SLOVENIA'),
    '4793': ('BIH', 'Bosnia and Herzegovina', 'BOSNIA AND HERZEGOVINA'),
    '4794': ('MKD', 'North Macedonia', 'NORTH MACEDONIA'),
    '4801': ('SRB', 'Serbia', 'SERBIA'),
    '4803': ('XKX', 'Kosovo', 'KOSOVO'),
    '4810': ('ALB', 'Albania', 'ALBANIA'),
    '4840': ('GRC', 'Greece', 'GREECE'),
    '4850': ('ROU', 'Romania', 'ROMANIA'),
    '4870': ('BGR', 'Bulgaria', 'BULGARIA'),
    '4890': ('TUR', 'Turkey', 'TURKEY'),
    '4910': ('CYP', 'Cyprus', 'CYPRUS'),
    # Asia and Middle East
    '5020': ('SYR', 'Syria', 'SYRIA'),
    '5040': ('LBN', 'Lebanon', 'LEBANON'),
    '5050': ('IRQ', 'Iraq', 'IRAQ'),
    '5081': ('ISR', 'Israel', 'ISRAEL'),
    '5083': ('PSE', 'West Bank', 'WEST BANK ADMINISTERED BY ISRAEL'),
    '5110': ('JOR', 'Jordan', 'JORDAN'),
    '5130': ('KWT', 'Kuwait', 'KUWAIT'),
    '5170': ('SAU', 'Saudi Arabia', 'SAUDI ARABIA'),
    '5180': ('QAT', 'Qatar', 'QATAR'),
    '5200': ('ARE', 'United Arab Emirates', 'UNITED ARAB EMIRATES'),
    '5210': ('YEM', 'Yemen', 'YEMEN'),
    '5230': ('OMN', 'Oman', 'OMAN'),
    '5250': ('BHR', 'Bahrain', 'BAHRAIN'),
    '5310': ('AFG', 'Afghanistan', 'AFGHANISTAN'),
    '5330': ('IND', 'India', 'INDIA'),
    '5350': ('PAK', 'Pakistan', 'PAKISTAN'),
    '5360': ('NPL', 'Nepal', 'NEPAL'),
    '5380': ('BGD', 'Bangladesh', 'BANGLADESH'),
    '5420': ('LKA', 'Sri Lanka', 'SRI LANKA'),
    '5460': ('MMR', 'Myanmar', 'BURMA'),
    '5490': ('THA', 'Thailand', 'THAILAND'),
    '5520': ('VNM', 'Vietnam', 'VIETNAM'),
    '5530': ('LAO', 'Laos', 'LAOS'),
    '5550': ('KHM', 'Cambodia', 'CAMBODIA'),
    '5570': ('MYS', 'Malaysia', 'MALAYSIA'),
    '5590': ('SGP', 'Singapore', 'SINGAPORE'),
    '5600': ('IDN', 'Indonesia', 'INDONESIA'),
    '5601': ('TLS', 'Timor-Leste', 'TIMOR-LESTE'),
    '5650': ('PHL', 'Philippines', 'PHILIPPINES'),
    '5660': ('MAC', 'Macau', 'MACAU'),
    '5700': ('CHN', 'China', 'CHINA'),
    '5740': ('MNG', 'Mongolia', 'MONGOLIA'),
    '5800': ('KOR', 'South Korea', 'KOREA, SOUTH'),
    '5820': ('HKG', 'Hong Kong', 'HONG KONG'),
    '5830': ('TWN', 'Taiwan', 'TAIWAN'),
    '5880': ('JPN', 'Japan', 'JAPAN'),
    # Oceania
    '6021': ('AUS', 'Australia', 'AUSTRALIA'),
    '6040': ('PNG', 'Papua New Guinea', 'PAPUA NEW GUINEA'),
    '6141': ('NZL', 'New Zealand', 'NEW ZEALAND'),
    '6224': ('VUT', 'Vanuatu', 'VANUATU'),
    '6414': ('PYF', 'French Polynesia', 'FRENCH POLYNESIA'),
    '6820': ('FSM', 'Micronesia', 'MICRONESIA'),
    '6863': ('FJI', 'Fiji', 'FIJI'),
    '6864': ('TON', 'Tonga', 'TONGA'),
    # Africa
    '7140': ('MAR', 'Morocco', 'MOROCCO'),
    '7210': ('DZA', 'Algeria', 'ALGERIA'),
    '7230': ('TUN', 'Tunisia', 'TUNISIA'),
    '7290': ('EGY', 'Egypt', 'EGYPT'),
    '7420': ('CMR', 'Cameroon', 'CAMEROON'),
    '7440': ('SEN', 'Senegal', 'SENEGAL'),
    '7460': ('GIN', 'Guinea', 'GUINEA'),
    '7470': ('SLE', 'Sierra Leone', 'SIERRA LEONE'),
    '7480': ('CIV', 'Ivory Coast', "COTE D'IVOIRE"),
    '7490': ('GHA', 'Ghana', 'GHANA'),
    '7500': ('GMB', 'Gambia', 'GAMBIA'),
    '7520': ('TGO', 'Togo', 'TOGO'),
    '7530': ('NGA', 'Nigeria', 'NIGERIA'),
    '7550': ('GAB', 'Gabon', 'GABON'),
    '7600': ('BFA', 'Burkina Faso', 'BURKINA FASO'),
    '7610': ('BEN', 'Benin', 'BENIN'),
    '7620': ('AGO', 'Angola', 'ANGOLA'),
    '7630': ('COG', 'Republic of the Congo', 'CONGO'),
    '7643': ('CPV', 'Cabo Verde', 'CABO VERDE'),
    '7650': ('LBR', 'Liberia', 'LIBERIA'),
    '7660': ('COD', 'Democratic Republic of the Congo', 'DEMOCRATIC REPUBLIC OF THE CONGO'),
    '7670': ('BDI', 'Burundi', 'BURUNDI'),
    '7690': ('RWA', 'Rwanda', 'RWANDA'),
    '7700': ('SOM', 'Somalia', 'SOMALIA'),
    '7749': ('ETH', 'Ethiopia', 'ETHIOPIA'),
    '7770': ('DJI', 'Djibouti', 'DJIBOUTI'),
    '7780': ('UGA', 'Uganda', 'UGANDA'),
    '7790': ('KEN', 'Kenya', 'KENYA'),
    '7830': ('TZA', 'Tanzania', 'TANZANIA'),
    '7850': ('MUS', 'Mauritius', 'MAURITIUS'),
    '7870': ('MOZ', 'Mozambique', 'MOZAMBIQUE'),
    '7880': ('MDG', 'Madagascar', 'MADAGASCAR'),
    '7904': ('REU', 'Reunion', 'REUNION'),
    '7910': ('ZAF', 'South Africa', 'SOUTH AFRICA'),
    '7920': ('NAM', 'Namibia', 'NAMIBIA'),
    '7940': ('ZMB', 'Zambia', 'ZAMBIA'),
    '7950': ('SWZ', 'Eswatini', 'ESWATINI'),
    '7960': ('ZWE', 'Zimbabwe', 'ZIMBABWE'),
    '7970': ('MWI', 'Malawi', 'MALAWI'),
}


# ---------------------------------------------------------------- helpers
def log(msg):
    print(msg, file=sys.stderr, flush=True)


def env(k):
    v = os.environ.get(k)
    if v:
        return v
    try:
        for line in open(os.path.join(ROOT, '.env')):
            line = line.strip()
            if line.startswith(k + '='):
                return line.split('=', 1)[1].strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return None


KEY = env('CENSUS_API_KEY')
if not KEY:
    sys.exit('CENSUS_API_KEY missing (set it in the environment or in .env)')


def redact(s):
    return str(s).replace(KEY, '***')


def month_add(ym, n):
    y, m = int(ym[:4]), int(ym[5:7])
    i = y * 12 + (m - 1) + n
    return '%04d-%02d' % (i // 12, i % 12 + 1)


def is_country(code):
    """Schedule C country codes are 4 digits starting 1-7; 0xxx and NXXX are aggregates."""
    return len(code) == 4 and code.isdigit() and code[0] in '1234567'


def norm(s):
    return ' '.join(str(s).upper().split())


SMALL_WORDS = {'and', 'of', 'the', 'by'}


def title_case(s):
    words = str(s).lower().replace(',', ' ').split()
    return ' '.join(w if (i and w in SMALL_WORDS) else w.capitalize() for i, w in enumerate(words))


# ---------------------------------------------------------------- API
REQUESTS = 0
_last_request = 0.0


def request(params):
    """One API call, rate limited. Returns (status, body) or (None, reason). Retries once on 5xx / network error."""
    global REQUESTS, _last_request
    url = BASE + '?' + urllib.parse.urlencode(dict(params, key=KEY))
    for attempt in (1, 2):
        wait = MIN_INTERVAL - (time.time() - _last_request)
        if wait > 0:
            time.sleep(wait)
        _last_request = time.time()
        REQUESTS += 1
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'SURGE/0.1 build-origin-shares'})
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            body = redact(e.read()[:200])
            if e.code >= 500 and attempt == 1:
                log('  HTTP %d, retrying once' % e.code)
                time.sleep(3)
                continue
            return e.code, body
        except (urllib.error.URLError, OSError) as e:  # includes timeouts
            reason = redact('%s: %s' % (type(e).__name__, e))
            if attempt == 1:
                log('  %s, retrying once' % reason)
                time.sleep(3)
                continue
            return None, reason
    return None, 'unreachable'


def fetch(code, lvl, when):
    """Rows (list of dicts keyed by the header) for one commodity code and time expression, or (None, reason)."""
    status, body = request({'get': 'CTY_CODE,CTY_NAME,GEN_VAL_MO', 'I_COMMODITY': code, 'COMM_LVL': lvl, 'time': when})
    if status is None:
        return None, body
    if status != 200:
        return None, 'HTTP %s: %s' % (status, body)
    if isinstance(body, bytes):
        body = body.decode('utf-8', 'replace')
    if not body.strip():
        return None, 'empty response (no data published for this code/time)'
    try:
        data = json.loads(body)
    except ValueError:
        return None, 'non-JSON response: %r' % body[:80]
    if not isinstance(data, list) or not data:
        return None, 'unexpected response shape'
    head = data[0]
    return [dict(zip(head, row)) for row in data[1:]], None


def aggregate(rows):
    """Sum GEN_VAL_MO across months: world total (CTY_CODE '-') and per-country totals with names."""
    world = 0.0
    by = {}
    names = {}
    for r in rows:
        try:
            v = float(r.get('GEN_VAL_MO') or 0)
        except ValueError:
            v = 0.0
        c = r.get('CTY_CODE', '')
        if c == '-':
            world += v
        elif is_country(c):
            by[c] = by.get(c, 0.0) + v
            names[c] = r.get('CTY_NAME', '')
    return world, by, names


def latest_month():
    """Newest month for which HS4 0702 has a world total > 0, probing back from the current month."""
    cur = time.strftime('%Y-%m', time.gmtime())
    for back in range(PROBE_MONTHS):
        ym = month_add(cur, -back)
        rows, err = fetch('0702', 'HS4', ym)
        if rows:
            world, _, _ = aggregate(rows)
            if world > 0:
                log('latest month with data: %s (HS4 0702 world total $%s)' % (ym, format(world, ',.0f')))
                return ym
            err = 'world total is 0'
        log('%s: no data (%s)' % (ym, err or 'no rows'))
    sys.exit('no month with data in the last %d months' % PROBE_MONTHS)


# ---------------------------------------------------------------- main
def main():
    end = latest_month()
    start = month_add(end, -(WINDOW_MONTHS - 1))
    when = 'from %s to %s' % (start, end)
    log('window: %s' % when)

    by_commodity = {}
    failed = []
    unmapped = {}       # code -> {code, censusName, valueUsd, commodities}
    warned = set()

    for commodity, codes in HS.items():
        total = 0.0
        value = {}
        api_name = {}
        for code in codes:
            lvl = 'HS6' if len(code) == 6 else 'HS4'
            log('%s %s (%s)' % (commodity, code, lvl))
            rows, err = fetch(code, lvl, when)
            if rows is None:
                failed.append({'commodity': commodity, 'code': code, 'reason': err})
                log('  FAILED: %s' % err)
                continue
            world, by, names = aggregate(rows)
            if world <= 0 and by:
                world = sum(by.values())
                log('  no world-total row; using the sum of countries')
            total += world
            for c, v in by.items():
                value[c] = value.get(c, 0.0) + v
                api_name[c] = names[c]
            log('  world $%s, %d countries' % (format(world, ',.0f'), len(by)))

        origins = {}
        if total > 0:
            for code, v in sorted(value.items(), key=lambda kv: -kv[1]):
                share = v / total
                if share < MIN_SHARE:
                    continue
                entry = CENSUS.get(code)
                name = api_name[code]
                if entry and norm(entry[2]) == norm(name):
                    iso3, english = entry[0], entry[1]
                else:
                    if entry and code not in warned:
                        warned.add(code)
                        log('  WARNING: code %s is %r in the API but %r in the table; treating as unmapped' % (code, name, entry[2]))
                    iso3, english = 'UNK-' + code, title_case(name)
                    u = unmapped.setdefault(code, {'code': code, 'censusName': name, 'valueUsd': 0, 'commodities': []})
                    u['valueUsd'] += round(v)
                    u['commodities'].append(commodity)
                if iso3 in origins:  # two Census codes mapping to one ISO3 (not expected)
                    origins[iso3]['valueUsd'] += round(v)
                    origins[iso3]['share'] = round(origins[iso3]['valueUsd'] / total, 4)
                    continue
                origins[iso3] = {'name': english, 'valueUsd': round(v), 'share': round(share, 4)}
        by_commodity[commodity] = {'totalUsd': round(total), 'origins': origins}

    unmapped_list = sorted(unmapped.values(), key=lambda u: -u['valueUsd'])
    out = {
        'source': SOURCE,
        'url': BASE,
        'window': {'from': start, 'to': end},
        'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'hs': HS,
        'byCommodity': by_commodity,
        'failed': failed,
        'unmapped': unmapped_list,
    }
    with open(OUT_JSON, 'w') as f:
        json.dump(out, f, indent=1)
        f.write('\n')
    log('wrote %s' % OUT_JSON)

    write_report(out)
    log('wrote %s' % OUT_MD)

    print('window %s..%s | %d requests | %d failed codes | %d unmapped codes' % (start, end, REQUESTS, len(failed), len(unmapped_list)))
    for fl in failed:
        print('  failed %s %s: %s' % (fl['commodity'], fl['code'], fl['reason']))
    for u in unmapped_list:
        print('  unmapped %s %r $%s in %s' % (u['code'], u['censusName'], format(u['valueUsd'], ','), ', '.join(u['commodities'])))


# ---------------------------------------------------------------- report
def pct(x):
    return '%.1f%%' % (100 * x)


def musd(x):
    return '$%.1fM' % (x / 1e6)


def write_report(out):
    regions = json.load(open(REGIONS))
    single = []  # (region id, region name, ISO3, usImportOriginShare)
    placed = set()
    for rid, r in regions.items():
        cs = r.get('countries') or []
        placed.update(cs)
        if len(cs) == 1:
            single.append((rid, r.get('name', rid), cs[0], r.get('usImportOriginShare') or {}))
    single.sort(key=lambda s: s[2])

    byc = out['byCommodity']
    flagged = []    # (absdiff, commodity, region id, iso3, file, measured)
    unplaced = {}   # iso3 -> {name, items: [(commodity, share)]}
    sections = []

    for commodity, codes in out['hs'].items():
        d = byc.get(commodity) or {'totalUsd': 0, 'origins': {}}
        origins = d['origins']
        lines = ['### %s' % commodity,
                 '',
                 'HS %s; 12-month general imports %s.' % (', '.join(codes), musd(d['totalUsd'])),
                 '']
        fails = [f for f in out['failed'] if f['commodity'] == commodity]
        if fails:
            lines.append('Failed codes: ' + '; '.join('%s (%s)' % (f['code'], f['reason']) for f in fails))
            lines.append('')
        lines += ['| # | Origin | ISO3 | Share | Value |', '|---|---|---|---|---|']
        for i, (iso3, o) in enumerate(list(origins.items())[:8], 1):
            lines.append('| %d | %s | %s | %s | %s |' % (i, o['name'], iso3, pct(o['share']), musd(o['valueUsd'])))
        listed = sum(o['share'] for o in origins.values())
        lines.append('')
        lines.append('Listed origins (share >= 0.5%%) cover %s; implied other: %s.' % (pct(listed), pct(max(0.0, 1 - listed))))
        lines.append('')

        # regions.json comparison
        rows = []
        for rid, rname, iso3, shares in single:
            file_val = shares.get(commodity)
            meas = origins.get(iso3, {}).get('share', 0.0)
            if file_val is None and meas == 0.0:
                continue
            diff = meas - (file_val or 0.0)
            flag = abs(diff) > FLAG_DIFF
            if flag:
                flagged.append((abs(diff), commodity, rid, iso3, file_val, meas))
            rows.append('| %s | %s | %s | %s | %+.1f pp | %s |' % (
                rid, iso3, ('%.2f' % file_val) if file_val is not None else '-', pct(meas), 100 * diff, 'FLAG' if flag else ''))
        if rows:
            lines += ['regions.json `usImportOriginShare` vs measured (single-country regions; `-` = not in file, counted as 0):', '',
                      '| Region | ISO3 | File | Measured | Diff | |', '|---|---|---|---|---|---|'] + rows + ['']
        else:
            lines += ['No single-country region has a share for this commodity and none appears at >= 0.5% measured.', '']

        # origins >= 5% with no region
        missing = [(iso3, o) for iso3, o in origins.items() if o['share'] >= UNPLACED_SHARE and iso3 not in placed]
        if missing:
            lines.append('Origins >= 5%% with no region in regions.json: ' + ', '.join(
                '%s (%s, %s)' % (o['name'], iso3, pct(o['share'])) for iso3, o in missing))
            lines.append('')
            for iso3, o in missing:
                u = unplaced.setdefault(iso3, {'name': o['name'], 'items': []})
                u['items'].append((commodity, o['share']))
        sections.append('\n'.join(lines))

    flagged.sort(key=lambda t: -t[0])
    md = ['# Origin shares: Census measured vs regions.json',
          '',
          'Source: %s ([API](%s)).' % (out['source'], out['url']),
          'Window: %s to %s. Generated %s. %d API requests; %d failed codes.' % (
              out['window']['from'], out['window']['to'], out['generatedAt'], REQUESTS, len(out['failed'])),
          '',
          'A share is the origin country\'s general-imports customs value divided by the world total ("TOTAL FOR ALL COUNTRIES") '
          'summed over the window and over the commodity\'s HS codes. Regional aggregates (OECD, USMCA, EU, 1XXX, ...) are excluded. '
          'Origins under 0.5% are not listed, so the remainder is an implied "other". '
          'A FLAG marks a difference of more than %.2f between the value in regions.json and the measured share.' % FLAG_DIFF,
          '',
          'Data file: `packages/config/data/origin-shares.json`.',
          '',
          '## Flagged discrepancies (|file - measured| > %.2f), largest first' % FLAG_DIFF,
          '',
          '| # | Commodity | Region | ISO3 | File | Measured | Diff |',
          '|---|---|---|---|---|---|---|']
    for i, (ad, commodity, rid, iso3, file_val, meas) in enumerate(flagged, 1):
        md.append('| %d | %s | %s | %s | %s | %s | %+.1f pp |' % (
            i, commodity, rid, iso3, ('%.2f' % file_val) if file_val is not None else '-', pct(meas), 100 * (meas - (file_val or 0.0))))
    if not flagged:
        md.append('| | none | | | | | |')
    md += ['', '## Origins >= %s with no region in regions.json' % pct(UNPLACED_SHARE), '',
           'Countries the app cannot currently place threats on.', '',
           '| ISO3 | Country | Commodities (measured share) |', '|---|---|---|']
    for iso3, u in sorted(unplaced.items(), key=lambda kv: -max(s for _, s in kv[1]['items'])):
        md.append('| %s | %s | %s |' % (iso3, u['name'], ', '.join('%s %s' % (c, pct(s)) for c, s in sorted(u['items'], key=lambda t: -t[1]))))
    if not unplaced:
        md.append('| | none | |')
    if out['unmapped']:
        md += ['', '## Census codes not in the ISO3 table', '', '| Code | Census name | Value | Commodities |', '|---|---|---|---|']
        for u in out['unmapped']:
            md.append('| %s | %s | %s | %s |' % (u['code'], u['censusName'], musd(u['valueUsd']), ', '.join(u['commodities'])))
    if out['failed']:
        md += ['', '## Failed codes', '', '| Commodity | Code | Reason |', '|---|---|---|']
        for f in out['failed']:
            md.append('| %s | %s | %s |' % (f['commodity'], f['code'], f['reason']))
    md += ['', '## Per commodity', ''] + sections
    with open(OUT_MD, 'w') as f:
        f.write('\n'.join(md) + '\n')


if __name__ == '__main__':
    main()
