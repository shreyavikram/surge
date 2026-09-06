// Run every adapter live and write data/snapshots/<id>.json; failures keep the previous snapshot.
import { readEnv } from '../src/env.js';
import { allAdapters } from '../src/feeds/index.js';
import { writeSnapshot } from '../src/feeds/snapshots.js';

const env = readEnv();
for (const a of allAdapters) {
  if (a.requiresKey && !env[a.requiresKey]) { console.log(`skip ${a.id}: ${String(a.requiresKey)} not set`); continue; }
  try {
    const r = await a.fetch(env);
    writeSnapshot(a.snapshotName, r);
    console.log(`ok   ${a.id}: ${r.items.length} items${r.series ? `, ${Object.keys(r.series).length} series` : ''}`);
  } catch (e) {
    console.log(`fail ${a.id}: ${(e as Error).message.slice(0, 120)}`);
  }
}
