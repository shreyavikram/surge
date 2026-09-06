import { loadContext } from '@surge/config';
import type { ThreatCategory } from '@surge/engine';
import type { FeedAdapter, FeedResult, FeedItem } from './types.js';
import { regionForCountry } from './regions.js';

/**
 * Global Trade Alert: interventions announced in the last 180 days that affect the United States, of the
 * types SURGE models (import tariffs the US imposes; export bans/restrictions by supplier countries).
 * Severity: tariff → ad valorem rate when GTA gives one, else 0.1; export ban → 0.8 (full ban) or 0.3 (quota/licensing).
 */
export interface GtaIntervention {
  intervention_id: number; state_act_title: string; intervention_type?: string; gta_evaluation?: string;
  date_announced?: string; date_implemented?: string | null; date_removed?: string | null;
  implementing_jurisdictions?: { iso: string; name: string }[]; affected_jurisdictions?: { iso: string; name: string }[];
  affected_products?: (number | string)[]; affected_sectors?: (number | string)[]; intervention_url?: string;
}

const TYPE_MAP: [RegExp, ThreatCategory, number][] = [
  [/export ban|export prohibition/i, 'export_ban', 0.8],
  [/export (quota|licens|tax|restriction|control)/i, 'export_ban', 0.3],
  [/import tariff|tariff|customs dut/i, 'tariff', 0.1],
  [/import ban|embargo|sanction/i, 'embargo', 0.8],
];

/** HS chapters (2-digit) → SURGE commodities */
const HS_CHAPTER: Record<string, string[]> = {
  '02': ['beef', 'pork'], '04': ['milk', 'cheese', 'eggs'], '07': ['tomatoes', 'lettuce', 'fresh-vegetables', 'potatoes'], '08': ['bananas', 'citrus', 'apples'],
  '09': ['coffee'], '10': ['rice', 'wheat', 'corn'], '11': ['bread'], '12': ['soybeans'], '15': ['fats-oils'], '17': ['sugar'], '19': ['infant-formula'], '31': ['fertilizer'], '27': ['energy'],
};

function commoditiesFor(products: (number | string)[] | undefined): string[] {
  const out = new Set<string>();
  for (const p of products ?? []) {
    const s = String(p).padStart(6, '0').slice(0, 2);
    for (const c of HS_CHAPTER[s] ?? []) out.add(c);
  }
  return [...out];
}

export const gta: FeedAdapter = {
  id: 'gta',
  label: 'Global Trade Alert',
  kind: 'live',
  ttlMs: 12 * 60 * 60 * 1000,
  requiresKey: 'GTA_API_KEY',
  snapshotName: 'gta',

  async fetch(env): Promise<FeedResult> {
    const res = await fetch('https://api.globaltradealert.org/api/v1/data/', {
      method: 'POST', headers: { Authorization: `APIKey ${env.GTA_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 300, offset: 0, sorting: '-date_announced', request_data: { affected: [840] } }),
    });
    if (!res.ok) throw new Error(`GTA ${res.status}`);
    return this.parse(await res.json());
  },

  parse(raw: unknown): FeedResult {
    const ctx = loadContext();
    const rows = (Array.isArray(raw) ? raw : (raw as { data?: GtaIntervention[] }).data ?? []) as GtaIntervention[];
    const cutoff = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10);
    const items: FeedItem[] = [];
    for (const r of rows) {
      if ((r.date_announced ?? '') < cutoff) continue;
      if (r.date_removed && r.date_removed < new Date().toISOString().slice(0, 10)) continue;
      const m = TYPE_MAP.find(([re]) => re.test(r.intervention_type ?? ''));
      if (!m) continue;
      const [, category, sev] = m;
      const comms = commoditiesFor(r.affected_products).filter((id) => ctx.commodities[id] || ctx.inputs[id]);
      if (comms.length === 0) continue;
      // Tariff by the US on an origin → region = origin (affected); export ban by a supplier → region = implementer
      const implementer = r.implementing_jurisdictions?.[0]?.iso;
      const isUsAction = implementer === 'USA';
      const partner = isUsAction ? r.affected_jurisdictions?.find((j) => j.iso !== 'USA')?.iso : implementer;
      if (!partner) continue;
      const region = regionForCountry(ctx, partner);
      if (!region) continue;
      const rate = (r.state_act_title.match(/(\d{1,3})\s?%/) ?? [])[1];
      items.push({
        id: `gta-${r.intervention_id}`, name: r.state_act_title.length > 90 ? r.state_act_title.slice(0, 87) + '…' : r.state_act_title,
        category, kind: 'geopolitical', regionId: region.id, admin: region.name, iso3: partner, lat: region.lat, lng: region.lng,
        commodities: comms.map((id) => ({ id, relevance: 1 })),
        severity: category === 'tariff' && rate ? Math.min(1, Number(rate) / 100) : sev,
        start: (r.date_implemented ?? r.date_announced ?? '').slice(0, 7) || undefined,
        status: r.date_implemented ? 'active' : 'breaking', confidence: r.date_implemented ? 1 : 0.7,
        text: `${r.intervention_type ?? ''} · GTA ${r.gta_evaluation ?? ''} · ${r.intervention_url ?? ''}`,
        raw: { id: r.intervention_id, implementer, partner, products: (r.affected_products ?? []).slice(0, 10) },
      } as FeedItem);
    }
    return { items, source: { feed: 'Global Trade Alert', url: 'https://globaltradealert.org', kind: 'live' } };
  },
};
