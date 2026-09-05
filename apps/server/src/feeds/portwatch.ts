import type { FeedAdapter, FeedResult, FeedItem } from './types.js';
import { httpJson } from './http.js';

// The four IMF PortWatch chokepoints we have gazetteer regions for.
const CHOKE_REGION: Record<string, string> = {
  chokepoint1: 'suez-red-sea',  // Suez Canal
  chokepoint4: 'suez-red-sea',  // Bab el-Mandeb
  chokepoint2: 'panama-canal',
  chokepoint6: 'hormuz',
};

const URL_ALL =
  'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query' +
  '?where=1%3D1&outFields=date,portid,portname,n_total&orderByFields=date%20DESC&resultRecordCount=400&f=json';

interface PwFeature { attributes: { date: string; portid: string; portname: string; n_total: number } }
interface PwResponse { features?: PwFeature[] }

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export const portwatch: FeedAdapter = {
  id: 'portwatch',
  label: 'IMF PortWatch chokepoints',
  kind: 'live',
  ttlMs: 6 * 60 * 60 * 1000,
  snapshotName: 'portwatch',

  async fetch(): Promise<FeedResult> {
    return this.parse(await httpJson(URL_ALL));
  },

  parse(raw: unknown): FeedResult {
    const rows = (raw as PwResponse).features ?? [];
    // Group by chokepoint, newest first.
    const byPort = new Map<string, PwFeature['attributes'][]>();
    for (const f of rows) {
      const a = f.attributes;
      if (!byPort.has(a.portid)) byPort.set(a.portid, []);
      byPort.get(a.portid)!.push(a);
    }
    const items: FeedItem[] = [];
    for (const [portid, list] of byPort) {
      list.sort((x, y) => (x.date < y.date ? 1 : -1)); // newest first
      const latest = list[0]!;
      const rest = list.slice(1);
      // Baseline = mean transit over the trailing window; decline = shortfall vs baseline.
      const baseline = rest.length ? rest.reduce((s, r) => s + r.n_total, 0) / rest.length : latest.n_total;
      const decline = baseline > 0 ? clamp01(1 - latest.n_total / baseline) : 0;
      const item: FeedItem = {
        id: `portwatch-${portid}`,
        name: `${latest.portname} transit`,
        category: 'chokepoint',
        kind: 'geopolitical',
        severity: decline,
        physical: { kind: 'transit_decline_fraction', value: decline },
        start: latest.date.slice(0, 7),
        text: `${latest.portname}: ${latest.n_total} transits vs ${baseline.toFixed(0)} trailing average`,
        raw: { portid, latest: latest.n_total, baseline: Math.round(baseline), date: latest.date },
      };
      const regionId = CHOKE_REGION[portid];
      if (regionId) item.regionId = regionId;
      items.push(item);
    }
    items.sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0));
    return { items, source: { feed: 'IMF PortWatch', url: 'https://portwatch.imf.org', kind: 'live' } };
  },
};
