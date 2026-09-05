// The numeric guard: AI prose may only restate numbers the engine produced.
// We extract numbers from the model's text and from the tool outputs it was given,
// then reject any figure in the text that isn't within tolerance of an allowed one.

const NUM_RE = /(\d[\d,]*(?:\.\d+)?)\s*(billion|million|thousand|bn|b|m|k)?/gi;

/** Numbers in prose, normalized to base units ($1.41B → 1.41e9, "9%" → 9, "1,414" → 1414). */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(NUM_RE)) {
    const base = Number(m[1]!.replace(/,/g, ''));
    if (!Number.isFinite(base)) continue;
    const unit = (m[2] ?? '').toLowerCase();
    const scale = unit === 'billion' || unit === 'bn' || unit === 'b' ? 1e9
      : unit === 'million' || unit === 'm' ? 1e6
      : unit === 'thousand' || unit === 'k' ? 1e3
      : 1;
    out.push(base * scale);
  }
  return out;
}

/** Small integers (counts, months, days) and 4-digit years are structural, not quantitative claims. */
function isStructural(n: number): boolean {
  if (Number.isInteger(n) && n >= 0 && n <= 31) return true;
  if (Number.isInteger(n) && n >= 1900 && n <= 2100) return true;
  return false;
}

function close(n: number, a: number): boolean {
  return Math.abs(n - a) <= Math.max(0.5, 0.02 * Math.abs(a));
}

export interface GroundResult {
  ok: boolean;
  offenders: number[];
}

/** True when every quantitative number in `text` is within tolerance of an allowed number. */
export function assertGrounded(text: string, allowed: number[]): GroundResult {
  const offenders = extractNumbers(text).filter((n) => !isStructural(n) && !allowed.some((a) => close(n, a)));
  return { ok: offenders.length === 0, offenders };
}

/** Convenience: the allowed set is every number appearing in the given tool-output texts. */
export function allowedFrom(...texts: string[]): number[] {
  return texts.flatMap(extractNumbers);
}
