"use client";
// Shared geofence selector for classes and weeks: automatic current-location detection,
// interactive map with radius circle, radius slider + presets + numeric input, and optional manual coordinates.
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

const MapPicker = dynamic(() => import("./MapPicker"), {
  ssr: false,
  loading: () => <div className="h-80 w-full rounded-2xl bg-fill" aria-hidden="true" />,
});

const RADIUS_PRESETS = [50, 100, 150, 250, 500];

export type GeofencePickerProps = {
  lat: number | null;
  lng: number | null;
  radius: number;
  onLocationChange: (lat: number | null, lng: number | null) => void;
  onRadiusChange: (radius: number) => void;
  autoDetectOnMount?: boolean;
  idPrefix: string;
  disabled?: boolean;
};

export default function GeofencePicker({
  lat,
  lng,
  radius,
  onLocationChange,
  onRadiusChange,
  autoDetectOnMount = false,
  idPrefix,
  disabled = false,
}: GeofencePickerProps) {
  const [locating, setLocating] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [radiusText, setRadiusText] = useState<string | null>(null);
  const onLocationChangeRef = useRef(onLocationChange);
  const aliveRef = useRef(true);
  const autoTriedRef = useRef(false);

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const detectLocation = useCallback((silentError = false) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      if (!silentError) setGeoMsg("Location is not available on this device. Click the map or enter coordinates manually.");
      return;
    }
    setLocating(true);
    setGeoMsg("Detecting your current location…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (!aliveRef.current) return;
        const nextLat = Number(p.coords.latitude.toFixed(6));
        const nextLng = Number(p.coords.longitude.toFixed(6));
        onLocationChangeRef.current(nextLat, nextLng);
        setLocating(false);
        setGeoMsg(`Centre set to your current location (±${Math.round(p.coords.accuracy)} m).`);
      },
      (err) => {
        if (!aliveRef.current) return;
        setLocating(false);
        if (silentError) {
          setGeoMsg("Could not detect your location automatically. Click \"Use my current location\" or click the map to set the centre.");
          return;
        }
        if (err.code === err.PERMISSION_DENIED) {
          setGeoMsg("Location permission was denied. Allow location in your browser settings, or click the map to place the centre.");
        } else if (err.code === err.TIMEOUT) {
          setGeoMsg("Location request timed out. Try again or click the map to place the centre.");
        } else {
          setGeoMsg("Your location is not available right now. Click the map to place the centre.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    if (!autoDetectOnMount || disabled || autoTriedRef.current) return;
    if (lat != null && lng != null) return;
    autoTriedRef.current = true;
    const t = setTimeout(() => detectLocation(true), 0);
    return () => clearTimeout(t);
  }, [autoDetectOnMount, disabled, lat, lng, detectLocation]);

  const sliderValue = Math.min(1000, Math.max(20, Number.isFinite(radius) ? radius : 100));

  return (
    <div className={disabled ? "space-y-5 opacity-50" : "space-y-5"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-ink">
            {lat != null && lng != null ? (
              <>Centre: <span className="tabular-nums font-normal">{lat.toFixed(6)}, {lng.toFixed(6)}</span></>
            ) : (
              "Centre not set yet"
            )}
          </p>
          <p className="text-xs text-muted">Click the button to use your current position, or drag the black dot on the map.</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary shrink-0"
          disabled={disabled || locating}
          onClick={() => detectLocation(false)}
        >
          {locating ? "Detecting location…" : "Use my current location"}
        </button>
      </div>

      {geoMsg && <p className="text-sm" role="status">{geoMsg}</p>}

      <MapPicker
        lat={lat}
        lng={lng}
        radius={radius}
        onMove={(nextLat, nextLng) => {
          onLocationChange(Number(nextLat.toFixed(6)), Number(nextLng.toFixed(6)));
          setGeoMsg(null);
        }}
      />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="field-label mb-0" htmlFor={`${idPrefix}-radius-num`}>
            Allowed radius: <strong>{radius} m</strong>
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`${idPrefix}-radius-num`}
              type="number"
              min={10}
              max={50000}
              step={10}
              className="field w-28 py-1.5 text-right tabular-nums"
              value={radiusText ?? String(radius)}
              onChange={(e) => {
                const raw = e.target.value;
                setRadiusText(raw);
                if (raw === "") return;
                const n = Number(raw);
                if (Number.isFinite(n) && n >= 10 && n <= 50000) onRadiusChange(Math.round(n));
              }}
              onBlur={() => {
                if (radiusText !== null) {
                  const n = Number(radiusText);
                  if (Number.isFinite(n) && radiusText.trim() !== "") {
                    onRadiusChange(Math.max(10, Math.min(50000, Math.round(n))));
                  }
                  setRadiusText(null);
                }
              }}
              disabled={disabled}
            />
            <span className="text-sm text-muted">m</span>
          </div>
        </div>

        <input
          id={`${idPrefix}-radius`}
          type="range"
          min={20}
          max={1000}
          step={10}
          className="w-full accent-black"
          value={sliderValue}
          onChange={(e) => onRadiusChange(Number(e.target.value))}
          disabled={disabled}
          aria-label="Allowed radius in metres"
        />

        <div className="flex flex-wrap gap-2">
          {RADIUS_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={disabled}
              className={radius === preset ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
              onClick={() => onRadiusChange(preset)}
            >
              {preset} m
            </button>
          ))}
        </div>

        <p className="text-sm">
          Anyone outside this radius will not be able to start or submit an assessment. Cover the whole room (typically 100 m or more); test from the back row first.
        </p>
      </div>

      <details className="rounded-2xl border border-line px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-ink">Adjust coordinates manually</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor={`${idPrefix}-lat`}>Centre latitude</label>
            <input
              id={`${idPrefix}-lat`}
              className="field"
              inputMode="decimal"
              value={lat ?? ""}
              onChange={(e) => onLocationChange(e.target.value === "" ? null : Number(e.target.value), lng)}
              placeholder="e.g. 6.672647"
              disabled={disabled}
            />
          </div>
          <div>
            <label className="field-label" htmlFor={`${idPrefix}-lng`}>Centre longitude</label>
            <input
              id={`${idPrefix}-lng`}
              className="field"
              inputMode="decimal"
              value={lng ?? ""}
              onChange={(e) => onLocationChange(lat, e.target.value === "" ? null : Number(e.target.value))}
              placeholder="e.g. -1.564554"
              disabled={disabled}
            />
          </div>
        </div>
      </details>
    </div>
  );
}
