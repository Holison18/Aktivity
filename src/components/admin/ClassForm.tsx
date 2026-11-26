"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveClass } from "@/app/admin/actions";
import { useAction } from "./useAction";
import { Busy } from "../ui";
import GeofencePicker from "./GeofencePicker";

type ClassRow = { id?: string; name: string; join_code: string; default_lat: number | null; default_lng: number | null; default_radius_m: number; course_ends_on: string | null };

export default function ClassForm({ initial }: { initial?: ClassRow }) {
  const router = useRouter();
  const { run, pending, feedback } = useAction();
  const [v, setV] = useState({
    name: initial?.name ?? "",
    join_code: initial?.join_code ?? "",
    default_lat: initial?.default_lat ?? null,
    default_lng: initial?.default_lng ?? null,
    default_radius_m: initial?.default_radius_m ?? 100,
    course_ends_on: initial?.course_ends_on ?? "",
  });

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveClass({ id: initial?.id, ...v }), {
          success: initial ? "Class saved." : undefined,
          onOk: (r) => { if (!initial) router.push(`/admin/classes/${r.id}`); },
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="c-name">Class name</label>
          <input id="c-name" className="field" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. PETE 451 Cyber Security, 2026" required />
        </div>
        <div>
          <label className="field-label" htmlFor="c-code">Class code (show it on the board)</label>
          <div className="flex gap-2">
            <input id="c-code" className="field uppercase tracking-widest" value={v.join_code} onChange={(e) => setV({ ...v, join_code: e.target.value })} required minLength={3} />
            <button type="button" className="btn btn-secondary shrink-0" onClick={() => setV({ ...v, join_code: Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("") })}>Random</button>
          </div>
        </div>
        <div className="sm:col-span-2 max-w-sm">
          <label className="field-label" htmlFor="c-end">Course end date (location data is deleted 90 days later)</label>
          <input id="c-end" type="date" className="field" value={v.course_ends_on} onChange={(e) => setV({ ...v, course_ends_on: e.target.value })} />
        </div>
      </div>

      <fieldset className="card p-5 space-y-4">
        <legend className="px-2 text-ink font-medium">Default classroom geofence</legend>
        <GeofencePicker
          idPrefix="c"
          lat={v.default_lat}
          lng={v.default_lng}
          radius={v.default_radius_m}
          autoDetectOnMount={!initial}
          onLocationChange={(default_lat, default_lng) => setV((x) => ({ ...x, default_lat, default_lng }))}
          onRadiusChange={(default_radius_m) => setV((x) => ({ ...x, default_radius_m }))}
        />
      </fieldset>

      {feedback}
      <button className="btn btn-primary" disabled={pending} aria-busy={pending}><Busy busy={pending} label={initial ? "Save class" : "Create class"} busyLabel="Saving…" arrow /></button>
    </form>
  );
}
