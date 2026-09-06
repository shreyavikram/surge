import type { EngineContext, RegionConfig } from '@surge/engine';

/** US regions (those with domestic supply shares and a state list). */
export function usRegions(ctx: EngineContext): RegionConfig[] {
  return Object.values(ctx.regions).filter((r) => ctx.focus?.regionStates[r.id] !== undefined && r.id !== 'us-national');
}

/** The smallest US region covering a state, or undefined. */
export function regionForState(ctx: EngineContext, state: string): RegionConfig | undefined {
  const cands = usRegions(ctx).filter((r) => (ctx.focus?.regionStates[r.id] ?? []).includes(state));
  return cands.sort((a, b) => (ctx.focus!.regionStates[a.id]!.length) - (ctx.focus!.regionStates[b.id]!.length))[0];
}

export function inBbox(b: RegionConfig['bbox'], lng: number, lat: number): boolean {
  return lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];
}

/** Region (foreign) covering an ISO3 country, if any. */
export function regionForCountry(ctx: EngineContext, iso3: string): RegionConfig | undefined {
  return Object.values(ctx.regions).find((r) => (r.countries ?? []).includes(iso3));
}

export const STATE_FIPS: Record<string, string> = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', DC: '11', FL: '12', GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23', MD: '24', MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44', SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54', WI: '55', WY: '56',
};
