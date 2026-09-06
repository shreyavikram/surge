import type { FeedAdapter, FeedResult } from './types.js';
import { httpText } from './http.js';

// Retail price series consumed by the web app's observed price paths + /api/series,
// plus population. All no-key via the CSV endpoint (FRED_API_KEY optional, unused here).
export const FRED_SERIES: Record<string, string> = {
  eggs: 'APU0000708111', chicken: 'APU0000706111', beef: 'APU0000703112', milk: 'APU0000709112',
  cheese: 'APU0000710212', bread: 'APU0000702111', rice: 'APU0000701312', potatoes: 'APU0000712112',
  lettuce: 'APU0000712211', tomatoes: 'APU0000712311', apples: 'APU0000711111', bananas: 'APU0000711211',
  citrus: 'APU0000711311', coffee: 'APU0000717311', sugar: 'APU0000715211', pork: 'APU0000FD3101',
  // CPI item index (not a price): used only for the price-anomaly indicator, never shown as dollars
  'fats-oils': 'CUUR0000SEFS',
  population: 'POPTHM',
};

/** Series that are index numbers rather than dollar prices (excluded from dollar charts). */
export const INDEX_SERIES = new Set(['fats-oils']);

/** Commodity → series id, for the FAO price-anomaly indicator. Apples (APU0000711111) ended in 2017 and BLS publishes no turkey, fresh-vegetable or infant-formula average price, so those are not scored. */
export const ANOMALY_SERIES: Record<string, string> = Object.fromEntries(Object.entries(FRED_SERIES).filter(([k]) => k !== 'population' && k !== 'apples'));

function csvUrl(seriesId: string): string {
  return `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`;
}

/** Parse a FRED CSV ("observation_date,SERIESID\nYYYY-MM-DD,value..."). */
function parseCsv(csv: string): { id: string; months: string[]; values: number[] } {
  const lines = csv.trim().split(/\r?\n/);
  const header = (lines[0] ?? '').split(',');
  const id = header[1]?.trim() ?? 'series';
  const months: string[] = [];
  const values: number[] = [];
  for (const line of lines.slice(1)) {
    const [date, raw] = line.split(',');
    if (!date || raw === undefined || raw === '' || raw === '.') continue; // '.' = missing
    const v = Number(raw);
    if (!Number.isFinite(v)) continue;
    months.push(date.slice(0, 7));
    values.push(v);
  }
  return { id, months, values };
}

export const fred: FeedAdapter = {
  id: 'fred',
  label: 'FRED retail prices',
  kind: 'live',
  ttlMs: 24 * 60 * 60 * 1000,
  producesThreats: false,
  snapshotName: 'fred',

  async fetch(): Promise<FeedResult> {
    const series: FeedResult['series'] = {};
    for (const [name, seriesId] of Object.entries(FRED_SERIES)) {
      try {
        const parsed = parseCsv(await httpText(csvUrl(seriesId)));
        series[name] = { months: parsed.months, values: parsed.values };
      } catch {
        // skip a single failed series; the rest still populate
      }
    }
    return { items: [], series, source: { feed: 'FRED (BLS Average Price Data)', url: 'https://fred.stlouisfed.org', kind: 'live' } };
  },

  // For fixtures/snapshot: raw is one series' CSV text; keyed by the series id in its header.
  parse(raw: unknown): FeedResult {
    const parsed = parseCsv(String(raw));
    return { items: [], series: { [parsed.id]: { months: parsed.months, values: parsed.values } }, source: { feed: 'FRED', url: 'https://fred.stlouisfed.org', kind: 'live' } };
  },
};

export { parseCsv as _parseFredCsv };
