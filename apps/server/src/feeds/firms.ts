import { loadContext } from '@surge/config';
import type { FeedAdapter, FeedResult, FeedItem } from './types.js';
import { httpText } from './http.js';
import { stateAt } from '../geo.js';

/**
 * NASA FIRMS VIIRS hotspots over CONUS (2 days), placed in a state by point-in-polygon against the state outline.
 * Each hotspot is weighted by its fire radiative power (FRP, MW): alert score = Σ FRP ÷ FULL_SCORE_MW (cap 1), and a
 * state appears only once Σ FRP ≥ MIN_FRP_MW. FRP separates a wildfire front (hundreds of MW per pixel) from the
 * many small field burns that inflate raw counts in September; the wildfire damage cap applies at ingestion.
 */
const MIN_FRP_MW = 1500;
const FULL_SCORE_MW = 20000;

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
    const iLat = head.indexOf('latitude'), iLng = head.indexOf('longitude'), iDate = head.indexOf('acq_date'), iFrp = head.indexOf('frp');
    const byState = new Map<string, { n: number; frp: number }>();
    let date = '';
    for (const l of lines.slice(1)) {
      const v = l.split(',');
      const lat = Number(v[iLat]), lng = Number(v[iLng]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      date = v[iDate] ?? date;
      const frp = iFrp >= 0 ? Number(v[iFrp]) : NaN;
      // one state per hotspot, by outline: the multi-state production regions overlap and would triple-count a fire
      const st = stateAt(lng, lat);
      if (!st) continue;
      const cur = byState.get(st) ?? { n: 0, frp: 0 };
      cur.n += 1;
      cur.frp += Number.isFinite(frp) && frp > 0 ? frp : 0;
      byState.set(st, cur);
    }
    const items: FeedItem[] = [];
    for (const [st, { n, frp }] of byState) {
      if (frp < MIN_FRP_MW) continue;
      const rid = `us-state-${st}`;
      const r = ctx.regions[rid];
      if (!r) continue;
      const mw = Math.round(frp);
      items.push({
        id: `firms-${rid}`, name: `Wildfire activity, ${r.name.split(' (')[0]} (${n} hotspots, ${mw.toLocaleString('en-US')} MW in 48 h)`, category: 'wildfire', kind: 'natural',
        regionId: rid, admin: r.name, iso3: 'USA', lat: r.lat, lng: r.lng,
        severity: Math.min(1, frp / FULL_SCORE_MW), alertScore: true, start: date ? date.slice(0, 7) : undefined,
        text: `${n} VIIRS hotspots inside the state outline over 48 hours (${date}), fire radiative power ${mw.toLocaleString('en-US')} MW in total; score = FRP ÷ ${FULL_SCORE_MW.toLocaleString('en-US')} MW, states below ${MIN_FRP_MW.toLocaleString('en-US')} MW are not shown; hotspots include agricultural burning`,
      } as FeedItem);
    }
    return { items, source: { feed: 'NASA FIRMS', url: 'https://firms.modaps.eosdis.nasa.gov', kind: 'live' } };
  },
};
