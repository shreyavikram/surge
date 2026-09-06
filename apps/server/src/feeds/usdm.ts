import { loadContext } from '@surge/config';
import type { FeedAdapter, FeedResult, FeedItem } from './types.js';
import { httpText } from './http.js';
import { regionForState, STATE_FIPS } from './regions.js';

/**
 * US Drought Monitor, weekly, by state. Alert score = (0.4·D2-only + 0.7·D3-only + 1.0·D4) area share; ingestion
 * applies the drought damage cap. Each state is its own production region.
 */
const STATES = ['IA', 'IL', 'IN', 'OH', 'MN', 'NE', 'MO', 'WI', 'SD', 'KS', 'ND', 'MT', 'OK', 'CO', 'TX', 'WA', 'CA', 'FL', 'OR', 'ID', 'GA', 'AL', 'AR', 'NC', 'MS', 'MI', 'PA', 'NY', 'KY', 'TN', 'SC', 'VA', 'LA', 'NM', 'AZ', 'UT', 'NV', 'WY'];
const MIN_D2_SHARE = 20; // percent of state area in D2 or worse before a threat is emitted

export interface UsdmRow { MapDate: string; StateAbbreviation: string; D0: number; D1: number; D2: number; D3: number; D4: number; ValidStart: string }

function parseCsv(text: string): UsdmRow[] {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0]!.split(',');
  return lines.slice(1).map((l) => {
    const v = l.split(',');
    const o: Record<string, string> = {};
    head.forEach((h, i) => { o[h] = v[i] ?? ''; });
    return { MapDate: o['MapDate']!, StateAbbreviation: o['StateAbbreviation']!, D0: Number(o['D0']), D1: Number(o['D1']), D2: Number(o['D2']), D3: Number(o['D3']), D4: Number(o['D4']), ValidStart: o['ValidStart']! };
  });
}

function mdy(d: Date): string { return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`; }

export const usdm: FeedAdapter = {
  id: 'usdm',
  label: 'US Drought Monitor',
  kind: 'live',
  ttlMs: 12 * 60 * 60 * 1000,
  snapshotName: 'usdm',

  async fetch(): Promise<FeedResult> {
    const end = new Date();
    const start = new Date(Date.now() - 14 * 864e5);
    const rows: UsdmRow[] = [];
    await Promise.all(STATES.map(async (st) => {
      const url = `https://usdmdataservices.unl.edu/api/StateStatistics/GetDroughtSeverityStatisticsByAreaPercent?aoi=${STATE_FIPS[st]}&startdate=${mdy(start)}&enddate=${mdy(end)}&statisticsType=1`;
      try { rows.push(...parseCsv(await httpText(url))); } catch { /* one state failing must not sink the feed */ }
    }));
    return this.parse({ rows });
  },

  parse(raw: unknown): FeedResult {
    const ctx = loadContext();
    const rows = (raw as { rows: UsdmRow[] }).rows ?? [];
    const latest = new Map<string, UsdmRow>();
    for (const r of rows) { const cur = latest.get(r.StateAbbreviation); if (!cur || r.MapDate > cur.MapDate) latest.set(r.StateAbbreviation, r); }
    const items: FeedItem[] = [];
    for (const [st, r] of latest) {
      const d2plus = r.D2; // USDM columns are cumulative: D2 = area in D2 or worse
      if (!(d2plus >= MIN_D2_SHARE)) continue;
      const region = ctx.regions[`us-state-${st}`] ?? regionForState(ctx, st);
      if (!region) continue;
      const frac = 1; // the state is its own region
      const score = ((0.4 * (r.D2 - r.D3)) + (0.7 * (r.D3 - r.D4)) + (1.0 * r.D4)) / 100;
      const area = ctx.focus?.areas.find((a) => a.id === st);
      const item: FeedItem = {
        id: `usdm-${st}`,
        name: `${r.D4 >= 10 ? 'Exceptional' : r.D3 >= 20 ? 'Extreme' : 'Severe'} drought across ${r.D2.toFixed(0)}% of ${area?.name ?? st}`,
        category: 'drought', kind: 'natural',
        regionId: region.id, admin: area?.name ?? st, iso3: 'USA',
        lat: area?.lat ?? region.lat, lng: area?.lng ?? region.lng,
        severity: score * frac, alertScore: true,
        start: `${r.MapDate.slice(0, 4)}-${r.MapDate.slice(4, 6)}`,
        text: `US Drought Monitor, week of ${r.ValidStart}: ${r.D2.toFixed(1)}% of the state in severe drought or worse (D2+), ${r.D3.toFixed(1)}% extreme (D3+), ${r.D4.toFixed(1)}% exceptional (D4)`,
        raw: r,
      };
      items.push(item);
    }
    return { items, source: { feed: 'US Drought Monitor', url: 'https://droughtmonitor.unl.edu', kind: 'live' } };
  },
};
