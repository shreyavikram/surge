import { FAMILY_COLOR } from '../engine.js';

const ROWS: { family: keyof typeof FAMILY_COLOR; label: string }[] = [
  { family: 'geopolitical', label: 'Trade & geopolitics' },
  { family: 'natural', label: 'Weather & climate' },
  { family: 'biological', label: 'Pest & disease' },
  { family: 'supply', label: 'Input & facility' },
];

export function CategoryLegend() {
  return (
    <div className="legend">
      <div className="faint" style={{ marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10 }}>
        Marker size = consumer loss
      </div>
      {ROWS.map((r) => (
        <div className="lg-row" key={r.family}>
          <span className="sw" style={{ background: FAMILY_COLOR[r.family] }} />
          {r.label}
        </div>
      ))}
    </div>
  );
}
