import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { type RankedEntry, categoryColor } from '../engine.js';
import { compactUsd } from '../format.js';
import { CategoryLegend } from './CategoryLegend.js';

const STYLE: Record<'dark' | 'light', string> = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/liberty',
};

function radius(cv: number): number {
  const r = 8 + 6 * Math.log10(Math.max(1, cv / 1e6));
  return Math.max(9, Math.min(30, r));
}

interface Props {
  entries: RankedEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  theme: 'dark' | 'light';
}

export function MapView({ entries, selectedId, onSelect, theme }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const themeInit = useRef(true);
  const firstFly = useRef(true);

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: STYLE[theme],
      center: [-20, 25],
      zoom: 1.3,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (themeInit.current) { themeInit.current = false; return; }
    mapRef.current?.setStyle(STYLE[theme]);
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    for (const e of entries) {
      const el = document.createElement('div');
      el.className = `marker${selectedId === e.threat.id ? ' sel' : ''}`;
      const d = radius(e.cv) * 2;
      el.style.width = `${d}px`;
      el.style.height = `${d}px`;
      el.style.background = categoryColor(e.threat.category);
      el.title = `${e.threat.name} — ${compactUsd(e.cv)}`;
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onSelectRef.current(e.threat.id);
      });
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([e.threat.location.lng, e.threat.location.lat])
        .addTo(map);
      markers.current.push(marker);
    }
  }, [entries, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    if (firstFly.current) { firstFly.current = false; return; } // keep the world view on initial auto-select
    const e = entries.find((x) => x.threat.id === selectedId);
    if (e) map.flyTo({ center: [e.threat.location.lng, e.threat.location.lat], zoom: Math.max(map.getZoom(), 3.2), speed: 0.9 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <div className="map-wrap">
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      <CategoryLegend />
    </div>
  );
}
