'use client';

import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type { ActivityRouteTrace } from '@/lib/activity-route';

export default function ActivityRouteMap({ trace }: { trace: ActivityRouteTrace }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let map: import('leaflet').Map | undefined;
    let observer: ResizeObserver | undefined;
    setError(false);
    void import('leaflet').then(L => {
      if (cancelled || !container.current) return;
      map = L.map(container.current, { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);
      const lines = trace.segments.map(segment => L.polyline(segment, { color: '#38d9c4', weight: 4 }).addTo(map!));
      const points = trace.segments.flat();
      L.circleMarker(points[0], { radius: 7, color: '#fff', fillColor: '#65e892', fillOpacity: 1, weight: 2 })
        .bindTooltip('Depart').addTo(map);
      L.circleMarker(points[points.length - 1], { radius: 6, color: '#fff', fillColor: '#299de2', fillOpacity: 1, weight: 2 })
        .bindTooltip('Arrivee').addTo(map);
      const bounds = L.featureGroup(lines).getBounds();
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 });
      observer = new ResizeObserver(() => map?.invalidateSize());
      observer.observe(container.current);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; observer?.disconnect(); map?.remove(); };
  }, [trace]);
  return <div className="activity-route-map-wrap">
    <div ref={container} className="activity-route-map" role="region" aria-label="Carte du parcours GPS" />
    {error ? <p role="status">Carte indisponible. Les statistiques restent accessibles.</p> : null}
  </div>;
}
