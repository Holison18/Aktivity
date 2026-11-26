// Geofence maths (FR-15, FR-16, FR-18, FR-20). Pure functions, no I/O.

const EARTH_RADIUS_M = 6_371_008.8; // mean Earth radius (IUGG)

export type Position = { lat: number; lng: number; accuracy: number };

/** Great-circle distance in metres between two points (haversine formula). */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Rounds a coordinate to 4 decimal places (about 11 m) before it is stored. */
export const roundCoord = (x: number) => Math.round(x * 1e4) / 1e4;

/** Rounds a distance to the nearest 10 m for display to a denied student. */
export const roundTo10 = (m: number) => Math.round(m / 10) * 10;

export type Fence = {
  enabled: boolean;
  lat: number | null;
  lng: number | null;
  radiusM: number;
  maxAccuracyM: number;
};

export type GeoReason = "ok" | "fence_off" | "override" | "no_position" | "low_accuracy" | "outside";

export type GeoResult = {
  allowed: boolean;
  reason: GeoReason;
  distanceM: number | null;
  accuracyM: number | null;
};

/**
 * Decides whether a reported position is inside the geofence.
 * The browser never makes this decision (SRS 6.1).
 */
export function checkGeofence(fence: Fence, pos: Position | null | undefined, hasOverride = false): GeoResult {
  const accuracyM = pos ? pos.accuracy : null;
  const distanceM =
    pos && fence.lat != null && fence.lng != null ? haversineMeters(fence.lat, fence.lng, pos.lat, pos.lng) : null;

  if (!fence.enabled) return { allowed: true, reason: "fence_off", distanceM, accuracyM };
  if (hasOverride) return { allowed: true, reason: "override", distanceM, accuracyM };
  if (!pos) return { allowed: false, reason: "no_position", distanceM: null, accuracyM: null };
  if (!(pos.accuracy <= fence.maxAccuracyM)) return { allowed: false, reason: "low_accuracy", distanceM, accuracyM };
  if (distanceM == null || distanceM > fence.radiusM) return { allowed: false, reason: "outside", distanceM, accuracyM };
  return { allowed: true, reason: "ok", distanceM, accuracyM };
}
