import type { FeedAdapter } from './types.js';
import { gdacs } from './gdacs.js';
import { portwatch } from './portwatch.js';
import { fred } from './fred.js';

/** Adapters wired into the server. Task 11 adds usdm, openmeteo, aphis, firms, nass, eia, gta, acled, ifpri. */
export const allAdapters: FeedAdapter[] = [gdacs, portwatch, fred];

export { gdacs, portwatch, fred };
