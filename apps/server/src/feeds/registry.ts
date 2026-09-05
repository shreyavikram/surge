import type { FeedAdapter, FeedResult, HealthRow, StoredSnapshot, FeedStatus } from './types.js';
import type { Env } from '../env.js';
import { forcedOutages } from '../env.js';
import { loadSnapshot as diskLoad } from './snapshots.js';

interface CacheEntry {
  result: FeedResult;
  at: number;
}

export interface RegistryDeps {
  loadSnapshot?: (name: string) => StoredSnapshot | null;
  now?: () => number;
}

/** Caches each feed with a TTL and falls back to a committed snapshot (marking it
 * stale) on any error, a missing key, or a forced outage. Records a health row per feed. */
export class FeedRegistry {
  private adapters: Map<string, FeedAdapter>;
  private cache = new Map<string, CacheEntry>();
  private healthById = new Map<string, HealthRow>();
  private loadSnapshot: (name: string) => StoredSnapshot | null;
  private now: () => number;

  constructor(adapters: FeedAdapter[], deps: RegistryDeps = {}) {
    this.adapters = new Map(adapters.map((a) => [a.id, a]));
    this.loadSnapshot = deps.loadSnapshot ?? diskLoad;
    this.now = deps.now ?? (() => Date.now());
    for (const a of adapters) this.setHealthBare(a);
  }

  list(): FeedAdapter[] {
    return [...this.adapters.values()];
  }

  private setHealthBare(a: FeedAdapter): void {
    const row: HealthRow = { id: a.id, label: a.label, kind: a.kind, status: 'snapshot', stale: true };
    if (a.requiresKey) row.requiresKey = String(a.requiresKey);
    this.healthById.set(a.id, row);
  }

  private setHealth(a: FeedAdapter, status: FeedStatus, result: FeedResult, note?: string): void {
    const row: HealthRow = {
      id: a.id, label: a.label, kind: a.kind, status,
      stale: status !== 'live', itemCount: result.items.length,
    };
    if (result.source.fetchedAt) row.fetchedAt = result.source.fetchedAt;
    if (a.requiresKey) row.requiresKey = String(a.requiresKey);
    if (note) row.note = note;
    this.healthById.set(a.id, row);
  }

  private serveSnapshot(a: FeedAdapter, status: FeedStatus, note?: string): FeedResult {
    const snap = this.loadSnapshot(a.snapshotName);
    if (!snap) {
      const empty: FeedResult = { items: [], source: { feed: a.label, kind: a.kind, stale: true, note: note ?? 'no snapshot' } };
      this.setHealth(a, 'error', empty, note ?? 'no snapshot available');
      return empty;
    }
    const result: FeedResult = { ...snap.result, source: { ...snap.result.source, stale: true, fetchedAt: snap.fetchedAt } };
    this.setHealth(a, status, result, note);
    return result;
  }

  async get(id: string, env: Env): Promise<FeedResult> {
    const a = this.adapters.get(id);
    if (!a) throw new Error(`unknown feed ${id}`);
    const now = this.now();

    const cached = this.cache.get(id);
    if (cached && now - cached.at < a.ttlMs) return cached.result;

    if (forcedOutages(env).has(id)) return this.serveSnapshot(a, 'snapshot', 'forced outage');
    if (a.requiresKey && !env[a.requiresKey]) return this.serveSnapshot(a, 'missing-key', `needs ${String(a.requiresKey)}`);

    try {
      const result = await a.fetch(env);
      result.source.stale = false;
      if (!result.source.fetchedAt) result.source.fetchedAt = new Date(now).toISOString();
      this.cache.set(id, { result, at: now });
      this.setHealth(a, 'live', result);
      return result;
    } catch (e) {
      return this.serveSnapshot(a, 'stale', `fetch failed: ${(e as Error).message}`);
    }
  }

  /** Fetch every adapter (cached where fresh). Errors never throw — they fall back to snapshots. */
  async getAll(env: Env): Promise<Record<string, FeedResult>> {
    const out: Record<string, FeedResult> = {};
    await Promise.all(this.list().map(async (a) => { out[a.id] = await this.get(a.id, env); }));
    return out;
  }

  healthRows(): HealthRow[] {
    return this.list().map((a) => this.healthById.get(a.id)!);
  }
}
