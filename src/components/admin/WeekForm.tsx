"use client";
// Week scheduler (FR-12, FR-13, FR-19, FR-29): title, window, geofence with map, accuracy limit, published.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveWeek } from "@/app/admin/actions";
import { useAction } from "./useAction";
import { Busy } from "../ui";
import { isoToAccraLocal } from "@/lib/window";
import GeofencePicker from "./GeofencePicker";

export type ClassOption = { id: string; name: string; default_lat: number | null; default_lng: number | null; default_radius_m: number; nextNumber: number };
export type WeekInitial = {
  id: string; class_id: string; number: number; title: string; opens_at: string; closes_at: string; published: boolean;
  geofence_enabled: boolean; center_lat: number | null; center_lng: number | null; radius_m: number; max_accuracy_m: number;
};

type FormValues = {
  class_id: string;
  number: string;
  title: string;
  opens_local: string;
  closes_local: string;
  published: boolean;
  geofence_enabled: boolean;
  center_lat: number | null;
  center_lng: number | null;
  radius_m: number;
  max_accuracy_m: number;
};

function nextFriday8(): string {
  const d = new Date();
  const add = (5 - d.getUTCDay() + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return `${d.toISOString().slice(0, 10)}T08:00`;
}

export default function WeekForm({
  classes,
  initial,
  defaultClassId,
  cancelHref,
}: {
  classes: ClassOption[];
  initial?: WeekInitial;
  defaultClassId?: string;
  cancelHref?: string;
}) {
  const router = useRouter();
  const { run, pending, feedback } = useAction();
  const first = classes.find((c) => c.id === (initial?.class_id ?? defaultClassId)) ?? classes[0];
  const opens = initial ? isoToAccraLocal(initial.opens_at) : nextFriday8();
  const draftKey = !initial ? `aktivity:week-draft:${defaultClassId || "default"}` : null;

  const [v, setV] = useState<FormValues>({
    class_id: initial?.class_id ?? first?.id ?? "",
    number: String(initial?.number ?? first?.nextNumber ?? 1),
    title: initial?.title ?? "",
    opens_local: opens,
    closes_local: initial ? isoToAccraLocal(initial.closes_at) : opens.replace("T08:00", "T10:00"),
    published: initial?.published ?? false,
    geofence_enabled: initial?.geofence_enabled ?? true,
    // FR-13: a new week copies the class default location.
    center_lat: initial?.center_lat ?? first?.default_lat ?? null,
    center_lng: initial?.center_lng ?? first?.default_lng ?? null,
    radius_m: initial?.radius_m ?? first?.default_radius_m ?? 100,
    max_accuracy_m: initial?.max_accuracy_m ?? 100,
  });
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [savingMode, setSavingMode] = useState<"primary" | "draft" | null>(null);
  const dirtyRef = useRef(false);

  // Restore any unfinished new-week draft if the lecturer navigated away without cancelling or saving.
  useEffect(() => {
    if (!draftKey) return;
    const t = window.setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(draftKey);
        if (!raw) return;
        const saved = JSON.parse(raw) as Partial<FormValues>;
        if (saved && typeof saved === "object" && (!saved.class_id || classes.some((c) => c.id === saved.class_id))) {
          setV((cur) => ({ ...cur, ...saved }));
          setRestoredDraft(true);
        }
      } catch {
        /* ignore corrupt storage */
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [draftKey, classes]);

  // Keep the unfinished new-week draft updated in sessionStorage once the user starts editing.
  useEffect(() => {
    if (!draftKey || !dirtyRef.current) return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(v));
    } catch {
      /* ignore quota errors */
    }
  }, [draftKey, v]);

  function editV(updater: Partial<FormValues> | ((cur: FormValues) => FormValues)) {
    dirtyRef.current = true;
    setV((cur) => (typeof updater === "function" ? updater(cur) : { ...cur, ...updater }));
  }

  function clearLocalDraft() {
    dirtyRef.current = false;
    if (!draftKey) return;
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
    setRestoredDraft(false);
  }

  function pickClass(id: string) {
    const c = classes.find((x) => x.id === id);
    editV((x) => ({
      ...x,
      class_id: id,
      number: initial ? x.number : String(c?.nextNumber ?? 1),
      center_lat: c?.default_lat ?? x.center_lat,
      center_lng: c?.default_lng ?? x.center_lng,
      radius_m: c?.default_radius_m ?? x.radius_m,
    }));
  }

  function saveDraftToDb() {
    setSavingMode("draft");
    const hasCoords = v.center_lat != null && v.center_lng != null;
    const weekNo = Number(v.number) || 1;
    run(
      () =>
        saveWeek({
          id: initial?.id,
          ...v,
          number: weekNo,
          title: v.title.trim() || `Week ${weekNo}`,
          published: false,
          geofence_enabled: v.geofence_enabled && hasCoords,
        }),
      {
        onOk: () => {
          clearLocalDraft();
          router.push(cancelHref ?? "/admin/weeks");
        },
      },
    );
  }

  function handleCancel() {
    clearLocalDraft();
    router.push(cancelHref ?? "/admin/weeks");
  }

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        setSavingMode("primary");
        run(() => saveWeek({ id: initial?.id, ...v, number: Number(v.number) }), {
          success: initial ? "Week saved." : undefined,
          onOk: (r) => {
            clearLocalDraft();
            if (!initial) router.push(`/admin/weeks/${r.id}`);
          },
        });
      }}
    >
      {restoredDraft && !initial && (
        <div className="notice flex flex-wrap items-center justify-between gap-3">
          <span>Restored your unfinished week draft.</span>
          <button type="button" className="btn-link text-sm" onClick={handleCancel}>
            Discard and cancel
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div>
          <label className="field-label" htmlFor="w-class">Class</label>
          <select id="w-class" className="field" value={v.class_id} onChange={(e) => pickClass(e.target.value)} disabled={!!initial}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="w-num">Week number</label>
          <input id="w-num" className="field" inputMode="numeric" value={v.number} onChange={(e) => editV({ number: e.target.value })} required />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="w-title">Title</label>
          <input id="w-title" className="field" value={v.title} onChange={(e) => editV({ title: e.target.value })} placeholder="e.g. Security goals and password strength" required />
        </div>
        <div>
          <label className="field-label" htmlFor="w-open">Opens (Accra time)</label>
          <input id="w-open" type="datetime-local" className="field" value={v.opens_local} onChange={(e) => editV({ opens_local: e.target.value })} required />
        </div>
        <div>
          <label className="field-label" htmlFor="w-close">Closes (Accra time)</label>
          <input id="w-close" type="datetime-local" className="field" value={v.closes_local} onChange={(e) => editV({ closes_local: e.target.value })} required />
        </div>
      </div>

      <fieldset className="card p-5 space-y-5">
        <legend className="px-2 text-ink font-medium">Geofence</legend>
        <label className="flex items-center gap-3 min-h-[44px]">
          <input type="checkbox" className="h-5 w-5 accent-black" checked={v.geofence_enabled} onChange={(e) => editV({ geofence_enabled: e.target.checked })} />
          <span className="text-ink">Require students to be inside the area</span>
        </label>
        {!v.geofence_enabled && <p className="notice">Geofence is off: students can open and submit this week from anywhere (for example a take-home week).</p>}
        <GeofencePicker
          idPrefix="w"
          lat={v.center_lat}
          lng={v.center_lng}
          radius={v.radius_m}
          autoDetectOnMount={!initial}
          disabled={!v.geofence_enabled}
          onLocationChange={(center_lat, center_lng) => setV((x) => ({ ...x, center_lat, center_lng }))}
          onRadiusChange={(radius_m) => editV({ radius_m })}
        />
        <div className={v.geofence_enabled ? "max-w-xs" : "max-w-xs opacity-50"}>
          <label className="field-label" htmlFor="w-acc">Accuracy limit (m)</label>
          <input id="w-acc" className="field" inputMode="numeric" value={v.max_accuracy_m} onChange={(e) => editV({ max_accuracy_m: Number(e.target.value) || 0 })} disabled={!v.geofence_enabled} />
          <p className="text-sm mt-1">Readings less precise than this are rejected and the student is asked to try again.</p>
        </div>
      </fieldset>

      <label className="flex items-center gap-3 min-h-[44px]">
        <input type="checkbox" className="h-5 w-5 accent-black" checked={v.published} onChange={(e) => editV({ published: e.target.checked })} />
        <span className="text-ink">Published: students can open activities during the window</span>
      </label>

      {feedback}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending || !v.class_id} aria-busy={pending && savingMode === "primary"}>
          <Busy busy={pending && savingMode === "primary"} label={initial ? "Save week" : "Create week and link"} busyLabel="Saving…" arrow />
        </button>
        {!initial && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending || !v.class_id}
            aria-busy={pending && savingMode === "draft"}
            onClick={saveDraftToDb}
          >
            <Busy busy={pending && savingMode === "draft"} label="Save as draft" busyLabel="Saving draft…" />
          </button>
        )}
        {(!initial || cancelHref) && (
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={handleCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
