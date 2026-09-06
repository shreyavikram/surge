import { loadContext } from '@surge/config';
import type { FeedAdapter, FeedResult, FeedItem } from './types.js';
import { httpText } from './http.js';
import { regionForCountry } from './regions.js';
import type { Env } from '../env.js';

/**
 * US Census Bureau monthly imports by country of origin (International Trade API, general imports
 * customs value). For every commodity, the last three reported months are compared with the same
 * three months a year earlier, origin by origin. An origin that supplied at least MIN_ORIGIN_SHARE of
 * the commodity's imports and whose shipments fell by MIN_DECLINE or more against the average of the same
 * months in the previous BASELINE_YEARS years (a seasonal baseline) becomes an "import decline" threat:
 * severity = the measured fraction of that channel lost. Origins whose shipments rose over the same window are
 * named as the replacements.
 *
 * The threat starts as anticipated (yellow): official trade data show the channel shrinking, but the
 * shelf effect is not yet visible. price-stress.ts upgrades it to unstable (red) when the FAO price
 * anomaly indicator on US retail prices for the same commodity is moderately or abnormally high.
 */
export const HS_CODES: Record<string, string[]> = {
  eggs: ['0407', '0408'], chicken: ['020711', '020712', '020713', '020714'], turkey: ['020724', '020725', '020726', '020727'],
  beef: ['0201', '0202'], pork: ['0203'], milk: ['0401', '0402'], cheese: ['0406'], bread: ['1905'], rice: ['1006'],
  potatoes: ['0701', '200410'], lettuce: ['0705'], tomatoes: ['0702'], 'fresh-vegetables': ['0703', '0704', '0706', '0707', '0708', '0709'],
  apples: ['080810'], bananas: ['0803'], citrus: ['0805'], coffee: ['0901'], sugar: ['1701'],
  'fats-oils': ['1507', '1508', '1509', '1511', '1512', '1514', '1515'], 'infant-formula': ['190110'],
  fertilizer: ['3102', '3104', '3105'], wheat: ['1001'], corn: ['1005'], soybeans: ['1201'],
};

/** Census country names (upper case, as the API prints them) → ISO3. Unknown names are reported, not guessed. */
export const CENSUS_NAME_ISO3: Record<string, string> = {
  MEXICO: 'MEX', CANADA: 'CAN', BRAZIL: 'BRA', TURKEY: 'TUR', 'TURKIYE': 'TUR', 'TÜRKIYE': 'TUR', CHINA: 'CHN', IRAN: 'IRN', INDIA: 'IND',
  THAILAND: 'THA', PAKISTAN: 'PAK', VIETNAM: 'VNM', INDONESIA: 'IDN', UKRAINE: 'UKR', RUSSIA: 'RUS', GUATEMALA: 'GTM', ECUADOR: 'ECU',
  HONDURAS: 'HND', 'COSTA RICA': 'CRI', COLOMBIA: 'COL', CHILE: 'CHL', PERU: 'PER', ARGENTINA: 'ARG', URUGUAY: 'URY', PARAGUAY: 'PRY',
  AUSTRALIA: 'AUS', 'NEW ZEALAND': 'NZL', 'DOMINICAN REPUBLIC': 'DOM', NICARAGUA: 'NIC', 'EL SALVADOR': 'SLV', PANAMA: 'PAN',
  MALAYSIA: 'MYS', PHILIPPINES: 'PHL', JAPAN: 'JPN', 'KOREA, SOUTH': 'KOR', TAIWAN: 'TWN', ITALY: 'ITA', SPAIN: 'ESP', FRANCE: 'FRA',
  GERMANY: 'DEU', NETHERLANDS: 'NLD', BELGIUM: 'BEL', IRELAND: 'IRL', 'UNITED KINGDOM': 'GBR', DENMARK: 'DNK', POLAND: 'POL', GREECE: 'GRC',
  PORTUGAL: 'PRT', SWITZERLAND: 'CHE', NORWAY: 'NOR', SWEDEN: 'SWE', MOROCCO: 'MAR', EGYPT: 'EGY', 'SOUTH AFRICA': 'ZAF', KENYA: 'KEN',
  ETHIOPIA: 'ETH', "COTE D'IVOIRE": 'CIV', GHANA: 'GHA', NIGERIA: 'NGA', 'SAUDI ARABIA': 'SAU', ISRAEL: 'ISR', 'TRINIDAD AND TOBAGO': 'TTO',
  JAMAICA: 'JAM', BELIZE: 'BLZ', BOLIVIA: 'BOL', VENEZUELA: 'VEN', SINGAPORE: 'SGP', 'SRI LANKA': 'LKA', BANGLADESH: 'BGD', CAMBODIA: 'KHM',
  QATAR: 'QAT', 'UNITED ARAB EMIRATES': 'ARE',
};

export const TRADE_THRESHOLDS = {
  MIN_ORIGIN_SHARE: 0.10,   // of the commodity's imports a year earlier
  MIN_DECLINE: 0.20,        // fraction of the origin's shipments lost
  MIN_VALUE_USD: 5e6,       // baseline window value below which month-to-month noise dominates
  WINDOW_MONTHS: 3,
  BASELINE_YEARS: 3,        // the same months in each of the previous N years, averaged (seasonal baseline)
};

const BASE = 'https://api.census.gov/data/timeseries/intltrade/imports/hs';

export interface TradeRaw {
  latest: string;                       // YYYY-MM of the newest month with data
  /** rows per HS code: [countryCode, countryName, valueUsd, month] */
  rows: Record<string, [string, string, number, string][]>;
}

function ym(d: Date): string { return d.toISOString().slice(0, 7); }
function shiftMonths(month: string, k: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + k, 1));
  return ym(d);
}
function monthsBack(end: string, n: number): string[] { return Array.from({ length: n }, (_, i) => shiftMonths(end, -(n - 1 - i))); }
function isCountry(code: string): boolean { return /^[1-7]\d{3}$/.test(code); }
function titleCase(name: string): string {
  const special: Record<string, string> = { 'KOREA, SOUTH': 'South Korea', 'UNITED KINGDOM': 'United Kingdom', "COTE D'IVOIRE": "Côte d'Ivoire", 'TURKIYE': 'Turkey', 'TÜRKIYE': 'Turkey' };
  if (special[name]) return special[name]!;
  return name.toLowerCase().replace(/(^|[\s(-])([a-z])/g, (m, a: string, b: string) => a + b.toUpperCase());
}
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function windowLabel(months: string[]): string {
  const first = months[0]!, last = months[months.length - 1]!;
  const mn = (s: string) => MONTH_NAMES[Number(s.slice(5, 7)) - 1];
  return months.length === 1 ? `${mn(first)} ${first.slice(0, 4)}` : `${mn(first)}–${mn(last)} ${last.slice(0, 4)}`;
}
function money(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${(v / 1e3).toFixed(0)}K`;
}

async function censusRows(code: string, from: string, to: string, key: string | undefined): Promise<[string, string, number, string][]> {
  const level = code.length === 6 ? 'HS6' : code.length === 4 ? 'HS4' : 'HS2';
  const url = `${BASE}?get=CTY_CODE,CTY_NAME,GEN_VAL_MO&I_COMMODITY=${code}&COMM_LVL=${level}&time=from+${from}+to+${to}${key ? `&key=${key}` : ''}`;
  // the Census API is slow (several seconds per code) and answers 204/empty for months not yet published
  let text = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try { text = await httpText(url, 60000); break; } catch (e) { if (attempt === 2) throw e; await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); }
  }
  if (!text.trim()) return [];
  const data = JSON.parse(text) as string[][];
  return data.slice(1).map((r) => [r[0]!, r[1]!, Number(r[2] ?? 0), r[r.length - 1]!] as [string, string, number, string]);
}

export interface ImportDecline {
  commodity: string; country: string; iso3?: string; regionId?: string;
  window: string[]; current: number; previous: number; decline: number; share: number;
  /** baseline years actually available in the data */
  years: number;
  /** origins whose shipments rose against their own baseline over the same window (largest gains first) */
  replacements: { country: string; gain: number }[];
}

/** Pure computation from raw rows: per commodity and origin, the window versus the same months in earlier years. */
export function importDeclines(raw: TradeRaw): { declines: ImportDecline[]; totals: Record<string, { months: string[]; values: number[] }>; unmapped: string[] } {
  const T = TRADE_THRESHOLDS;
  const window = monthsBack(raw.latest, T.WINDOW_MONTHS);
  const baselines = Array.from({ length: T.BASELINE_YEARS }, (_, y) => window.map((m) => shiftMonths(m, -12 * (y + 1))));
  const yearOf = new Map<string, number>();
  baselines.forEach((ms, y) => ms.forEach((m) => yearOf.set(m, y)));
  const declines: ImportDecline[] = [];
  const totals: Record<string, { months: string[]; values: number[] }> = {};
  const unmapped = new Set<string>();
  const ctx = loadContext();
  const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  for (const [commodity, codes] of Object.entries(HS_CODES)) {
    const cur = new Map<string, number>(), names = new Map<string, string>();
    const prevByYear = new Map<string, number[]>();          // country → sum per baseline year
    const worldByMonth = new Map<string, number>();
    const worldPrev: number[] = new Array<number>(T.BASELINE_YEARS).fill(0);
    for (const code of codes) {
      for (const [cty, name, value, month] of raw.rows[code] ?? []) {
        const y = yearOf.get(month);
        if (cty === '-') { worldByMonth.set(month, (worldByMonth.get(month) ?? 0) + value); if (y !== undefined) worldPrev[y]! += value; continue; }
        if (!isCountry(cty)) continue;
        names.set(cty, name);
        if (window.includes(month)) cur.set(cty, (cur.get(cty) ?? 0) + value);
        else if (y !== undefined) { const arr = prevByYear.get(cty) ?? new Array<number>(T.BASELINE_YEARS).fill(0); arr[y]! += value; prevByYear.set(cty, arr); }
      }
    }
    const months = [...worldByMonth.keys()].sort();
    if (months.length > 0) totals[commodity] = { months, values: months.map((m) => worldByMonth.get(m)!) };
    // baseline years with data (a year whose world total is zero was not fetched or not published)
    const years = worldPrev.map((v, y) => (v > 0 ? y : -1)).filter((y) => y >= 0);
    if (years.length === 0) continue;
    const worldBase = mean(years.map((y) => worldPrev[y]!));
    if (worldBase <= 0) continue;
    const baseOf = (cty: string): number => mean(years.map((y) => prevByYear.get(cty)?.[y] ?? 0));
    const risers = [...new Set([...cur.keys(), ...prevByYear.keys()])]
      .map((cty) => ({ cty, gain: (cur.get(cty) ?? 0) - baseOf(cty) }))
      .filter((x) => x.gain >= 1e6)
      .sort((a, b) => b.gain - a.gain)
      .slice(0, 3)
      .map((x) => ({ country: titleCase(names.get(x.cty) ?? x.cty), gain: x.gain }));
    for (const cty of prevByYear.keys()) {
      const before = baseOf(cty);
      const share = before / worldBase;
      if (before < T.MIN_VALUE_USD || share < T.MIN_ORIGIN_SHARE) continue;
      const now = cur.get(cty) ?? 0;
      const decline = 1 - now / before;
      if (decline < T.MIN_DECLINE) continue;
      const name = names.get(cty) ?? cty;
      const iso3 = CENSUS_NAME_ISO3[name];
      if (!iso3) unmapped.add(name);
      const region = iso3 ? regionForCountry(ctx, iso3) : undefined;
      const d: ImportDecline = { commodity, country: titleCase(name), window, current: now, previous: before, decline, share, years: years.length, replacements: risers.filter((r) => r.country !== titleCase(name)) };
      if (iso3) d.iso3 = iso3;
      if (region) d.regionId = region.id;
      declines.push(d);
    }
  }
  declines.sort((a, b) => b.share * b.decline - a.share * a.decline);
  return { declines, totals, unmapped: [...unmapped] };
}

function toItems(declines: ImportDecline[]): FeedItem[] {
  const ctx = loadContext();
  const items: FeedItem[] = [];
  for (const d of declines) {
    if (!d.regionId) continue; // no region to place it in (see /api/price-stress for the full list)
    const region = ctx.regions[d.regionId]!;
    const cname = ctx.commodities[d.commodity]?.name ?? ctx.inputs[d.commodity]?.name ?? d.commodity;
    const pct = Math.round(d.decline * 100);
    const label = windowLabel(d.window);
    items.push({
      id: `trade-${d.commodity}-${d.iso3!.toLowerCase()}`,
      name: `${cname} imports from ${d.country} down ${pct}%`,
      category: 'import_decline', kind: 'geopolitical',
      regionId: region.id, admin: region.name, iso3: d.iso3!, lat: region.lat, lng: region.lng,
      commodities: [{ id: d.commodity, relevance: 1 }],
      severity: Math.min(1, d.decline), status: 'breaking', confidence: 0.85,
      start: d.window[d.window.length - 1]!, months: 3,
      summary: `US imports of ${cname.toLowerCase()} from ${d.country} were ${money(d.current)} in ${label}, down ${pct}% from the ${money(d.previous)} usual for these months (average of the previous ${d.years} year${d.years > 1 ? 's' : ''}); ${d.country} normally supplies ${Math.round(d.share * 100)}% of these imports.${d.replacements.length ? ` Shipments from ${d.replacements.map((r) => `${r.country} (+${money(r.gain)})`).join(', ')} rose over the same months.` : ''} (US Census Bureau monthly trade data.)`,
      text: `Census general imports, customs value: ${d.window.join(', ')} = ${money(d.current)} vs seasonal baseline ${money(d.previous)} over ${d.years} year(s); origin share ${(d.share * 100).toFixed(1)}%`,
      raw: { current: d.current, previous: d.previous, share: d.share, window: d.window, years: d.years, replacements: d.replacements },
    });
  }
  return items;
}

export const trade: FeedAdapter = {
  id: 'trade',
  label: 'Census imports by origin',
  kind: 'live',
  ttlMs: 24 * 60 * 60 * 1000,
  snapshotName: 'trade',

  async fetch(env: Env): Promise<FeedResult> {
    const key = env.CENSUS_API_KEY;
    // newest month with data: probe fresh tomatoes over the last four months
    const now = ym(new Date());
    const probe = await censusRows('0702', shiftMonths(now, -4), now, key);
    const latest = probe.filter((r) => r[0] === '-' && r[2] > 0).map((r) => r[3]).sort().pop();
    if (!latest) throw new Error('Census trade API returned no recent months');
    const from = shiftMonths(latest, -(TRADE_THRESHOLDS.WINDOW_MONTHS - 1) - 12 * TRADE_THRESHOLDS.BASELINE_YEARS);
    const rows: TradeRaw['rows'] = {};
    const codes = [...new Set(Object.values(HS_CODES).flat())];
    // four requests at a time: ~35 codes, one call each
    const failed: string[] = [];
    for (let i = 0; i < codes.length; i += 4) {
      await Promise.all(codes.slice(i, i + 4).map(async (code) => {
        try { rows[code] = await censusRows(code, from, latest, key); } catch { failed.push(code); }
      }));
    }
    if (Object.keys(rows).length === 0) throw new Error('Census trade API: every commodity request failed');
    const result = trade.parse({ latest, rows } satisfies TradeRaw);
    result.source.fetchedAt = new Date().toISOString();
    if (failed.length) result.source.note = `${result.source.note ?? ''}; HS codes not fetched: ${failed.join(', ')}`;
    return result;
  },

  parse(raw: unknown): FeedResult {
    const r = raw as TradeRaw;
    const { declines, totals, unmapped } = importDeclines(r);
    const series: FeedResult['series'] = {};
    for (const [c, t] of Object.entries(totals)) series[`imports.${c}`] = t;
    const items = toItems(declines);
    const note = `latest month ${r.latest}; ${declines.length} origin declines, ${items.length} placed on the map${unmapped.length ? `; unmapped Census names: ${unmapped.join(', ')}` : ''}`;
    return { items, series, source: { feed: 'US Census Bureau imports by origin', url: 'https://usatrade.census.gov', kind: 'live', note } };
  },
};

export { importDeclines as _importDeclines, windowLabel as _windowLabel };
