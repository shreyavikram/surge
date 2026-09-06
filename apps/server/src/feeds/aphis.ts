import { loadContext } from '@surge/config';
import type { FeedAdapter, FeedResult, FeedItem } from './types.js';
import { httpText } from './http.js';

/**
 * USDA APHIS HPAI confirmed detections. The public dashboard exposes a monthly sheet (flock counts); the
 * per-detection CSV (state, county, birds) is only available by hand from the dashboard's download button and
 * is committed as data/snapshots/aphis-detections.csv when present. Birds affected in the trailing 12 months
 * become one national disease threat with a monthly timeline; severity = birds ÷ national layer inventory.
 */
const TABLEAU = 'https://publicdashboards.dl.usda.gov/t/MRP_PUB/views/VS_Avian_HPAIConfirmedDetections2022/HPAI2022ConfirmedDetections.csv?:showVizHome=no';
export interface AphisMonth { month: string; flocks?: number; birds?: number; commercialLayers?: number }

const MONTHS: Record<string, string> = { January: '01', February: '02', March: '03', April: '04', May: '05', June: '06', July: '07', August: '08', September: '09', October: '10', November: '11', December: '12' };

export function parseTableauMonthly(csv: string): AphisMonth[] {
  const lines = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const head = lines[0]?.split(',') ?? [];
  const iMonth = (() => { const i = head.findIndex((h) => /Month of/i.test(h)); return i >= 0 ? i : head.findIndex((h) => /Month/i.test(h) && !/Last/i.test(h)); })();
  const iFlocks = head.findIndex((h) => /Flocks/i.test(h));
  const iBirds = head.findIndex((h) => /Birds/i.test(h));
  const out: AphisMonth[] = [];
  for (const l of lines.slice(1)) {
    const v = l.split(',');
    const m = (v[iMonth] ?? '').trim().split(' ');
    if (m.length !== 2 || !MONTHS[m[0]!]) continue;
    const month = `${m[1]}-${MONTHS[m[0]!]}`;
    const row: AphisMonth = { month };
    if (iFlocks >= 0) row.flocks = Number((v[iFlocks] ?? '').replace(/[^0-9.]/g, '')) || 0;
    if (iBirds >= 0) row.birds = Number((v[iBirds] ?? '').replace(/[^0-9.]/g, '')) || 0;
    out.push(row);
  }
  return out.sort((a, b) => (a.month < b.month ? -1 : 1));
}

export const aphis: FeedAdapter = {
  id: 'aphis',
  label: 'USDA APHIS HPAI detections',
  kind: 'live',
  ttlMs: 12 * 60 * 60 * 1000,
  snapshotName: 'aphis',

  async fetch(): Promise<FeedResult> {
    return this.parse({ monthly: parseTableauMonthly(await httpText(TABLEAU, 30000)) });
  },

  parse(raw: unknown): FeedResult {
    const ctx = loadContext();
    const monthly = ((raw as { monthly?: AphisMonth[] }).monthly ?? []).slice(-12);
    const items: FeedItem[] = [];
    const withBirds = monthly.filter((m) => (m.birds ?? 0) > 0);
    const inv = ctx.commodities['eggs']?.supply.nationalInventory ?? 325e6;
    if (withBirds.length > 0) {
      const total = withBirds.reduce((a, m) => a + (m.birds ?? 0), 0);
      const first = withBirds[0]!.month;
      const idx = (m: string) => (Number(m.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + (Number(m.slice(5, 7)) - Number(first.slice(5, 7)));
      items.push({
        id: 'aphis-hpai-layers', name: `HPAI layer losses, trailing 12 months (${(total / 1e6).toFixed(1)}M birds)`, category: 'disease', kind: 'natural',
        regionId: 'us-national', admin: 'United States', iso3: 'USA', lat: 39.8, lng: -98.6,
        commodities: [{ id: 'eggs', relevance: 1 }],
        severity: Math.min(1, total / inv), start: first, months: 18,
        physical: { kind: 'animals_affected', value: total, timeline: withBirds.map((m) => ({ month: idx(m.month), value: m.birds ?? 0 })) },
        text: `APHIS confirmed detections; birds affected by month of confirmation`,
      });
    }
    const series: FeedResult['series'] = { 'aphis-flocks': { months: monthly.map((m) => m.month), values: monthly.map((m) => m.flocks ?? 0) } };
    return { items, series, source: { feed: 'USDA APHIS (dashboard monthly sheet)', url: 'https://www.aphis.usda.gov/livestock-poultry-disease/avian/avian-influenza/hpai-detections/commercial-backyard-flocks', kind: 'live', note: withBirds.length === 0 ? 'birds-affected column not exposed by the public sheet; per-detection archive needed for a threat' : undefined } };
  },
};
