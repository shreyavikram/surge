import { loadContext } from '@surge/config';
import type { FeedAdapter, FeedResult, FeedItem } from './types.js';
import { httpJson } from './http.js';

/**
 * EIA: US retail diesel (weekly) and Henry Hub natural gas (monthly). A price more than 10% above its
 * trailing 12-month mean becomes an input-cost threat; severity is the supply-loss fraction that
 * reproduces the observed rise through the input's own demand elasticity (rise × |ε|).
 */
interface EiaRow { period: string; value: string | number; series: string }
interface EiaResp { response?: { data?: EiaRow[] } }
const SERIES = [
  { input: 'energy', series: 'EMD_EPD2D_PTE_NUS_DPG', label: 'US retail diesel', path: 'petroleum/pri/gnd', freq: 'weekly', window: 52 },
  { input: 'fertilizer', series: 'RNGWHHD', label: 'Henry Hub natural gas', path: 'natural-gas/pri/fut', freq: 'monthly', window: 12 },
];
const MIN_RISE = 0.10;

export const eia: FeedAdapter = {
  id: 'eia',
  label: 'EIA energy prices',
  kind: 'live',
  ttlMs: 12 * 60 * 60 * 1000,
  requiresKey: 'EIA_API_KEY',
  snapshotName: 'eia',

  async fetch(env): Promise<FeedResult> {
    const out: Record<string, EiaRow[]> = {};
    for (const s of SERIES) {
      const url = `https://api.eia.gov/v2/${s.path}/data/?api_key=${env.EIA_API_KEY}&frequency=${s.freq}&data[0]=value&facets[series][]=${s.series}&sort[0][column]=period&sort[0][direction]=desc&length=${s.window + 1}`;
      const d = await httpJson<EiaResp>(url);
      out[s.series] = d.response?.data ?? [];
    }
    return this.parse(out);
  },

  parse(raw: unknown): FeedResult {
    const ctx = loadContext();
    const data = raw as Record<string, EiaRow[]>;
    const items: FeedItem[] = [];
    const series: FeedResult['series'] = {};
    for (const s of SERIES) {
      const rows = (data[s.series] ?? []).slice().sort((a, b) => (a.period < b.period ? 1 : -1));
      if (rows.length < 4) continue;
      const latest = Number(rows[0]!.value);
      const rest = rows.slice(1).map((r) => Number(r.value)).filter(Number.isFinite);
      const mean = rest.reduce((a, b) => a + b, 0) / rest.length;
      series[s.series] = { months: rows.map((r) => r.period).reverse(), values: rows.map((r) => Number(r.value)).reverse() };
      const rise = mean > 0 ? latest / mean - 1 : 0;
      if (rise < MIN_RISE) continue;
      const inp = ctx.inputs[s.input];
      const eps = Math.abs(inp?.demand.totalElasticity ?? 0.3);
      items.push({
        id: `eia-${s.input}`, name: `${s.label} up ${(rise * 100).toFixed(0)}% on its 12-month average`, category: 'input_cost', kind: 'geopolitical',
        regionId: 'us-national', admin: 'United States', iso3: 'USA', lat: 39.8, lng: -98.6,
        commodities: [{ id: s.input, relevance: 1 }],
        severity: Math.min(1, rise * eps), start: rows[0]!.period.slice(0, 7), months: 6,
        physical: { kind: 'input_price_increase', value: rise },
        text: `${s.label}: ${latest} vs ${mean.toFixed(2)} trailing ${s.window}-period mean (${rows[0]!.period})`,
      });
    }
    return { items, series, source: { feed: 'EIA', url: 'https://www.eia.gov', kind: 'live' } };
  },
};
