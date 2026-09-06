import type { Threat } from '@surge/engine';

// Illustrative current-threat seeds. These stand in for the live feed layer
// (Plan 2 / Stage 2) so the map has content today. Each is labeled honestly as
// a seed in the UI — `source.feed` begins with "SEED:" and `source.kind` is
// 'structural' — and every commodity id, region id, and rule is chosen so the
// deterministic engine produces a real, sourced shock. Locations use the region
// gazetteer coordinates. start = 2026-09 (demo "now").

const NOW = '2026-09';

function seedSource(feed: string, note: string) {
  return { feed: `SEED: ${feed}`, kind: 'structural' as const, note };
}

export const SEED_THREATS: Threat[] = [
  {
    id: 'seed-redsea',
    name: 'Red Sea shipping disruption',
    category: 'chokepoint',
    kind: 'geopolitical',
    location: { lat: 20.0, lng: 38.5, admin: 'Bab el-Mandeb / Suez', iso3: 'YEM', regionId: 'suez-red-sea' },
    commodities: [ { id: 'coffee', relevance: 1 }, { id: 'rice', relevance: 0.8 }, { id: 'fats-oils', relevance: 0.7 } ],
    severity: 0.55,
    start: NOW, months: 4,
    source: seedSource('IMF PortWatch Bab el-Mandeb daily transit', 'Transit-decline seed; PortWatch chokepoint feed lands Stage 2'),
  },
  {
    id: 'seed-india-rice',
    name: 'India rice export restrictions',
    category: 'export_ban',
    kind: 'geopolitical',
    location: { lat: 22.0, lng: 79.0, admin: 'India', iso3: 'IND', regionId: 'india' },
    commodities: [ { id: 'rice', relevance: 1 } ],
    severity: 0.8,
    start: NOW, months: 6,
    source: seedSource('GTA / IFPRI Food Export Restrictions Tracker', 'Precedent: 2023 non-basmati ban; GTA feed lands Stage 2'),
  },
  {
    id: 'seed-ca-drought',
    name: 'California Central Valley drought',
    category: 'drought',
    kind: 'natural',
    location: { lat: 36.7, lng: -119.8, admin: 'California Central Valley', iso3: 'USA', regionId: 'us-california-central-valley' },
    commodities: [ { id: 'lettuce', relevance: 1 }, { id: 'tomatoes', relevance: 1 }, { id: 'fresh-vegetables', relevance: 1 }, { id: 'milk', relevance: 0.5 } ],
    severity: 0.12,
    start: NOW, months: 12,
    source: seedSource('US Drought Monitor D3 coverage', 'USDM class → severity; live USDM feed lands Stage 2'),
  },
  {
    id: 'seed-midwest-drought',
    name: 'Corn Belt drought (feed grains)',
    category: 'drought',
    kind: 'natural',
    location: { lat: 41.0, lng: -90.0, admin: 'Corn Belt', iso3: 'USA', regionId: 'us-midwest-corn-belt' },
    commodities: [ { id: 'corn', relevance: 1 }, { id: 'soybeans', relevance: 1 } ],
    severity: 0.1,
    start: NOW, months: 12,
    source: seedSource('US Drought Monitor + NASS Crop Production', 'Feed-cost pass-through to eggs/poultry/meat/dairy; USDM feed lands Stage 2'),
  },
  {
    id: 'seed-fl-hurricane',
    name: 'Hurricane landfall, Florida',
    category: 'storm',
    kind: 'natural',
    location: { lat: 27.5, lng: -81.7, admin: 'Florida', iso3: 'USA', regionId: 'us-florida' },
    commodities: [ { id: 'citrus', relevance: 1 }, { id: 'tomatoes', relevance: 0.7 }, { id: 'sugar', relevance: 0.5 } ],
    severity: 0.15,
    start: NOW, months: 6,
    source: seedSource('GDACS tropical cyclone alert', 'GDACS alert Green/Orange/Red → severity; live GDACS feed lands Stage 2'),
  },
  {
    id: 'seed-mexico-tariff',
    name: 'Tariff on Mexican produce',
    category: 'tariff',
    kind: 'geopolitical',
    location: { lat: 23.6, lng: -102.5, admin: 'Mexico', iso3: 'MEX', regionId: 'mexico' },
    commodities: [ { id: 'tomatoes', relevance: 1 }, { id: 'fresh-vegetables', relevance: 1 }, { id: 'sugar', relevance: 0.6 }, { id: 'beef', relevance: 0.4 } ],
    severity: 0.25,
    start: NOW, months: 12,
    source: seedSource('Global Trade Alert intervention', '25% ad valorem seed; GTA feed lands Stage 2'),
  },
  {
    id: 'seed-black-sea',
    name: 'Black Sea conflict escalation',
    category: 'war',
    kind: 'geopolitical',
    location: { lat: 48.0, lng: 35.0, admin: 'Ukraine', iso3: 'UKR', regionId: 'ukraine' },
    commodities: [ { id: 'wheat', relevance: 1 }, { id: 'fats-oils', relevance: 1 }, { id: 'corn', relevance: 0.6 }, { id: 'fertilizer', relevance: 0.8 } ],
    severity: 0.5,
    start: NOW, months: 6,
    source: seedSource('ACLED conflict intensity', 'World-price transmission 0.5 (modeled); ACLED feed lands Stage 2'),
  },
  {
    id: 'seed-hpai-autumn',
    name: 'HPAI autumn resurgence (layers)',
    category: 'disease',
    kind: 'natural',
    location: { lat: 42.4, lng: -93.8, admin: 'Iowa / Midwest', iso3: 'USA', regionId: 'us-midwest-corn-belt' },
    commodities: [ { id: 'eggs', relevance: 1 } ],
    severity: 0.105,
    physical: {
      kind: 'animals_affected', value: 12000000,
      timeline: [ { month: 0, value: 3000000 }, { month: 1, value: 5000000 }, { month: 2, value: 4000000 } ],
    },
    start: NOW, months: 12,
    source: seedSource('APHIS HPAI confirmed detections', 'Seasonal flyway pattern; APHIS Tableau + archive land Stage 2'),
  },
  {
    id: 'seed-panama',
    name: 'Panama Canal draft restrictions',
    category: 'chokepoint',
    kind: 'geopolitical',
    location: { lat: 9.1, lng: -79.7, admin: 'Panama Canal', iso3: 'PAN', regionId: 'panama-canal' },
    commodities: [ { id: 'bananas', relevance: 1 }, { id: 'coffee', relevance: 0.5 } ],
    severity: 0.4,
    start: NOW, months: 4,
    source: seedSource('IMF PortWatch Panama Canal transit', 'Low-water draft limits precedent 2023-24; PortWatch feed lands Stage 2'),
  },
];

export function isSeedSource(feed: string): boolean {
  return feed.startsWith('SEED:');
}
