import type { ThreatCategory } from '@surge/engine';
import type { FeedAdapter, FeedResult, FeedItem } from './types.js';
import { httpJson, ymd } from './http.js';

// GDACS event types we model (EQ/VO are ignored — not food-supply hazards here).
const CATEGORY: Record<string, ThreatCategory> = { FL: 'flood', TC: 'storm', WF: 'wildfire', DR: 'drought' };
const SEVERITY: Record<string, number> = { Green: 0.2, Orange: 0.5, Red: 1.0 };

interface GdacsFeature {
  geometry?: { coordinates?: [number, number] };
  properties: {
    eventtype: string; eventid: number; name?: string; description?: string;
    alertlevel?: string; country?: string; iso3?: string; fromdate?: string; todate?: string;
  };
}
interface GdacsFC { features?: GdacsFeature[] }

function monthsBetween(from?: string, to?: string): number | undefined {
  if (!from || !to) return undefined;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return undefined;
  return Math.max(1, Math.round((b - a) / (30 * 864e5)));
}

export const gdacs: FeedAdapter = {
  id: 'gdacs',
  label: 'GDACS hazard alerts',
  kind: 'live',
  ttlMs: 30 * 60 * 1000,
  snapshotName: 'gdacs',

  async fetch(): Promise<FeedResult> {
    const to = new Date();
    const from = new Date(Date.now() - 30 * 864e5);
    const url = `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=DR;FL;TC;WF&fromDate=${ymd(from)}&toDate=${ymd(to)}`;
    return this.parse(await httpJson(url));
  },

  parse(raw: unknown): FeedResult {
    const fc = raw as GdacsFC;
    const items: FeedItem[] = [];
    for (const f of fc.features ?? []) {
      const p = f.properties;
      const category = CATEGORY[p.eventtype];
      if (!category) continue; // skip EQ/VO and anything unmodeled
      const coords = f.geometry?.coordinates;
      if (!coords) continue;
      const label: Record<string, string> = { FL: 'Flooding', TC: 'Tropical cyclone', WF: 'Wildfire', DR: 'Drought' };
      const countries = (p.country ?? '').split(',').map((x) => x.trim()).filter(Boolean);
      const where = countries.length === 0 ? 'unknown location' : countries.length <= 2 ? countries.join(' and ') : `${countries[0]} and ${countries.length - 1} other countries`;
      const item: FeedItem = {
        id: `gdacs-${p.eventid}`,
        name: `${label[p.eventtype] ?? p.eventtype}, ${where}`,
        category,
        kind: 'natural',
        lng: coords[0],
        lat: coords[1],
        severity: SEVERITY[p.alertlevel ?? ''] ?? 0.5,
        alertScore: true,
      };
      if (p.country) item.admin = p.country;
      if (p.iso3) item.iso3 = p.iso3;
      if (p.fromdate) item.start = p.fromdate.slice(0, 7);
      const months = monthsBetween(p.fromdate, p.todate);
      if (months) item.months = months;
      if (p.description) item.text = p.description;
      items.push(item);
    }
    return { items, source: { feed: 'GDACS', url: 'https://www.gdacs.org', kind: 'live' } };
  },
};
