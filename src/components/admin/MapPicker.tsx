"use client";
// Map picker with a draggable centre and the radius drawn as a circle (FR-12).
// Leaflet + OpenStreetMap tiles. Loaded with next/dynamic from the scheduler only (UI-17).
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export default function MapPicker({ lat, lng, radius, onMove }: { lat: number | null; lng: number | null; radius: number; onMove: (lat: number, lng: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const circle = useRef<L.Circle | null>(null);
  const moveRef = useRef(onMove);
  useEffect(() => {
    moveRef.current = onMove;
  }, [onMove]);

  useEffect(() => {
    if (!el.current || map.current) return;
    const start: L.LatLngExpression = lat != null && lng != null ? [lat, lng] : [5.6508, -0.1869]; // University of Ghana area as a neutral default
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(start, lat != null ? 17 : 14);
    const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
      referrerPolicy: "strict-origin-when-cross-origin",
    }).addTo(m);
    let fellBack = false;
    osm.on("tileerror", () => {
      if (fellBack || !map.current) return;
      fellBack = true;
      m.removeLayer(osm);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
        subdomains: "abcd",
        attribution: "© OpenStreetMap contributors © CARTO",
        referrerPolicy: "strict-origin-when-cross-origin",
      }).addTo(m);
    });
    // The marker is HTML, so it can use the tokens directly; the circle is SVG attributes, so it reads the token value.
    const icon = L.divIcon({ className: "", html: '<div style="width:22px;height:22px;border-radius:var(--radius-pill);background:var(--ink);border:3px solid var(--paper);box-shadow:var(--shadow-marker)"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
    const mk = L.marker(start, { draggable: true, icon, keyboard: true, title: "Geofence centre (drag to move)" }).addTo(m);
    const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#0a0a0a";
    const c = L.circle(start, { radius, color: ink, weight: 1.5, fillColor: ink, fillOpacity: 0.08 }).addTo(m);
    mk.on("drag", () => c.setLatLng(mk.getLatLng()));
    mk.on("dragend", () => { const p = mk.getLatLng(); moveRef.current(p.lat, p.lng); });
    m.on("click", (e: L.LeafletMouseEvent) => { mk.setLatLng(e.latlng); c.setLatLng(e.latlng); moveRef.current(e.latlng.lat, e.latlng.lng); });
    map.current = m; marker.current = mk; circle.current = c;
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lat == null || lng == null || !marker.current || !circle.current) return;
    const cur = marker.current.getLatLng();
    if (Math.abs(cur.lat - lat) > 1e-7 || Math.abs(cur.lng - lng) > 1e-7) {
      marker.current.setLatLng([lat, lng]);
      circle.current.setLatLng([lat, lng]);
      map.current?.setView([lat, lng], Math.max(map.current.getZoom(), 16));
    }
  }, [lat, lng]);

  useEffect(() => { circle.current?.setRadius(radius); }, [radius]);

  return <div ref={el} className="h-80 w-full overflow-hidden rounded-2xl border border-line" role="application" aria-label="Map: click or drag the black dot to set the geofence centre" />;
}
