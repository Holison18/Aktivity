import "server-only";
import { headers } from "next/headers";
import { db, must } from "../supabase/service";
import { totals, type ActivityMeta, type Best } from "../results";
import { windowLabel, windowState } from "../window";
import type { ClassOption } from "@/components/admin/WeekForm";
import type { QrTarget } from "@/components/admin/QrProjector";

export type WeekForQr = {
  id: string;
  number: number;
  title: string;
  opens_at: string;
  closes_at: string;
  published: boolean;
  link_token: string;
};

/** Picks the best default week to project for a class: currently open -> next upcoming -> most recent. */
export function pickDefaultQrWeekId(weeks: WeekForQr[], now: number): string | undefined {
  if (weeks.length === 0) return undefined;
  const open = weeks
    .filter((w) => w.published && windowState(w, now) === "open")
    .sort((a, b) => b.number - a.number);
  if (open.length > 0) return open[0].id;

  const upcoming = weeks
    .filter((w) => w.published && windowState(w, now) === "before")
    .sort((a, b) => Date.parse(a.opens_at) - Date.parse(b.opens_at));
  if (upcoming.length > 0) return upcoming[0].id;

  return [...weeks].sort((a, b) => b.number - a.number)[0].id;
}

/** Builds QrTarget items sorted by week number for the fullscreen QR projector. */
export function buildClassQrItems(
  className: string,
  joinCode: string,
  weeks: WeekForQr[],
  origin: string,
  now: number,
): QrTarget[] {
  return [...weeks]
    .sort((a, b) => a.number - b.number)
    .map((w) => ({
      id: w.id,
      url: `${origin}/w/${w.link_token}`,
      className,
      weekNumber: w.number,
      weekTitle: w.title,
      joinCode,
      statusLabel: windowLabel(w.published ? windowState(w, now) : "draft"),
    }));
}

export type ResultsPayload = {
  serverNow: number;
  week: { id: string; class_id: string; number: number; title: string; opens_at: string; closes_at: string; published: boolean };
  activities: (ActivityMeta & { type: string; max_attempts: number })[];
  rows: { index_number: string; name: string; started: boolean; results: Record<string, Best>; total: number; max: number; pct: number | null; flagged: boolean }[];
  started_count: number;
  submitted_count: number;
  registered_count: number;
};

/** Loads live week results in a single RPC round-trip, shared by /api/admin/results and the SSR results page. */
export async function fetchWeekResults(weekId: string): Promise<ResultsPayload | null> {
  const data = must(await db().rpc("week_results", { p_week: weekId }), "week results") as (Omit<ResultsPayload, "rows" | "serverNow" | "registered_count"> & {
    students: { index_number: string; name: string; started: boolean; results: Record<string, Best> }[];
  }) | null;
  if (!data?.week) return null;

  const rows = data.students.map((s) => ({
    ...s,
    ...totals(data.activities, s.results),
    flagged: Object.values(s.results).some((r) => r.flagged),
  }));
  return {
    serverNow: Date.now(),
    week: data.week,
    activities: data.activities,
    rows,
    started_count: data.started_count,
    submitted_count: data.submitted_count,
    registered_count: rows.length,
  };
}

export async function classOptions(): Promise<ClassOption[]> {
  const rows = must(await db().from("classes").select("id, name, default_lat, default_lng, default_radius_m, weeks(number)").order("created_at", { ascending: false }), "load classes") as unknown as (Omit<ClassOption, "nextNumber"> & { weeks: { number: number }[] })[];
  return rows.map(({ weeks, ...c }) => ({ ...c, nextNumber: Math.max(0, ...weeks.map((w) => w.number)) + 1 }));
}

/** Absolute origin for week links: NEXT_PUBLIC_SITE_URL, else the request host or Vercel URL. */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    const withScheme = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
    return withScheme.replace(/\/+$/, "");
  }
  const h = await headers();
  const rawHost = h.get("x-forwarded-host") || h.get("host");
  const host = rawHost ? rawHost.split(",")[0].trim() : "";
  if (host) {
    const rawProto = h.get("x-forwarded-proto");
    const proto = rawProto
      ? rawProto.split(",")[0].trim()
      : host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https";
    return `${proto}://${host}`;
  }
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}
