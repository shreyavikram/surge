import type { EngineContext } from '@surge/engine';

// Stub — full drop/dial/save/compare Simulator lands in Task 6.
export function Simulator({ ctx }: { ctx: EngineContext; theme: 'dark' | 'light' }) {
  return (
    <div className="body" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="muted">Simulator — {Object.keys(ctx.commodities).length} commodities ready. Building next.</div>
    </div>
  );
}
