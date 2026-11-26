"use client";
// Live results (FR-32): best per activity, total and percent, refreshed every 5 s,
// with counts of students who started and submitted. One query per refresh (NF-09).
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ResultsPayload } from "@/app/api/admin/results/route";
import { Stat } from "../ui";
import { WindowControls } from "./WeekControls";
import { ProjectQrButton, type QrTarget } from "./QrProjector";
import { formatAccra, windowLabel, windowState } from "@/lib/window";

type Sort = "index" | "total" | "name";

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Accra",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Mirrors sort and search into the query string without a server round trip, so a refresh keeps them. */
function writeUrl(sort: Sort, q: string) {
  const params = new URLSearchParams(window.location.search);
  if (sort === "index") params.delete("sort"); else params.set("sort", sort);
  if (q.trim()) params.set("q", q); else params.delete("q");
  const qs = params.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

export default function LiveResults({
  weekId,
  classId,
  weeks,
  initialSort = "index",
  initialQuery = "",
  initialData = null,
  qrItem,
}: {
  weekId: string;
  classId: string;
  weeks: { id: string; number: number; title: string }[];
  initialSort?: Sort;
  initialQuery?: string;
  initialData?: ResultsPayload | null;
  qrItem?: QrTarget;
}) {
  const router = useRouter();
  const [polled, setPolled] = useState<{ data: ResultsPayload; updated: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sort, setSortState] = useState<Sort>(initialSort);
  const [q, setQState] = useState(initialQuery);
  const deferredQ = useDeferredValue(q);
  const setSort = (s: Sort) => { setSortState(s); writeUrl(s, q); };
  const setQ = (v: string) => { setQState(v); writeUrl(sort, v); };

  const activePolled = polled?.data.week.id === weekId ? polled : null;
  const data = activePolled?.data ?? (initialData?.week.id === weekId ? initialData : null);
  const updated = activePolled?.updated ?? (data ? data.serverNow : null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    async function tick() {
      if (!alive || document.hidden) return;
      controller?.abort();
      controller = new AbortController();
      try {
        const r = await fetch(`/api/admin/results?week=${weekId}`, { cache: "no-store", signal: controller.signal });
        if (!r.ok) throw new Error(r.status === 401 ? "Your admin session ended. Sign in again." : `The server answered ${r.status}.`);
        const d = (await r.json()) as ResultsPayload;
        if (alive) { setPolled({ data: d, updated: Date.now() }); setErr(null); }
      } catch (e) {
        if (alive && (e as Error).name !== "AbortError") setErr((e as Error).message);
      }
      if (alive && !document.hidden) {
        timer = setTimeout(tick, 5000);
      }
    }

    const onVisibility = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!document.hidden && alive) tick();
      else controller?.abort();
    };

    // If SSR already provided initialData, wait 5s before the first poll; otherwise fetch immediately.
    if (initialData && initialData.week.id === weekId) {
      timer = setTimeout(tick, 5000);
    } else {
      tick();
    }

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [weekId, initialData]);

  const rows = useMemo(() => {
    if (!data) return [];
    const s = deferredQ.trim().toLowerCase();
    const list = s ? data.rows.filter((r) => r.index_number.toLowerCase().includes(s) || r.name.toLowerCase().includes(s)) : data.rows.slice();
    if (sort === "total") list.sort((a, b) => b.total - a.total);
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [data, sort, deferredQ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <label className="field-label" htmlFor="r-week">Week</label>
          <select id="r-week" className="field min-w-[16rem]" value={weekId} onChange={(e) => router.push(`/admin/weeks/${e.target.value}/results${window.location.search}`)}>
            {weeks.map((w) => <option key={w.id} value={w.id}>Week {w.number}: {w.title}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {qrItem && <ProjectQrButton item={qrItem} label="Project QR" variant="dark" />}
          <WindowControls weekId={weekId} compact />
          <a className="btn btn-secondary btn-sm" href={`/api/admin/export?class=${classId}&week=${weekId}`}>Download Excel</a>
        </div>
      </div>

      {err && <p className="notice notice-bad" role="alert">{err} Retrying every 5 seconds.</p>}

      {data && (
        <>
          <div className="flex flex-wrap items-end gap-x-12 gap-y-6">
            <Stat value={data.started_count} label="Started" />
            <Stat value={data.submitted_count} label="Submitted" />
            <Stat value={data.registered_count} label="Registered" />
            <div className="text-sm">
              <p>{data.week.published ? windowLabel(windowState(data.week, data.serverNow)) : "Draft (not published)"}</p>
              <p>Closes <strong>{formatAccra(data.week.closes_at)}</strong></p>
              <p aria-live="polite">Updated {updated ? TIME_FMT.format(new Date(updated)) : "…"}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[14rem] flex-1">
              <label className="field-label" htmlFor="r-q">Find a student</label>
              <input id="r-q" className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Index number or name" />
            </div>
            <div role="group" aria-label="Sort by" className="flex gap-2 pb-0.5">
              {(["index", "name", "total"] as const).map((s) => <button key={s} className="chip" aria-pressed={sort === s} onClick={() => setSort(s)}>{s === "index" ? "Index" : s === "name" ? "Name" : "Total"}</button>)}
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Index number</th>
                  <th>Name</th>
                  {data.activities.map((a) => <th key={a.id} className="text-right">A{a.position} /{Number(a.max_score)}</th>)}
                  <th className="text-right">Total /{rows[0]?.max ?? data.activities.reduce((s, a) => s + Number(a.max_score), 0)}</th>
                  <th className="text-right">%</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.index_number}>
                    <td className="tabular-nums"><Link href={`/admin/weeks/${weekId}/students/${encodeURIComponent(r.index_number)}`} className="underline underline-offset-2">{r.index_number}</Link></td>
                    <td>{r.name}</td>
                    {data.activities.map((a) => {
                      const x = r.results[a.id];
                      return <td key={a.id} className="text-right tabular-nums">{x ? `${Number(x.best)}` : "–"}{x && x.attempts > 1 ? <span className="text-muted text-xs"> ×{x.attempts}</span> : null}</td>;
                    })}
                    <td className="text-right tabular-nums font-medium">{r.total}</td>
                    <td className="text-right tabular-nums">{r.pct ?? "–"}</td>
                    <td>{r.flagged ? <span className="mark-bad">Flagged</span> : Object.keys(r.results).length ? "Submitted" : r.started ? "Started" : "–"}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={5 + data.activities.length} className="text-body">No students yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!data && !err && <p>Loading results…</p>}
    </div>
  );
}
