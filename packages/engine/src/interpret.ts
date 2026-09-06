// packages/engine/src/interpret.ts
// Rule-based scenario interpreter: free text → threat candidates, using only the configuration's
// commodities, inputs, regions, and threat types. Deterministic and offline; an LLM can propose
// candidates through the same ThreatCandidate shape, and this module's validator is the last word.
import type { EngineContext, Threat, ThreatCategory } from './types.js';

export interface ThreatCandidate {
  name: string;
  category: ThreatCategory;
  regionId: string;
  commodities: { id: string; relevance: number }[];
  severity: number;
  months: number;
  confidence: number;               // 0..1, how much of the text was matched
  matched: string[];                // terms that fired
  source: 'rule-based' | 'llm';
  /** the text named a threat type / a place explicitly (false when a default was assumed) */
  explicitCategory?: boolean;
  explicitRegion?: boolean;
}

const CATEGORY_TERMS: Record<ThreatCategory, string[]> = {
  drought: ['drought', 'dry spell', 'water shortage', 'low rainfall', 'aridity'],
  heat: ['heat wave', 'heatwave', 'extreme heat', 'record heat', 'heat dome'],
  flood: ['flood', 'flooding', 'inundat', 'levee'],
  storm: ['hurricane', 'cyclone', 'typhoon', 'storm', 'tornado', 'hail'],
  wildfire: ['wildfire', 'fire season', 'bushfire', 'forest fire', 'smoke'],
  pest: ['locust', 'pest', 'fusarium', 'blight', 'fungus', 'infestation', 'armyworm'],
  disease: ['avian influenza', 'bird flu', 'hpai', 'h5n1', 'swine fever', 'asf', 'foot-and-mouth', 'fmd', 'outbreak', 'depopulat', 'culling', 'disease'],
  tariff: ['tariff', 'duty', 'duties', 'levy'],
  export_ban: ['export ban', 'export restriction', 'export halt', 'bans exports', 'halts exports', 'suspends exports', 'export quota'],
  embargo: ['embargo', 'sanction', 'boycott', 'blockade'],
  war: ['war', 'invasion', 'invade', 'invades', 'invaded', 'conflict', 'military', 'missile', 'strike', 'attack', 'annex'],
  instability: ['coup', 'unrest', 'protest', 'instability', 'riot', 'strike', 'collapse'],
  chokepoint: ['canal', 'strait', 'shipping', 'chokepoint', 'red sea', 'suez', 'hormuz', 'panama', 'malacca', 'bosporus', 'port closure', 'houthi'],
  import_dependence: ['import dependence', 'dependency'],
  input_cost: ['fertilizer', 'natural gas', 'diesel', 'energy price', 'fuel', 'urea', 'ammonia', 'potash', 'feed cost'],
  facility: ['plant closure', 'recall', 'factory', 'plant shut', 'shutdown', 'contamination', 'facility'],
};

const CATEGORY_SEVERITY: Partial<Record<ThreatCategory, number>> = {
  drought: 0.15, heat: 0.1, flood: 0.15, storm: 0.15, wildfire: 0.08, pest: 0.15, disease: 0.15,
  tariff: 0.25, export_ban: 0.8, embargo: 1, war: 0.5, instability: 0.3, chokepoint: 0.5, input_cost: 0.3, facility: 0.2,
};

const REGION_TERMS: Record<string, string[]> = {
  'us-iowa': ['iowa'],
  'us-midwest-corn-belt': ['midwest', 'corn belt', 'illinois', 'indiana', 'ohio', 'minnesota', 'nebraska', 'missouri', 'wisconsin', 'south dakota'],
  'us-plains-wheat': ['plains', 'kansas', 'north dakota', 'montana', 'oklahoma', 'colorado', 'wheat belt'],
  'us-california-central-valley': ['california', 'central valley', 'san joaquin', 'salinas', 'fresno'],
  'us-florida': ['florida'],
  'us-pacific-northwest': ['pacific northwest', 'washington state', 'oregon', 'idaho', 'columbia basin'],
  'us-southeast-broilers': ['georgia', 'alabama', 'arkansas', 'north carolina', 'mississippi', 'southeast', 'delmarva'],
  'us-national': ['united states', 'u.s.', 'america', 'across the country', 'multi-state', 'american farmers', 'us farmers'],
  'mexico': ['mexico', 'mexican', 'sinaloa', 'michoacán', 'michoacan'],
  'canada': ['canada', 'canadian', 'ontario', 'alberta', 'saskatchewan', 'manitoba'],
  'brazil': ['brazil', 'brazilian', 'mato grosso', 'minas gerais', 'paraná', 'parana'],
  'guatemala': ['guatemala', 'guatemalan', 'central america'],
  'ecuador': ['ecuador', 'ecuadorian'],
  'honduras': ['honduras', 'honduran'],
  'costa-rica': ['costa rica', 'costa rican'],
  'colombia': ['colombia', 'colombian'],
  'black-sea': ['black sea', 'kerch', 'bosporus', 'odesa port', 'odessa port'],
  'ukraine': ['ukraine', 'ukrainian', 'odesa', 'odessa', 'kyiv', 'crimea'],
  'russia': ['russia', 'russian', 'moscow', 'kremlin'],
  'hormuz': ['hormuz', 'persian gulf', 'iran', 'gulf states', 'qatar', 'saudi'],
  'suez-red-sea': ['red sea', 'suez', 'bab el-mandeb', 'yemen', 'houthi'],
  'panama-canal': ['panama'],
  'turkey': ['turkey', 'türkiye', 'turkiye', 'turkish'],
  'vietnam': ['vietnam', 'vietnamese', 'robusta'],
  'indonesia': ['indonesia', 'indonesian', 'palm oil'],
  'india': ['india', 'indian', 'basmati', 'new delhi'],
  'thailand': ['thailand', 'thai', 'jasmine rice', 'bangkok'],
  'pakistan': ['pakistan', 'pakistani'],
  'china': ['china', 'chinese', 'beijing'],
  'iran': ['iran', 'iranian', 'tehran'],
};

const COMMODITY_TERMS: Record<string, string[]> = {
  eggs: ['egg', 'layer', 'laying hen', 'hens'],
  chicken: ['chicken', 'broiler', 'poultry'],
  turkey: ['turkeys', 'turkey meat', 'turkey flock'],
  beef: ['beef', 'cattle', 'cow', 'steer', 'ranch'],
  pork: ['pork', 'hog', 'pig', 'swine', 'bacon'],
  milk: ['milk', 'dairy'],
  cheese: ['cheese'],
  bread: ['bread', 'flour', 'bakery'],
  rice: ['rice'],
  potatoes: ['potato', 'potatoes'],
  lettuce: ['lettuce', 'leafy green', 'salad'],
  tomatoes: ['tomato', 'tomatoes'],
  'fresh-vegetables': ['vegetable', 'produce', 'peppers', 'cucumbers', 'avocado', 'berries'],
  apples: ['apple'],
  bananas: ['banana'],
  citrus: ['citrus', 'orange', 'grapefruit', 'lemon', 'lime'],
  coffee: ['coffee', 'arabica', 'robusta'],
  sugar: ['sugar', 'sugarcane', 'sugar beet'],
  'fats-oils': ['cooking oil', 'vegetable oil', 'sunflower oil', 'soybean oil', 'palm oil', 'canola', 'oils'],
  'infant-formula': ['infant formula', 'baby formula', 'formula'],
  corn: ['corn', 'maize', 'feed grain'],
  soybeans: ['soybean', 'soy', 'soymeal'],
  wheat: ['wheat', 'grain'],
  fertilizer: ['fertilizer', 'urea', 'ammonia', 'potash', 'nitrogen'],
  energy: ['diesel', 'fuel', 'natural gas', 'energy', 'oil price'],
};

function norm(s: string): string {
  return ' ' + s.toLowerCase().replace(/\bnew mexico\b/g, 'newmexico-state').replace(/[^a-z0-9äéíóöúü.%\- ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
}

/** Verb-pattern detection for policy categories that substrings miss ("bans all exports", "halted grain exports"). */
const CATEGORY_PATTERNS: Partial<Record<ThreatCategory, RegExp[]>> = {
  export_ban: [/\bban(s|ned|ning)?\b[^.]{0,40}\bexport/, /\bexport[^.]{0,40}\b(ban|halt|suspend|restrict|curb|stop|cut off)/, /\b(halt|suspend|stop|restrict|cut|cuts|cutting)(s|ed|ing)?( off)?\b[^.]{0,40}\bexport/],
  tariff: [/\btariff/, /\bimport (dut|tax)/],
  embargo: [/\bembargo/, /\bsanction/],
  chokepoint: [/\b(close|closes|closed|closing|block|blocks|blocked|blocking)\b[^.]{0,40}\b(strait|canal|sea|port|shipping)/, /\b(strait|canal)\b[^.]{0,40}\b(close|closed|blocked|shut)/],
  facility: [/\b(plant|factory|facility)\b[^.]{0,40}\b(clos|shut|halt|recall)/],
  disease: [/\b(outbreak|cull|depopulat)/],
};

function hits(text: string, terms: string[]): string[] {
  return terms.filter((t) => text.includes(t.toLowerCase()));
}

/** Read severity like "40%" or "half" or "entirely" from the text. */
export function parseSeverity(text: string): number | undefined {
  const pct = text.match(/(\d{1,3})\s?(%|percent)/);
  if (pct) return Math.min(1, Number(pct[1]) / 100);
  if (/\b(entire|entirely|complete|completely|total|all)\b/.test(text)) return 1;
  if (/\b(half)\b/.test(text)) return 0.5;
  if (/\b(third)\b/.test(text)) return 0.33;
  if (/\b(quarter)\b/.test(text)) return 0.25;
  return undefined;
}

export function parseMonths(text: string): number | undefined {
  const m = text.match(/(\d{1,2})\s?(month|months|mo)\b/);
  if (m) return Math.max(1, Math.min(36, Number(m[1])));
  const y = text.match(/(\d)\s?(year|years|yr)\b/);
  if (y) return Math.min(36, Number(y[1]) * 12);
  const w = text.match(/(\d{1,2})\s?(week|weeks)\b/);
  if (w) return Math.max(1, Math.round(Number(w[1]) / 4));
  return undefined;
}

/** Commodities a region is known to supply the US with (domestic share, import origin, chokepoint, or world exports). */
function regionCommodities(ctx: EngineContext, regionId: string): string[] {
  const r = ctx.regions[regionId];
  if (!r) return [];
  return [...new Set([...Object.keys(r.usSupplyShare ?? {}), ...Object.keys(r.usImportOriginShare ?? {}), ...Object.keys(r.worldExportShare ?? {}), ...Object.keys(r.chokepointImportShare ?? {})])];
}

/** Split on sentence and clause boundaries so "India bans rice exports; drought in Iowa" yields two candidates. */
export function interpretScenario(text: string, ctx: EngineContext): ThreatCandidate[] {
  const clauses = text.split(/[.;\n]+|\s+(?:and then|meanwhile|while|plus)\s+/i).map((x) => x.trim()).filter((x) => x.length > 3);
  if (clauses.length <= 1) return interpretClause(text, ctx);
  const out: ThreatCandidate[] = [];
  const seen = new Set<string>();
  for (const cl of clauses) for (const c of interpretClause(cl, ctx)) { const k = `${c.category}|${c.regionId}`; if (!seen.has(k)) { seen.add(k); out.push(c); } }
  return out.length > 0 ? out : interpretClause(text, ctx);
}

/** State names from the focus config map to their `us-state-XX` regions; "Washington" alone is ambiguous and needs "state". */
function stateTerms(ctx: EngineContext): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const a of ctx.focus?.areas ?? []) {
    if (a.kind !== 'state' || !ctx.regions[`us-state-${a.id}`]) continue;
    const n = a.name.toLowerCase();
    out[`us-state-${a.id}`] = n === 'washington' ? ['washington state'] : n === 'district of columbia' ? ['washington dc', 'district of columbia'] : [n];
  }
  return out;
}

function interpretClause(text: string, ctx: EngineContext): ThreatCandidate[] {
  const t = norm(text);
  const matched: string[] = [];
  const cats = (Object.keys(CATEGORY_TERMS) as ThreatCategory[]).map((c) => {
    const h = hits(t, CATEGORY_TERMS[c]);
    for (const re of CATEGORY_PATTERNS[c] ?? []) { const m = t.match(re); if (m) h.push(m[0].trim()); }
    return { c, h };
  }).filter((x) => x.h.length > 0);
  const terms: Record<string, string[]> = { ...stateTerms(ctx), ...REGION_TERMS };
  let regions = Object.keys(terms).map((r) => ({ r, h: hits(t, terms[r]!) })).filter((x) => x.h.length > 0 && ctx.regions[x.r]);
  // a named state is more specific than the multi-state region it belongs to
  if (regions.some((x) => x.r.startsWith('us-state-'))) regions = regions.filter((x) => x.r.startsWith('us-state-') || !x.r.startsWith('us-'));
  const comms = Object.keys(COMMODITY_TERMS).map((id) => ({ id, h: hits(t, COMMODITY_TERMS[id]!) })).filter((x) => x.h.length > 0 && (ctx.commodities[x.id] || ctx.inputs[x.id]));
  if (cats.length === 0 && comms.length === 0) return [];
  // pick the category with the most/longest matches; chokepoint terms beat war when a strait is named
  cats.sort((a, b) => b.h.join('').length - a.h.join('').length);
  const category = (cats[0]?.c ?? (comms.length > 0 ? 'export_ban' : 'instability')) as ThreatCategory;
  const type = ctx.threatTypes[category];
  matched.push(...(cats[0]?.h ?? []));
  const sev = parseSeverity(t) ?? CATEGORY_SEVERITY[category] ?? 0.2;
  const months = parseMonths(t) ?? type?.defaultMonths ?? 6;
  const out: ThreatCandidate[] = [];
  const regionIds = regions.length > 0 ? regions.map((x) => x.r) : ['us-national'];
  for (const regionId of regionIds) {
    const known = regionCommodities(ctx, regionId);
    let ids = comms.map((x) => x.id).filter((id) => known.includes(id) || regionId === 'us-national');
    // no explicit commodity: everything the region supplies the US with
    if (ids.length === 0 && comms.length === 0) ids = known.filter((id) => ctx.commodities[id] || ctx.inputs[id]);
    if (ids.length === 0) continue;
    const region = ctx.regions[regionId]!;
    const commodities = ids.map((id) => ({ id, relevance: 1 }));
    const terms = [...matched, ...(regions.find((x) => x.r === regionId)?.h ?? []), ...comms.filter((x) => ids.includes(x.id)).flatMap((x) => x.h)];
    const confidence = Math.min(1, 0.3 + 0.2 * (cats.length > 0 ? 1 : 0) + 0.25 * (regions.length > 0 ? 1 : 0) + 0.25 * (comms.length > 0 ? 1 : 0));
    const label = ids.length === 1 ? (ctx.commodities[ids[0]!]?.name ?? ctx.inputs[ids[0]!]?.name ?? ids[0]) : `${ids.length} commodities`;
    out.push({ name: `${capitalize(category.replace('_', ' '))} — ${region.name} (${label})`, category, regionId, commodities, severity: sev, months, confidence, matched: [...new Set(terms)], source: 'rule-based', explicitCategory: cats.length > 0, explicitRegion: regions.length > 0 });
  }
  return out;
}

function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

/** Check a candidate (from rules or an LLM) against the configuration; returns problems (empty = valid). */
export function validateCandidate(c: ThreatCandidate, ctx: EngineContext): string[] {
  const p: string[] = [];
  if (!ctx.threatTypes[c.category]) p.push(`unknown category ${c.category}`);
  if (!ctx.regions[c.regionId]) p.push(`unknown region ${c.regionId}`);
  if (c.commodities.length === 0) p.push('no commodities');
  for (const x of c.commodities) if (!ctx.commodities[x.id] && !ctx.inputs[x.id]) p.push(`unknown commodity ${x.id}`);
  if (!(c.severity >= 0 && c.severity <= 1)) p.push('severity out of [0,1]');
  if (!(c.months >= 1 && c.months <= 36)) p.push('months out of [1,36]');
  return p;
}

export function candidateToThreat(c: ThreatCandidate, ctx: EngineContext, id: string, start: string): Threat {
  const r = ctx.regions[c.regionId]!;
  const type = ctx.threatTypes[c.category];
  return {
    id, name: c.name, category: c.category, kind: type?.kind ?? 'natural',
    location: { lat: r.lat, lng: r.lng, admin: r.name, regionId: c.regionId },
    commodities: c.commodities, severity: c.severity, start, months: c.months,
    source: { feed: c.source === 'llm' ? 'Scenario interpreter (LLM proposal, validated)' : 'Scenario interpreter (rule-based)', kind: 'user', note: `matched: ${c.matched.join(', ')}` },
  };
}
