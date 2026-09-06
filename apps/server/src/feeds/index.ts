import type { FeedAdapter } from './types.js';
import { gdacs } from './gdacs.js';
import { portwatch } from './portwatch.js';
import { fred } from './fred.js';
import { usdm } from './usdm.js';
import { firms } from './firms.js';
import { eia } from './eia.js';
import { gdelt } from './gdelt.js';
import { aphis } from './aphis.js';
import { gta } from './gta.js';

/** Adapters wired into the server. */
export const allAdapters: FeedAdapter[] = [gdacs, portwatch, fred, usdm, firms, eia, gdelt, aphis, gta];

export { gdacs, portwatch, fred, usdm, firms, eia, gdelt, aphis, gta };
