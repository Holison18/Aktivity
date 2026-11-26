"use client";
// Keeps large edit forms (such as Class settings or Schedule & geofence) collapsed on overview
// pages until the admin explicitly opens them, avoiding visual clutter and eager map loads.
import { useState, type ReactNode } from "react";

export default function CollapsibleSection({
  title,
  summary,
  actionLabel = "Edit",
  closeLabel = "Hide",
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: string;
  actionLabel?: string;
  closeLabel?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="card p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-ink text-xl font-medium">{title}</h2>
          {summary && <p className="text-sm">{summary}</p>}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm shrink-0"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? closeLabel : actionLabel}
        </button>
      </div>
      {open && <div className="border-t border-line pt-5">{children}</div>}
    </section>
  );
}
