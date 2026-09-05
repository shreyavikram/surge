import { useEffect, useMemo, useState } from 'react';
import { getContext, buildThreatList, rankEntries, categoryFamily, type CategoryFamily } from './engine.js';
import { TopBar } from './components/TopBar.js';
import { Watchlist } from './components/Watchlist.js';
import { MapView } from './components/MapView.js';
import { Drawer } from './components/Drawer.js';
import { Simulator } from './components/Simulator.js';

function initialTheme(): 'dark' | 'light' {
  try {
    const t = localStorage.getItem('surge-theme');
    if (t === 'dark' || t === 'light') return t;
  } catch { /* ignore */ }
  return 'dark';
}

export function App() {
  const ctx = useMemo(() => getContext(), []);
  const ranked = useMemo(() => rankEntries(buildThreatList(), ctx), [ctx]);

  const [view, setView] = useState<'live' | 'sim'>('live');
  const [theme, setTheme] = useState<'dark' | 'light'>(initialTheme);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<CategoryFamily | 'all'>('all');
  const [wlOpen, setWlOpen] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('surge-theme', theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    if (!selectedId && ranked.length) setSelectedId(ranked[0]!.threat.id);
  }, [ranked, selectedId]);

  const visible = filter === 'all' ? ranked : ranked.filter((e) => categoryFamily(e.threat.category) === filter);
  const selectedEntry = ranked.find((e) => e.threat.id === selectedId) ?? null;

  const seeds = ranked.filter((e) => e.origin === 'seed').length;
  const replays = ranked.filter((e) => e.origin === 'replay').length;

  return (
    <div className="app">
      <TopBar
        view={view} setView={setView}
        theme={theme} toggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        seeds={seeds} replays={replays}
        onToggleWatchlist={() => setWlOpen((o) => !o)}
      />
      {view === 'live' ? (
        <div className="body">
          {wlOpen && (
            <Watchlist entries={visible} selectedId={selectedId} onSelect={setSelectedId} ctx={ctx} filter={filter} onFilter={setFilter} />
          )}
          <MapView entries={visible} selectedId={selectedId} onSelect={setSelectedId} theme={theme} />
          <Drawer entry={selectedEntry} ctx={ctx} />
        </div>
      ) : (
        <Simulator ctx={ctx} theme={theme} />
      )}
    </div>
  );
}
