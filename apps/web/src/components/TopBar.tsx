interface Props {
  view: 'live' | 'sim';
  setView: (v: 'live' | 'sim') => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  seeds: number;
  replays: number;
  onToggleWatchlist: () => void;
}

export function TopBar({ view, setView, theme, toggleTheme, seeds, replays, onToggleWatchlist }: Props) {
  return (
    <div className="topbar">
      <button className="iconbtn" onClick={onToggleWatchlist} title="Toggle watchlist">☰</button>
      <div className="brand">SUR<span>GE</span></div>
      <div className="tagline">food-supply threat intelligence</div>
      <div className="seg" style={{ marginLeft: 8 }}>
        <button className={view === 'live' ? 'on' : ''} onClick={() => setView('live')}>Live</button>
        <button className={view === 'sim' ? 'on' : ''} onClick={() => setView('sim')}>Simulator</button>
      </div>
      <div className="spacer" />
      <div className="feedstatus">
        <span className="dot seed" /> {seeds} seeds · {replays} replays
        <span className="faint" style={{ marginLeft: 6 }}>· live feeds land in Stage 2</span>
      </div>
      <button className="iconbtn" onClick={toggleTheme} title="Toggle theme">{theme === 'dark' ? '☀' : '☾'}</button>
    </div>
  );
}
