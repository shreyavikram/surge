import { loadContext } from '@surge/config';
import type { FeedAdapter, FeedResult, FeedItem } from './types.js';
import { httpText } from './http.js';
import { loadDetections, monthlyBirds, commodityFor, type Detection } from './aphis-archive.js';

/**
 * USDA APHIS HPAI confirmed detections.
 * Live: the public dashboard's monthly sheet (flock counts, no birds).
 * Archive: the dashboard's per-detection export saved by hand at data/snapshots/aphis-detections.csv
 * (date, state, county, production type, birds affected rounded to 0.1M by the export). The trailing
 * twelve months of layer, broiler, and turkey losses become national disease threats with monthly
 * timelines; severity = birds ÷ national inventory. County rows ride along as gated detail.
 */
const TABLEAU = 'https://publicdashboards.dl.usda.gov/t/MRP_PUB/views/VS_Avian_HPAIConfirmedDetections2022/HPAI2022ConfirmedDetections.csv?:showVizHome=no';
export interface AphisMonth { month: string; flocks?: number; birds?: number }
const MONTHS: Record<string, string> = { January: '01', February: '02', March: '03', April: '04', May: '05', June: '06', July: '07', August: '08', September: '09', October: '10', November: '11', December: '12' };
const MIN_BIRDS: Record<string, number> = { eggs: 1e6, chicken: 2e6, turkey: 0.5e6 };

export function parseTableauMonthly(csv: string): AphisMonth[] {
  const lines = csv.replace(/^﻿/, '').trim().split(/\r?\n/);
  const head = lines[0]?.split(',') ?? [];
  const iMonth = (() => { const i = head.findIndex((h) => /Month of/i.test(h)); return i >= 0 ? i : head.findIndex((h) => /Month/i.test(h) && !/Last/i.test(h)); })();
  const iFlocks = head.findIndex((h) => /Flocks/i.test(h));
  const out: AphisMonth[] = [];
  for (const l of lines.slice(1)) {
    const v = l.split(',');
    const m = (v[iMonth] ?? '').trim().split(' ');
    if (m.length !== 2 || !MONTHS[m[0]!]) continue;
    const row: AphisMonth = { month: `${m[1]}-${MONTHS[m[0]!]}` };
    if (iFlocks >= 0) row.flocks = Number((v[iFlocks] ?? '').replace(/[^0-9.]/g, '')) || 0;
    out.push(row);
  }
  return out.sort((a, b) => (a.month < b.month ? -1 : 1));
}

function monthsAgo(n: number, now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1));
  return d.toISOString().slice(0, 7);
}

export function threatsFromDetections(dets: Detection[], now = new Date()): FeedItem[] {
  const ctx = loadContext();
  const from = monthsAgo(11, now);
  const items: FeedItem[] = [];
  const names = { eggs: 'HPAI losses in egg-laying flocks', chicken: 'HPAI losses in broiler flocks', turkey: 'HPAI losses in turkey flocks' } as const;
  for (const commodity of ['eggs', 'chicken', 'turkey'] as const) {
    const monthly = monthlyBirds(dets, commodity, from);
    const total = monthly.reduce((a, m) => a + m.birds, 0);
    if (total < (MIN_BIRDS[commodity] ?? 1e6)) continue;
    const inv = ctx.commodities[commodity]?.supply.nationalInventory ?? 325e6;
    const first = monthly[0]!.month;
    const idx = (m: string) => (Number(m.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + (Number(m.slice(5, 7)) - Number(first.slice(5, 7)));
    const byState = new Map<string, number>();
    for (const d of dets) if (commodityFor(d.production) === commodity && d.date.slice(0, 7) >= from) byState.set(d.state, (byState.get(d.state) ?? 0) + d.birds);
    const topStates = [...byState.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, b]) => `${s} ${(b / 1e6).toFixed(1)}M`).join(', ');
    items.push({
      id: `aphis-hpai-${commodity}`, name: `${names[commodity]}, trailing 12 months (${(total / 1e6).toFixed(1)}M birds)`, category: 'disease', kind: 'natural',
      regionId: 'us-national', admin: 'United States', iso3: 'USA', lat: 39.8, lng: -98.6,
      commodities: [{ id: commodity, relevance: 1 }],
      severity: Math.min(1, total / inv), start: first, months: 18,
      physical: { kind: 'animals_affected', value: total, timeline: monthly.map((m) => ({ month: idx(m.month), value: m.birds })) },
      text: `APHIS confirmed detections by month of confirmation (export rounds birds to 0.1M). Largest states: ${topStates}`,
      raw: { byState: Object.fromEntries(byState), gated: { detections: dets.filter((d) => commodityFor(d.production) === commodity && d.date.slice(0, 7) >= from).map((d) => ({ date: d.date, state: d.state, county: d.county, birds: d.birds })) } },
    });
  }
  return items;
}

export const aphis: FeedAdapter = {
  id: 'aphis',
  label: 'USDA APHIS HPAI detections',
  kind: 'live',
  ttlMs: 12 * 60 * 60 * 1000,
  snapshotName: 'aphis',

  async fetch(): Promise<FeedResult> {
    let monthly: AphisMonth[] = [];
    try { monthly = parseTableauMonthly(await httpText(TABLEAU, 30000)); } catch { /* the archive still works without the sheet */ }
    return this.parse({ monthly, detections: loadDetections() ?? [] });
  },

  parse(raw: unknown): FeedResult {
    const { monthly = [], detections = [] } = raw as { monthly?: AphisMonth[]; detections?: Detection[] };
    const items = threatsFromDetections(detections);
    const series: FeedResult['series'] = { 'aphis-flocks': { months: monthly.map((m) => m.month), values: monthly.map((m) => m.flocks ?? 0) } };
    const latest = detections.length ? detections[detections.length - 1]!.date : undefined;
    return { items, series, source: { feed: detections.length ? `USDA APHIS confirmed detections (dashboard export through ${latest})` : 'USDA APHIS (dashboard monthly sheet)', url: 'https://www.aphis.usda.gov/livestock-poultry-disease/avian/avian-influenza/hpai-detections/commercial-backyard-flocks', kind: detections.length ? 'archive' : 'live', note: detections.length ? undefined : 'per-detection export not present; no bird counts' } };
  },
};
