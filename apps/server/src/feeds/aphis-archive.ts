import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** One confirmed HPAI detection from the APHIS dashboard export (data/snapshots/aphis-detections.csv). */
export interface Detection { date: string; state: string; county: string; production: string; birds: number }

const FILE = fileURLToPath(new URL('../../../../data/snapshots/aphis-detections.csv', import.meta.url));

export function parseDetectionsCsv(text: string): Detection[] {
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  const head = (lines[0] ?? '').split(',');
  const idx = (n: string) => head.indexOf(n);
  const iD = idx('date'), iS = idx('state'), iC = idx('county'), iP = idx('production'), iB = idx('birds');
  const out: Detection[] = [];
  for (const l of lines.slice(1)) {
    const v = l.split(',');
    const d = v[iD] ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    out.push({ date: d, state: v[iS] ?? '', county: v[iC] ?? '', production: v[iP] ?? '', birds: Number(v[iB] ?? 0) || 0 });
  }
  return out;
}

export function loadDetections(): Detection[] | null {
  if (!existsSync(FILE)) return null;
  try { return parseDetectionsCsv(readFileSync(FILE, 'utf8')); } catch { return null; }
}

/** Which SURGE commodity a production category hits. */
export function commodityFor(production: string): 'eggs' | 'chicken' | 'turkey' | null {
  const p = production.toLowerCase();
  if (p.includes('table egg')) return 'eggs';
  if (p.includes('turkey')) return 'turkey';
  if (p.includes('broiler')) return 'chicken';
  return null;
}

/** Birds affected by month for one commodity, restricted to dates >= from (YYYY-MM). */
export function monthlyBirds(dets: Detection[], commodity: 'eggs' | 'chicken' | 'turkey', from: string): { month: string; birds: number }[] {
  const m = new Map<string, number>();
  for (const d of dets) {
    if (commodityFor(d.production) !== commodity) continue;
    const ym = d.date.slice(0, 7);
    if (ym < from) continue;
    m.set(ym, (m.get(ym) ?? 0) + d.birds);
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([month, birds]) => ({ month, birds }));
}
