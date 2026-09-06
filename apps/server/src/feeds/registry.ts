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
  /** fetches in flight, so a slow or failing feed never blocks a request twice */
  private inflight = new Map<string, Promise<FeedResult>>();
  /** last failure per feed; retried only after FAIL_TTL */
  private failedAt = new Map<string, number>();
  static FAIL_TTL_MS = 5 * 60 * 1000;
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
    const failed = this.failedAt.get(id);
    if (failed !== undefined && now - failed < FeedRegistry.FAIL_TTL_MS) {
      if (cached) return cached.result; // an expired cache is still newer than the committed snapshot
      return this.serveSnapshot(a, 'stale', 'recent fetch failed; retrying later');
    }

    // stale-while-revalidate: start (or join) the fetch, but answer now from the last cache or the snapshot
    let p = this.inflight.get(id);
    if (!p) {
      p = a.fetch(env).then((result) => {
        result.source.stale = false;
        if (!result.source.fetchedAt) result.source.fetchedAt = new Date(this.now()).toISOString();
        this.cache.set(id, { result, at: this.now() });
        this.failedAt.delete(id);
        this.setHealth(a, 'live', result);
        return result;
      }).catch((e: unknown) => {
        this.failedAt.set(id, this.now());
        const last = this.cache.get(id);
        if (last) { this.setHealth(a, 'stale', last.result, `refresh failed: ${(e as Error).message}; serving the last successful fetch`); return last.result; }
        return this.serveSnapshot(a, 'stale', `fetch failed: ${(e as Error).message}`);
      }).finally(() => { this.inflight.delete(id); });
      this.inflight.set(id, p);
    }
    if (cached) return cached.result;                       // expired cache: serve it, refresh behind
    const quick = await Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), FeedRegistry.QUICK_WAIT_MS))]);
    return quick ?? this.serveSnapshot(a, 'snapshot', 'refreshing');
  }

  /** How long a request waits for a fresh fetch before answering from the snapshot. */
  static QUICK_WAIT_MS = 2500;

  /** Fetch every adapter in the background (server start). */
  warm(env: Env): void {
    for (const a of this.list()) void this.get(a.id, env);
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
