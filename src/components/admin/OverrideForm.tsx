"use client";
// Per-student exception for one week (FR-24): geofence or time, with reason and expiry. Every one is kept in the log.
import { useState } from "react";
import { createOverride, endOverride } from "@/app/admin/actions";
import { useAction } from "./useAction";
import { Busy } from "../ui";

function inTwoHours() {
  return new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 16);
}

export function OverrideForm({ weekId, index }: { weekId: string; index: string }) {
  const { run, pending, feedback } = useAction();
  const [v, setV] = useState({ kind: "geofence" as "geofence" | "time", reason: "", expires_local: inTwoHours() });
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createOverride({ week_id: weekId, index_number: index, ...v }), { success: "Exception granted.", onOk: () => setV({ ...v, reason: "" }) });
      }}
    >
      <div>
        <span className="field-label">Kind</span>
        <div role="radiogroup" aria-label="Exception kind" className="flex gap-2">
          <button type="button" role="radio" aria-checked={v.kind === "geofence"} className="chip" onClick={() => setV({ ...v, kind: "geofence" })}>Geofence</button>
          <button type="button" role="radio" aria-checked={v.kind === "time"} className="chip" onClick={() => setV({ ...v, kind: "time" })}>Time window</button>
        </div>
      </div>
      <div>
        <label className="field-label" htmlFor="o-exp">Expires (Accra time)</label>
        <input id="o-exp" type="datetime-local" className="field" value={v.expires_local} onChange={(e) => setV({ ...v, expires_local: e.target.value })} required />
      </div>
      <div className="sm:col-span-2">
        <label className="field-label" htmlFor="o-reason">Reason</label>
        <input id="o-reason" className="field" value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder="e.g. Laptop has no location; seen in class" required minLength={3} />
      </div>
      <div className="sm:col-span-2 space-y-3">
        {feedback}
        <button className="btn btn-primary" disabled={pending} aria-busy={pending}><Busy busy={pending} label="Grant exception" busyLabel="Saving…" /></button>
      </div>
    </form>
  );
}

export function EndOverrideButton({ id }: { id: string }) {
  const { run, pending, feedback } = useAction();
  return (
    <span className="inline-flex flex-col gap-1">
      <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => endOverride(id))}>End now</button>
      {feedback}
    </span>
  );
}
