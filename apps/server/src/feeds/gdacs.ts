import type { ThreatCategory } from '@surge/engine';
import type { FeedAdapter, FeedResult, FeedItem } from './types.js';
import { httpJson, ymd } from './http.js';
import countryPopulation from '../../../../packages/config/data/country-population.json' with { type: 'json' };

// GDACS event types we model (EQ/VO are ignored — not food-supply hazards here).
const CATEGORY: Record<string, ThreatCategory> = { FL: 'flood', TC: 'storm', WF: 'wildfire', DR: 'drought' };
// Green alerts are information only (no supply shock); Orange and Red produce threats.
const SEVERITY: Record<string, number> = { Orange: 0.5, Red: 1.0 };

/**
 * A GDACS point is scaled to the whole country's output by the engine, so the alert score is multiplied by the share of
 * the country the event touches: affected population ÷ (AFFECTED_SHARE_FULL × country population), capped at 1. An event
 * reaching 15% of a country's people counts as national. Without an affected-population field the share is DEFAULT_SHARE.
 */
const AFFECTED_SHARE_FULL = 0.15;
const DEFAULT_SHARE = 0.5;
const POPULATION = (countryPopulation as unknown as { population: Record<string, number> }).population;

interface GdacsFeature {
  geometry?: { coordinates?: [number, number] };
  properties: {
    eventtype: string; eventid: number; name?: string; description?: string;
    alertlevel?: string; country?: string; iso3?: string; fromdate?: string; todate?: string;
    /** people in the affected area: a number in the GeoJSON list, `{ value }` in per-event data, absent in some episodes */
    population?: number | string | { value?: number | string } | null;
    severitydata?: { severity?: number; severitytext?: string; severityunit?: string };
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

/** Affected population as a number of people, or undefined when GDACS did not report one. */
export function affectedPopulation(p: GdacsFeature['properties']): number | undefined {
  const raw = p.population;
  const v = raw !== null && typeof raw === 'object' ? raw.value : raw;
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Share of the country the event affects (0..1), from affected population over country population. */
export function affectedShare(iso3: string | undefined, affected: number | undefined): number {
  const total = iso3 ? POPULATION[iso3] : undefined;
  if (affected === undefined || !total) return DEFAULT_SHARE;
  return Math.min(1, affected / (AFFECTED_SHARE_FULL * total));
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
      const level = SEVERITY[p.alertlevel ?? ''];
      if (level === undefined) continue; // Green (and unknown) alerts are not supply shocks
      const coords = f.geometry?.coordinates;
      if (!coords) continue;
      const label: Record<string, string> = { FL: 'Flooding', TC: 'Tropical cyclone', WF: 'Wildfire', DR: 'Drought' };
      // lead with the country that matters most to US supply when GDACS lists several
      const SUPPLIERS = ['Mexico', 'Canada', 'Brazil', 'India', 'Ukraine', 'Russia', 'Turkey', 'Viet Nam', 'Vietnam', 'Thailand', 'Guatemala', 'Ecuador', 'Colombia', 'Honduras', 'Costa Rica', 'Peru', 'Chile', 'Argentina', 'Australia', 'Indonesia', 'Italy', 'France', 'Spain', 'China'];
      const raw = (p.country ?? '').split(',').map((x) => x.trim()).filter(Boolean);
      const lead = SUPPLIERS.find((s) => raw.includes(s));
      const countries = lead ? [lead, ...raw.filter((c) => c !== lead)] : raw;
      const where = countries.length === 0 ? 'unknown location' : countries.length <= 2 ? countries.join(' and ') : `${countries[0]} and ${countries.length - 1} other countries`;
      const affected = affectedPopulation(p);
      const share = affectedShare(p.iso3, affected);
      const total = p.iso3 ? POPULATION[p.iso3] : undefined;
      const scaleNote = affected !== undefined && total
        ? `${affected.toLocaleString('en-US')} people affected of ${Math.round(total / 1e6)}M (${(share * 100).toFixed(1)}% of the national scale)`
        : `no affected-population figure; assumed ${DEFAULT_SHARE * 100}% of the national scale`;
      const item: FeedItem = {
        id: `gdacs-${p.eventid}`,
        name: `${label[p.eventtype] ?? p.eventtype}, ${where}`,
        category,
        kind: 'natural',
        lng: coords[0],
        lat: coords[1],
        severity: level * share,
        alertScore: true,
        text: `${p.description ?? `${p.alertlevel} ${label[p.eventtype] ?? p.eventtype}`}; ${p.alertlevel} alert; ${scaleNote}`,
      };
      if (p.country) item.admin = p.country;
      if (p.iso3) item.iso3 = p.iso3;
      if (p.fromdate) item.start = p.fromdate.slice(0, 7);
      const months = monthsBetween(p.fromdate, p.todate);
      if (months) item.months = months;
      items.push(item);
    }
    return { items, source: { feed: 'GDACS', url: 'https://www.gdacs.org', kind: 'live' } };
  },
};
