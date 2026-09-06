import { loadContext } from '@surge/config';
import type { FeedAdapter, FeedResult, FeedItem } from './types.js';
import { httpText } from './http.js';
import { usRegions, inBbox } from './regions.js';

/** NASA FIRMS VIIRS hotspots over CONUS (2 days). Alert score = hotspots in a production region ÷ 2000 (modeled; September counts include field burns); wildfire cap applies. */
const MIN_HOTSPOTS = 100;

export const firms: FeedAdapter = {
  id: 'firms',
  label: 'NASA FIRMS wildfire hotspots',
  kind: 'live',
  ttlMs: 3 * 60 * 60 * 1000,
  requiresKey: 'FIRMS_MAP_KEY',
  snapshotName: 'firms',

  async fetch(env): Promise<FeedResult> {
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${env.FIRMS_MAP_KEY}/VIIRS_SNPP_NRT/-125,24,-66,50/2`;
    return this.parse(await httpText(url, 60000));
  },

  parse(raw: unknown): FeedResult {
    const ctx = loadContext();
    const lines = String(raw).trim().split(/\r?\n/);
    const head = lines[0]?.split(',') ?? [];
    const iLat = head.indexOf('latitude'), iLng = head.indexOf('longitude'), iDate = head.indexOf('acq_date');
    const counts = new Map<string, number>();
    let date = '';
    for (const l of lines.slice(1)) {
      const v = l.split(',');
      const lat = Number(v[iLat]), lng = Number(v[iLng]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      date = v[iDate] ?? date;
      // count once per state; the multi-state production regions overlap the states and would triple-count a fire
      for (const r of usRegions(ctx)) if (r.id.startsWith('us-state-') && inBbox(r.bbox, lng, lat)) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
    }
    const items: FeedItem[] = [];
    for (const [rid, n] of counts) {
      if (n < MIN_HOTSPOTS) continue;
      const r = ctx.regions[rid]!;
      items.push({
        id: `firms-${rid}`, name: `Wildfire activity, ${r.name.split(' (')[0]} (${n} satellite hotspots in 48 h)`, category: 'wildfire', kind: 'natural',
        regionId: rid, admin: r.name, iso3: 'USA', lat: r.lat, lng: r.lng,
        severity: Math.min(1, n / 2000), alertScore: true, start: date ? date.slice(0, 7) : undefined,
        text: `${n} VIIRS hotspots in the region bbox over 48 hours (${date}); hotspot counts include agricultural burning`,
      } as FeedItem);
    }
    return { items, source: { feed: 'NASA FIRMS', url: 'https://firms.modaps.eosdis.nasa.gov', kind: 'live' } };
  },
};
