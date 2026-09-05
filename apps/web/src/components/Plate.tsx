import type { EngineContext } from '@surge/engine';

const STAGES = ['input', 'farm', 'processing', 'plate'] as const;
const STAGE_LABEL = { input: 'Inputs', farm: 'Farm', processing: 'Processing', plate: 'On the plate' };
const COL_W = 150;
const ROW_H = 22;
const BOX_W = 128;

export function Plate({ ctx, shocked }: { ctx: EngineContext; shocked: Set<string> }) {
  const { nodes, edges } = ctx.plate;
  const byStage = STAGES.map((s) => nodes.filter((n) => n.stage === s));
  const maxRows = Math.max(...byStage.map((c) => c.length));
  const height = maxRows * ROW_H + 24;
  const width = STAGES.length * COL_W;

  const pos: Record<string, { x: number; y: number }> = {};
  byStage.forEach((col, ci) => {
    const offset = (maxRows - col.length) / 2;
    col.forEach((n, ri) => {
      pos[n.id] = { x: ci * COL_W + 8, y: (ri + offset) * ROW_H + 26 };
    });
  });

  const hot = (id: string): boolean => {
    const n = nodes.find((x) => x.id === id);
    return !!(n?.commodity && shocked.has(n.commodity));
  };

  return (
    <div className="section">
      <h4>From input to plate</h4>
      <div className="subfig" style={{ marginBottom: 8 }}>Highlighted items feel this threat. All commodities shown, not only the selected one.</div>
      <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
        <svg width={width} height={height} style={{ display: 'block' }}>
          {STAGES.map((s, ci) => (
            <text key={s} x={ci * COL_W + 8} y={14} fontSize={10} fill="var(--text-faint)" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {STAGE_LABEL[s]}
            </text>
          ))}
          {edges.map((e, i) => {
            const a = pos[e.from];
            const b = pos[e.to];
            if (!a || !b) return null;
            const on = hot(e.from) || hot(e.to);
            const x1 = a.x + BOX_W;
            const y1 = a.y + 8;
            const x2 = b.x;
            const y2 = b.y + 8;
            const mx = (x1 + x2) / 2;
            return (
              <path
                key={i}
                d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                fill="none"
                stroke={on ? 'var(--bad)' : 'var(--border-solid)'}
                strokeWidth={on ? 1.6 : 0.6}
                opacity={on ? 0.85 : 0.5}
              />
            );
          })}
          {nodes.map((n) => {
            const p = pos[n.id];
            if (!p) return null;
            const on = hot(n.id);
            return (
              <g key={n.id}>
                <rect
                  x={p.x} y={p.y} width={BOX_W} height={16} rx={3}
                  fill={on ? 'color-mix(in srgb, var(--bad) 22%, var(--panel-2))' : 'var(--panel-2)'}
                  stroke={on ? 'var(--bad)' : 'var(--border-solid)'}
                  strokeWidth={on ? 1.4 : 0.8}
                />
                <text x={p.x + 6} y={p.y + 11} fontSize={10} fill={on ? 'var(--text)' : 'var(--text-dim)'} fontWeight={on ? 700 : 400}>
                  {n.label.length > 17 ? n.label.slice(0, 16) + '…' : n.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
