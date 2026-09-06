import { Fragment, useState } from 'react';
import type { EngineContext } from '@surge/engine';
import { type RankedEntry, commodityName, focusView } from '../engine.js';
import type { Focus } from '../state.js';
import { compactUsd, signedPct, peak } from '../format.js';
import { Chip } from './Chip.js';
import { Info } from './Info.js';
import { LineChart } from './LineChart.js';

export function Impact({ entry, ctx, focus }: { entry: RankedEntry; ctx: EngineContext; focus: Focus }) {
  const impact = entry.impact;
  const w = impact.welfare;
  const v = focusView(entry, focus, ctx);
  const observed = impact.price.path === 'observed';
  const scale = w.cv > 0 ? v.cv / w.cv : 0;
  const [open, setOpen] = useState<string | null>(null);

  const rows = impact.commodities
    .map((id) => ({ id, name: commodityName(ctx, id), price: peak(impact.price.retailPct[id] ?? []), qty: peak(impact.quantity.pct[id] ?? []), cv: v.byCommodity[id] ?? 0 }))
    .sort((a, b) => Math.abs(b.price) - Math.abs(a.price));

  const subs = w.substitution.filter((s) => Math.abs(s.quantityPct) > 0.0005).sort((a, b) => Math.abs(b.quantityPct) - Math.abs(a.quantityPct)).slice(0, 8);

  return (
    <>
      <div className="section">
        <h4>Consumer welfare loss<Info term="cv" /> <span className="faint">· {v.label}</span></h4>
        <div className="stat-pair">
          <div className="stat">
            <div className="lbl">Annual<Info term="cvAnnual" /></div>
            <div className="val big bad">{compactUsd(v.cvAnnual)}</div>
          </div>
          <div className="stat">
            <div className="lbl">Total · {impact.durationMonths} mo</div>
            <div className="val big bad">{compactUsd(v.cv)}</div>
          </div>
        </div>
        <div className="subfig">
          {observed ? <Chip kind="observed" title="From the observed FRED retail price path × attribution share">observed</Chip> : <Chip kind="modeled" title="Second-order Hicksian compensating variation over the ERR-139 demand system">modeled</Chip>}
          <span> range {compactUsd(w.band.low * scale)} – {compactUsd(w.band.high * scale)}<Info term="band" /></span>
        </div>
        <div className="stat-pair" style={{ marginTop: 10 }}>
          <div className="stat">
            <div className="lbl">Producer revenue Δ<Info term="producer" /></div>
            <div className="val" style={{ color: v.producer >= 0 ? 'var(--good)' : 'var(--bad)' }}>{compactUsd(v.producer)}</div>
          </div>
          <div className="stat">
            <div className="lbl">Per capita<Info term="perCapita" /></div>
            <div className="val">{v.population > 0 ? `$${(v.cv / v.population).toFixed(2)}` : '—'}</div>
          </div>
        </div>
      </div>

      <div className="section">
        <h4>Commodities <span className="faint">· click a row for its price path</span></h4>
        <table className="tbl clickable">
          <thead>
            <tr><th>Commodity</th><th className="r">Peak price</th><th className="r">Peak qty</th><th className="r">Loss</th></tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((r) => {
              const c = ctx.commodities[r.id];
              const pi = impact.price.retailPct[r.id] ?? [];
              const obs = entry.observed && entry.observed.commodity === r.id ? entry.observed : undefined;
              const base = obs && obs.counterfactualPrice.length > 0 ? obs.counterfactualPrice.reduce((a, b) => a + b, 0) / obs.counterfactualPrice.length : c?.baseline.retailPrice ?? 1;
              const priceSeries = pi.map((p) => base * (1 + p));
              const isOpen = open === r.id;
              return (
                <Fragment key={r.id}>
                  <tr className={isOpen ? 'open' : ''} onClick={() => setOpen(isOpen ? null : r.id)}>
                    <td><span className="caret">{isOpen ? '▾' : '▸'}</span>{r.name}</td>
                    <td className="r" style={{ color: 'var(--bad)' }}>{signedPct(r.price)}</td>
                    <td className="r muted">{signedPct(r.qty)}</td>
                    <td className="r">{r.cv > 0 ? compactUsd(r.cv) : '—'}</td>
                  </tr>
                  {isOpen && (
                    <tr className="chart-row">
                      <td colSpan={4}>
                        <div className="chart-title">Retail price, {r.name} <span className="faint">USD per {c?.unit ?? 'unit'} · {observed && obs ? 'observed (FRED) vs counterfactual' : 'modeled vs baseline'}</span></div>
                        {observed && obs ? (
                          <LineChart months={obs.months} series={[{ label: 'observed', values: obs.retailPrice, color: 'var(--bad)' }, { label: 'counterfactual', values: obs.counterfactualPrice, color: 'var(--text-faint)', dashed: true }]} yFormat={(y) => `$${y.toFixed(2)}`} />
                        ) : (
                          <LineChart months={impact.months} series={[{ label: 'modeled', values: priceSeries, color: 'var(--bad)' }]} baseline={{ value: base, label: `baseline $${base.toFixed(2)}` }} yFormat={(y) => `$${y.toFixed(2)}`} />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {subs.length > 0 && (
        <div className="section">
          <h4>Substitution<Info term="substitution" /></h4>
          <table className="tbl">
            <thead><tr><th>Other food</th><th className="r">Δ purchases</th><th className="r">Estimate</th></tr></thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.commodity}>
                  <td>{commodityName(ctx, s.commodity) === s.commodity ? ctx.demand.items.find((i) => i.id === s.commodity)?.label ?? s.commodity : commodityName(ctx, s.commodity)}</td>
                  <td className="r" style={{ color: s.quantityPct >= 0 ? 'var(--good)' : 'var(--bad)' }}>{signedPct(s.quantityPct)}</td>
                  <td className="r">{s.significant ? <Chip kind="measured" title="Statistically distinguishable from zero in ERR-139">significant</Chip> : <span className="faint">not significant</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="section assumptions">
        <summary>Assumptions and sources<Info term="modeled" /></summary>
        {impact.assumptions.map((a) => (
          <div className="assump" key={a.key}>
            <span className="a-l">{a.label}</span>
            <span className="a-v">
              {typeof a.value === 'number' ? a.value.toLocaleString('en-US', { maximumFractionDigits: 3 }) : a.value}{a.unit ? ` ${a.unit}` : ''}
              <Chip kind={a.kind === 'measured' ? 'measured' : 'modeled'} title={a.source}>{a.kind}</Chip>
            </span>
          </div>
        ))}
      </details>
    </>
  );
}
