import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { FeedResult, StoredSnapshot } from './types.js';

// Repo-root data/snapshots (apps/server/src/feeds → up 4).
const DIR = fileURLToPath(new URL('../../../../data/snapshots/', import.meta.url));

export function snapshotPath(name: string): string {
  return join(DIR, `${name}.json`);
}

export function loadSnapshot(name: string): StoredSnapshot | null {
  const p = snapshotPath(name);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as StoredSnapshot;
  } catch {
    return null;
  }
}

export function writeSnapshot(name: string, result: FeedResult): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  const stored: StoredSnapshot = { fetchedAt: new Date().toISOString(), result };
  writeFileSync(snapshotPath(name), JSON.stringify(stored, null, 2));
}
