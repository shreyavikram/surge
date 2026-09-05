// Typed, optional access to process.env. The server boots with none of these set;
// keyed feeds and the AI layer degrade to snapshots / templates when a key is absent.
export interface Env {
  PORT: number;
  SURGE_VETTED_KEY?: string;
  /** comma-separated feed ids forced to serve their snapshot (demo outage switch) */
  SURGE_FORCE_OUTAGE?: string;
  FRED_API_KEY?: string;
  NASS_API_KEY?: string;
  FIRMS_MAP_KEY?: string;
  EIA_API_KEY?: string;
  GTA_API_KEY?: string;
  AMS_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  ACLED_EMAIL?: string;
  ACLED_PASSWORD?: string;
}

function opt(v: string | undefined): string | undefined {
  return v && v.trim() !== '' ? v.trim() : undefined;
}

export function readEnv(src: NodeJS.ProcessEnv = process.env): Env {
  return {
    PORT: Number(src.PORT) || 8787,
    SURGE_VETTED_KEY: opt(src.SURGE_VETTED_KEY),
    SURGE_FORCE_OUTAGE: opt(src.SURGE_FORCE_OUTAGE),
    FRED_API_KEY: opt(src.FRED_API_KEY),
    NASS_API_KEY: opt(src.NASS_API_KEY),
    FIRMS_MAP_KEY: opt(src.FIRMS_MAP_KEY),
    EIA_API_KEY: opt(src.EIA_API_KEY),
    GTA_API_KEY: opt(src.GTA_API_KEY),
    AMS_API_KEY: opt(src.AMS_API_KEY),
    ANTHROPIC_API_KEY: opt(src.ANTHROPIC_API_KEY),
    ACLED_EMAIL: opt(src.ACLED_EMAIL),
    ACLED_PASSWORD: opt(src.ACLED_PASSWORD),
  };
}

/** Feed ids in SURGE_FORCE_OUTAGE, for the demo outage switch. */
export function forcedOutages(env: Env): Set<string> {
  return new Set((env.SURGE_FORCE_OUTAGE ?? '').split(',').map((s) => s.trim()).filter(Boolean));
}
