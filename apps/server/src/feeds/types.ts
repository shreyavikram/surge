import type { SourceStamp, ThreatCategory, PhysicalShock } from '@surge/engine';
import type { Env } from '../env.js';

export type FeedKind = 'live' | 'archive' | 'structural';

/** A normalized item from a feed, before threats.ts turns it into a Threat. */
export interface FeedItem {
  id: string;
  name: string;
  category?: ThreatCategory;
  kind?: 'geopolitical' | 'natural';
  lat?: number;
  lng?: number;
  admin?: string;
  iso3?: string;
  /** set when the adapter already knows the gazetteer region (chokepoints, USDM states) */
  regionId?: string;
  severity?: number; // 0..1
  physical?: PhysicalShock;
  start?: string;    // YYYY-MM
  end?: string;
  months?: number;
  /** commodities the adapter maps directly (e.g. a chokepoint's transiting goods) */
  commodities?: { id: string; relevance: number }[];
  /** unstructured description, for the AI extractor */
  text?: string;
  raw?: unknown;
}

export interface FeedResult {
  items: FeedItem[];
  source: SourceStamp;
  /** time series (FRED etc.), keyed by series id */
  series?: Record<string, { months: string[]; values: number[] }>;
}

export interface FeedAdapter {
  id: string;
  label: string;
  kind: FeedKind;
  ttlMs: number;
  /** env key required for live data; without it the registry serves the snapshot */
  requiresKey?: keyof Env;
  snapshotName: string;
  /** Network fetch + normalize. Throws on failure (registry falls back to snapshot). */
  fetch(env: Env): Promise<FeedResult>;
  /** Pure normalizer for a raw payload — used by fixtures and the snapshot script. */
  parse(raw: unknown): FeedResult;
}

export type FeedStatus = 'live' | 'stale' | 'snapshot' | 'missing-key' | 'error';

export interface HealthRow {
  id: string;
  label: string;
  kind: FeedKind;
  status: FeedStatus;
  stale: boolean;
  fetchedAt?: string;
  requiresKey?: string;
  itemCount?: number;
  note?: string;
}

export interface StoredSnapshot {
  fetchedAt: string;
  result: FeedResult;
}
