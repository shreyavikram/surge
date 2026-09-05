import { loadContext } from '@surge/config';

export function App() {
  const ctx = loadContext();
  const commodities = Object.keys(ctx.commodities).length;
  const regions = Object.keys(ctx.regions).length;
  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          SUR<span>GE</span>
        </div>
        <div className="tagline">food-supply threat intelligence</div>
        <div className="spacer" />
        <div className="feedstatus">
          <span className="dot seed" /> scaffold
        </div>
      </div>
      <div className="body" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="muted">
          engine loaded: {commodities} commodities, {regions} regions
        </div>
      </div>
    </div>
  );
}
