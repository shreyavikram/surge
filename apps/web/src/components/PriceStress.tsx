import { useEffect, useState } from 'react';
import type { EngineContext } from '@surge/engine';
import { Info } from './Info.js';

/** One row of /api/price-stress: the FAO price-anomaly score for a commodity's US store price. */
interface StressRow {
  commodity: string;
  name: string;
  anomaly: { month: string; ifpa: number; level: 'abnormally-high' | 'moderately-high' | 'normal' | 'moderately-low' | 'abnormally-low'; cagr: number; cqgr: number } | null;
}

const LEVEL_TEXT: Record<NonNullable<StressRow['anomaly']>['level'], string> = {
  'abnormally-high': 'abnormally high', 'moderately-high': 'moderately high', normal: 'normal', 'moderately-low': 'moderately low', 'abnormally-low': 'abnormally low',
};

/**
 * Store-price stress strip: which foods cost more (or less) than their usual seasonal path right now,
 * by the FAO Indicator of Food Price Anomalies on BLS average retail prices. Clicking a chip filters the
 * map and list to that commodity. Hidden when the server is unreachable.
 */
export function PriceStress({ ctx, commodities, setCommodities }: { ctx: EngineContext; commodities: Set<string>; setCommodities: (s: Set<string>) => void }) {
  const [rows, setRows] = useState<StressRow[] | null>(null);
  const [asOf, setAsOf] = useState<string>('');
  useEffect(() => {
    let on = true;
    const load = async () => {
      try {
        const r = await fetch('/api/price-stress');
        if (!r.ok) return;
        const d = (await r.json()) as { indicators: StressRow[] };
        if (!on) return;
        const list = (d.indicators ?? []).filter((x) => x.anomaly);
        setRows(list);
        setAsOf(list[0]?.anomaly?.month ?? '');
      } catch { /* offline: strip stays hidden */ }
    };
    void load();
    const t = setInterval(() => { void load(); }, 30 * 60 * 1000);
    return () => { on = false; clearInterval(t); };
  }, []);
  if (!rows || rows.length === 0) return null;
  const stressed = rows.filter((r) => r.anomaly && r.anomaly.level !== 'normal');
  const toggle = (id: string) => {
    const next = new Set(commodities);
    if (next.has(id) && next.size === 1) next.clear(); else { next.clear(); next.add(id); }
    setCommodities(next);
  };
  const month = asOf ? new Date(`${asOf}-15T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
  return (
    <div className="ps-strip">
      <div className="ps-head">Store prices vs. the usual season<Info term="priceStress" />{month && <small> · BLS, {month}</small>}</div>
      {stressed.length === 0 ? (
        <div className="ps-none">All tracked foods are priced normally for the season.</div>
      ) : (
        <div className="ps-chips">
          {stressed.map((r) => {
            const a = r.anomaly!;
            const cls = a.level.endsWith('high') ? (a.level === 'abnormally-high' ? 'high2' : 'high1') : (a.level === 'abnormally-low' ? 'low2' : 'low1');
            const name = ctx.commodities[r.commodity]?.name ?? r.name;
            return (
              <button key={r.commodity} className={`ps-chip ${cls}${commodities.has(r.commodity) ? ' on' : ''}`} onClick={() => toggle(r.commodity)}
                title={`${name}: ${LEVEL_TEXT[a.level]} for the season (FAO anomaly score ${a.ifpa.toFixed(1)}; ${(a.cagr * 1200).toFixed(0)}% annualised over the last year). Click to show only this food.`}>
                {name} <span>{LEVEL_TEXT[a.level].replace('moderately ', '').replace('abnormally ', 'very ')}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
