import calendar from '../../../packages/config/data/crop-calendar.json' with { type: 'json' };

/**
 * Monthly weather-sensitivity weights for US production (packages/config/data/crop-calendar.json).
 * A field crop is only hurt by drought, heat, flood or fire in the months it is in the ground and, above all,
 * in its reproductive stage; livestock and manufactured goods carry a flat 1.0. Weights are 0..1, Jan..Dec.
 */
interface CalendarFile { source: string; crops: Record<string, { weights: number[]; source: string }> }
const CAL = calendar as unknown as CalendarFile;

/** Month 1..12 from a month number, a 'YYYY-MM' (or 'YYYY-MM-DD') string, or a Date; default = now (UTC). */
export function monthOf(m?: number | string | Date): number {
  if (m instanceof Date) return m.getUTCMonth() + 1;
  if (typeof m === 'number' && Number.isFinite(m)) return Math.min(12, Math.max(1, Math.round(m)));
  if (typeof m === 'string') {
    const mm = /^\d{4}-(\d{2})/.exec(m);
    if (mm) { const n = Number(mm[1]); if (n >= 1 && n <= 12) return n; }
  }
  return new Date().getUTCMonth() + 1;
}

/** Calendar weight of a commodity or input in a month; ids not in the calendar (or missing months) count 1. */
export function calendarWeight(commodity: string, month?: number | string | Date): number {
  const entry = CAL.crops[commodity];
  if (!entry) return 1;
  const w = entry.weights[monthOf(month) - 1];
  return typeof w === 'number' && Number.isFinite(w) ? Math.max(0, Math.min(1, w)) : 1;
}

export const CROP_CALENDAR_SOURCE = CAL.source;
