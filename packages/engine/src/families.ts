// packages/engine/src/families.ts
// Threat categories grouped into the four families the app filters by. Shared by the web filters and the
// server's alert subscriptions so both sides agree on what "Weather and climate" means.
import type { ThreatCategory } from './types.js';

export type CategoryFamily = 'geopolitical' | 'natural' | 'biological' | 'supply';

export const CATEGORY_FAMILIES: CategoryFamily[] = ['geopolitical', 'natural', 'biological', 'supply'];

export function categoryFamily(cat: ThreatCategory): CategoryFamily {
  switch (cat) {
    case 'tariff': case 'embargo': case 'export_ban': case 'import_decline': case 'war': case 'instability': case 'chokepoint': case 'import_dependence': return 'geopolitical';
    case 'drought': case 'heat': case 'flood': case 'storm': case 'wildfire': return 'natural';
    case 'pest': case 'disease': return 'biological';
    case 'input_cost': case 'facility': return 'supply';
  }
}
