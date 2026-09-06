import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Threat } from '@surge/engine';
import { getContext, buildBaseList, entriesForTab, rankEntries, categoryFamily, focusLabel, type CategoryFamily, type ThreatEntry, type RankedEntry } from './engine.js';
import { useTabs, useFocus, useRead, useSettings, LIVE_TAB, type TabDef } from './state.js';
import { TopBar } from './components/TopBar.js';
import { Watchlist } from './components/Watchlist.js';
import { MapView } from './components/MapView.js';
import { Drawer } from './components/Drawer.js';
import { Compare } from './components/Compare.js';
import { Describe } from './components/Describe.js';
import { Settings } from './components/Settings.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { MapFallback } from './components/MapFallback.js';
import { webglAvailable } from './webgl.js';

interface Health { feeds?: { id: string; kind: string; status: string; stale?: boolean }[] }

export function App() {
  const ctx = useMemo(() => getContext(), []);
  const { tabs, create, update, remove, rename } = useTabs();
  const { focus, setFocus } = useFocus();
  const { readIds, markRead } = useRead();
  const { settings, setSettings } = useSettings();
  const [theme, setTheme] = useState<'dark' | 'light'>(settings.theme);
  const [activeTab, setActiveTab] = useState<string>('live');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [families, setFamilies] = useState<Set<CategoryFamily>>(new Set());
  const [commodities, setCommodities] = useState<Set<string>>(new Set());
  const [wlOpen, setWlOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [live, setLive] = useState<Threat[] | undefined>(undefined);
  // The simple map (our own geometry, English labels, no tile provider) is the default: CARTO's free tiles now
  // print "API KEY REQUIRED" across the basemap. The tile map is opt-in from Settings.
  const [mapMode, setMapMode] = useState<'webgl' | 'svg'>(() => (settings.basemap === 'tiles' && webglAvailable() ? 'webgl' : 'svg'));
  useEffect(() => { setMapMode(settings.basemap === 'tiles' && webglAvailable() ? 'webgl' : 'svg'); }, [settings.basemap]);
  const [fallbackReason, setFallbackReason] = useState('WebGL is not available in this browser');
  const [feedStatus, setFeedStatus] = useState('seeds · 2 replays');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    setSettings((s) => (s.theme === theme ? s : { ...s, theme }));
  }, [theme, setSettings]);

  // live threats from the server when it is reachable; the in-browser seeds otherwise.
  // Feeds refresh behind the first response, so poll a few times early on and every 5 minutes after.
  useEffect(() => {
    let on = true;
    let attempt = 0;
    const load = async () => {
      attempt += 1;
      try {
        const r = await fetch('/api/threats');
        if (!r.ok) return;
        const d = (await r.json()) as { threats: ({ threat: Threat } | Threat)[] };
        // the server returns ranked wrappers; accept bare threats too, and drop anything malformed
        const list = (d.threats ?? []).map((x) => ('threat' in x ? x.threat : x)).filter((t) => t && typeof t.id === 'string' && t.location && Array.isArray(t.commodities));
        if (on && list.length) setLive(list);
        const h = await fetch('/api/health');
        if (h.ok && on) {
          const hj = (await h.json()) as Health;
          const rows = hj.feeds ?? [];
          const liveN = rows.filter((x) => x.status === 'live').length;
          const stale = rows.filter((x) => x.status !== 'live').length;
          setFeedStatus(`${liveN} live feeds${stale ? ` · ${stale} on snapshot` : ''} · 2 replays`);
        }
      } catch { /* offline */ }
      if (on) setTimeout(() => { void load(); }, attempt < 4 ? 15000 : 5 * 60 * 1000);
    };
    void load();
    return () => { on = false; };
  }, []);

  const base = useMemo(() => buildBaseList(live), [live]);
  const tab: TabDef = activeTab === 'live' ? LIVE_TAB : tabs.find((t) => t.id === activeTab) ?? LIVE_TAB;
  const entries = useMemo(() => entriesForTab(base, tab), [base, tab]);
  const ranked = useMemo(() => rankEntries(entries, ctx), [entries, ctx]);
  const matches = (e: RankedEntry) => (families.size === 0 || families.has(categoryFamily(e.threat.category)))
    && (commodities.size === 0 || e.impact.commodities.some((c) => commodities.has(c)) || e.threat.commodities.some((c) => commodities.has(c.id)));
  const visible = ranked.filter(matches);
  const others = ranked.filter((e) => !matches(e));
  const selectedEntry = ranked.find((e) => e.threat.id === selectedId) ?? null;
  const editable = tab.id !== 'live';

  const select = useCallback((id: string) => { setSelectedId(id); markRead(id); setDrawerOpen(true); }, [markRead]);
  const entriesFor = useCallback((t: TabDef): ThreatEntry[] => entriesForTab(base, t), [base]);

  const onDial = (threatId: string, patch: { severity?: number; months?: number }) => update(tab.id, (t) => {
    const cur = { ...(t.overrides[threatId] ?? {}) };
    if ('severity' in patch) { if (patch.severity === undefined) delete cur.severity; else cur.severity = patch.severity; }
    if ('months' in patch) { if (patch.months === undefined) delete cur.months; else cur.months = patch.months; }
    const overrides = { ...t.overrides };
    if (Object.keys(cur).length === 0) delete overrides[threatId]; else overrides[threatId] = cur;
    return { ...t, overrides };
  });
  const onRemove = (threatId: string) => { update(tab.id, (t) => ({ ...t, removed: [...t.removed, threatId], added: t.added.filter((a) => a.id !== threatId) })); setSelectedId(null); setDrawerOpen(false); };
  const onAdd = (t: Threat) => { update(tab.id, (x) => ({ ...x, added: [...x.added, t] })); select(t.id); };
  /** Scenario tabs: clicking a supplier country adds a disruption there (export cut-off by default) covering everything it sends the US. */
  const pickRegion = (regionId: string) => {
    const r = ctx.regions[regionId]; if (!r) return;
    const ids = [...new Set([...Object.entries(r.usImportOriginShare ?? {}).filter(([, v]) => v >= 0.05).sort((a, b) => b[1] - a[1]).map(([k]) => k), ...Object.keys(r.worldExportShare ?? {})])].filter((id) => ctx.commodities[id] || ctx.inputs[id]);
    if (ids.length === 0) return;
    const t: Threat = { id: `user-${Date.now()}`, name: `Export cut-off — ${r.name}`, category: 'export_ban', kind: 'geopolitical', location: { lat: r.lat, lng: r.lng, admin: r.name, regionId, ...(r.countries?.length === 1 ? { iso3: r.countries[0]! } : {}) }, commodities: ids.map((id) => ({ id, relevance: 1 })), severity: 0.5, start: '2026-09', months: 6, source: { feed: 'Added on the map', kind: 'user', note: 'Dial severity and duration in the panel' } };
    onAdd(t);
  };
  const newTab = () => { const t = create(`Scenario ${tabs.length + 1}`); setActiveTab(t.id); };
  const closeTab = (id: string) => { remove(id); if (activeTab === id) setActiveTab('live'); };
  const fLabel = focusLabel(focus, ctx);

  return (
    <div className="app">
      <TopBar tabs={tabs} activeTab={activeTab} onSelectTab={(id) => { setActiveTab(id); setSelectedId(null); setDrawerOpen(false); }} onNewTab={newTab} onRenameTab={rename} onCloseTab={closeTab}
        feedStatus={feedStatus} onSettings={() => setShowSettings(true)} onCompare={() => setShowCompare(true)} theme={theme} toggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
      {editable && (
        <div className="scenario-bar">
          <Describe ctx={ctx} onAdd={onAdd} />
        </div>
      )}
      <div className="body">
        {wlOpen ? (
          <Watchlist entries={visible} others={others} selectedId={selectedId} onSelect={select} ctx={ctx} focus={focus} setFocus={setFocus} commodities={commodities} setCommodities={setCommodities} families={families} setFamilies={setFamilies} readIds={readIds} onCollapse={() => setWlOpen(false)} scenario={editable} />
        ) : (
          <button className="edge-toggle left" onClick={() => setWlOpen(true)} title="Show watchlist and filters"><span className="chev">›</span><span className="edge-lbl">Watchlist</span></button>
        )}
        {mapMode === 'webgl' ? (
          <ErrorBoundary label="Map" onError={(e) => { setFallbackReason(e.message.slice(0, 80)); setMapMode('svg'); }}>
            <MapView entries={visible} selectedId={selectedId} onSelect={select} theme={theme} ctx={ctx} focus={focus} lens={commodities} onFail={(why) => { setFallbackReason(why); setMapMode('svg'); }} onPickRegion={editable ? pickRegion : undefined} />
          </ErrorBoundary>
        ) : (
          <MapFallback entries={visible} selectedId={selectedId} onSelect={select} ctx={ctx} focus={focus} reason={fallbackReason} lens={commodities} resetKey={activeTab} onPickRegion={editable ? pickRegion : undefined} />
        )}
        {drawerOpen && selectedEntry ? (
          <ErrorBoundary label="Analysis"><Drawer entry={selectedEntry} ctx={ctx} focus={focus} tab={tab} editable={editable} onDial={onDial} onRemove={onRemove} onCollapse={() => setDrawerOpen(false)} /></ErrorBoundary>
        ) : selectedEntry ? (
          <button className="edge-toggle right" onClick={() => setDrawerOpen(true)} title="Show analysis"><span className="chev">‹</span><span className="edge-lbl">Analysis</span></button>
        ) : null}
      </div>
      <button className="fab" onClick={() => setShowSettings(true)} title="Email alerts"><span className="fab-ico">🔔</span> Alerts</button>
      {showCompare && <Compare ctx={ctx} tabs={tabs} base={base} entriesFor={entriesFor} focus={focus} onClose={() => setShowCompare(false)} />}
      {showSettings && <Settings settings={settings} onSave={setSettings} onClose={() => setShowSettings(false)} focusLabel={fLabel} />}
    </div>
  );
}
