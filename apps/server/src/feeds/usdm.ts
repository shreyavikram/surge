import { loadContext } from '@surge/config';
import type { FeedAdapter, FeedResult, FeedItem } from './types.js';
import { httpText } from './http.js';
import { regionForState, STATE_FIPS } from './regions.js';

/**
 * US Drought Monitor, weekly, by state. Alert score = (0.5·D2 + 0.8·D3 + 1.0·D4) area share; ingestion
 * applies the drought damage cap. A state inside a multi-state region carries 1/n of the region's severity.
 */
const STATES = ['IA', 'IL', 'IN', 'OH', 'MN', 'NE', 'MO', 'WI', 'SD', 'KS', 'ND', 'MT', 'OK', 'CO', 'TX', 'WA', 'CA', 'FL', 'OR', 'ID', 'GA', 'AL', 'AR', 'NC', 'MS'];
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
      const region = regionForState(ctx, st);
      if (!region) continue;
      // this state's share of the region's production (average over the region's commodities), so a drought in one
      // state of a multi-state region scales to the region the engine models
      const members = ctx.focus?.regionStates[region.id] ?? [st];
      const comms = Object.keys(region.usSupplyShare ?? {});
      let frac = 0;
      for (const cid of comms) {
        const ps = ctx.focus?.production[cid]?.[st] ?? 0;
        const pr = members.reduce((a, m) => a + (ctx.focus?.production[cid]?.[m] ?? 0), 0);
        frac += pr > 0 ? ps / pr : 0;
      }
      frac = comms.length > 0 ? frac / comms.length : 1 / Math.max(1, members.length);
      const score = ((0.4 * (r.D2 - r.D3)) + (0.7 * (r.D3 - r.D4)) + (1.0 * r.D4)) / 100;
      const area = ctx.focus?.areas.find((a) => a.id === st);
      const item: FeedItem = {
        id: `usdm-${st}`,
        name: `Drought, ${area?.name ?? st} (${r.D2.toFixed(0)}% in D2+)`,
        category: 'drought', kind: 'natural',
        regionId: region.id, admin: area?.name ?? st, iso3: 'USA',
        lat: area?.lat ?? region.lat, lng: area?.lng ?? region.lng,
        severity: score * frac, alertScore: true,
        start: `${r.MapDate.slice(0, 4)}-${r.MapDate.slice(4, 6)}`,
        text: `USDM ${r.ValidStart}: D2 ${r.D2.toFixed(1)}%, D3 ${r.D3.toFixed(1)}%, D4 ${r.D4.toFixed(1)}% of state area`,
        raw: r,
      };
      items.push(item);
    }
    return { items, source: { feed: 'US Drought Monitor', url: 'https://droughtmonitor.unl.edu', kind: 'live' } };
  },
};
