import type { Threat } from '@surge/engine';

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Vetted access via the `surge_vetted` cookie or an `x-surge-vetted` header matching SURGE_VETTED_KEY.
 * No key configured → nobody is vetted (public build). */
export function checkVetted(cookieHeader: string | undefined, headerKey: string | undefined, vettedKey: string | undefined): boolean {
  if (!vettedKey) return false;
  if (headerKey && headerKey === vettedKey) return true;
  return parseCookies(cookieHeader)['surge_vetted'] === vettedKey;
}

/** Public builds never see county/premises/daily detail: strip `gated` unless vetted. */
export function redactThreat(t: Threat, vetted: boolean): Threat {
  if (vetted || !t.gated) return t;
  const { gated, ...rest } = t;
  return rest;
}
