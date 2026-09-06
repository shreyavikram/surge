import { readEnv } from '../src/env.js';
import { allAdapters } from '../src/feeds/index.js';
const env = readEnv();
for (const a of allAdapters) {
  const t0 = Date.now();
  try { const r = await a.fetch(env); console.log(`live ${a.id}: ${r.items.length} items in ${Date.now() - t0} ms`); }
  catch (e) { console.log(`FAIL ${a.id}: ${(e as Error).message.slice(0, 100)} after ${Date.now() - t0} ms`); }
}
