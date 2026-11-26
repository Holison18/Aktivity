"use client";
import { useEffect, useId, useState, type ReactNode } from "react";
import { serverNow } from "@/lib/client/runtime";

export function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" className={`arrow ${className}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

export function ArrowUpRight({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="15" height="15" className={`arrow-ur ${className}`} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
    </svg>
  );
}

export function Plus({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3.25v9.5M3.25 8h9.5" />
    </svg>
  );
}

export function BrandIcon({ size = 36, className = "" }: { size?: number; className?: string }) {
  const gradId = useId();
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 36 36"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      fill="none"
    >
      <defs>
        <linearGradient id={gradId} x1="4" y1="2" x2="32" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2b88ff" />
          <stop offset="100%" stopColor="#1565e6" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="10" fill={`url(#${gradId})`} />
      <rect x="0.75" y="0.75" width="34.5" height="34.5" rx="9.25" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="1.5" />
      <path
        d="M9.5 26.5 18 9l8.5 17"
        stroke="#ffffff"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="18" cy="23.2" r="2.7" fill="#f7dc6f" />
    </svg>
  );
}

export function BrandMark({
  name = "Aktivity",
  size = "md",
  inverted = false,
}: {
  name?: string;
  size?: "sm" | "md";
  inverted?: boolean;
}) {
  const iconSize = size === "sm" ? 26 : 34;
  const textClass = size === "sm" ? "text-base" : "text-lg";
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandIcon size={iconSize} className="shadow-xs rounded-[10px]" />
      <span className={`display ${textClass} tracking-tight ${inverted ? "!text-white" : ""}`}>{name}</span>
    </span>
  );
}

/** Big number in the display face with a small uppercase grey label under it (UI-06). */
export function Stat({ value, label, size = "lg" }: { value: ReactNode; label: string; size?: "md" | "lg" | "xl" }) {
  const cls = size === "xl" ? "text-7xl sm:text-8xl" : size === "lg" ? "text-5xl" : "text-3xl";
  return (
    <div>
      <div className={`display tabular-nums ${cls}`}>{value}</div>
      <div className="label mt-2">{label}</div>
    </div>
  );
}

export function Mark({ ok, okText = "Correct", badText = "Incorrect" }: { ok: boolean; okText?: string; badText?: string }) {
  return <span className={ok ? "mark-ok" : "mark-bad"}>{ok ? okText : badText}</span>;
}

function fmtLeft(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

/** Countdown driven by the server clock offset (NF-12). Calls onZero once when it reaches zero. */
export function Countdown({ target, label, size = "lg", onZero }: { target: number; label: string; size?: "md" | "lg" | "xl"; onZero?: () => void }) {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = target - now;
  useEffect(() => {
    if (left <= 0 && onZero) onZero();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left <= 0]);
  return (
    <div role="timer" aria-label={`${label}: ${fmtLeft(left)}`}>
      <Stat value={fmtLeft(left)} label={label} size={size} />
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-3 text-ink" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Two labels in one place: the element keeps the width of the longer one and the change
 * crossfades instead of jumping. Only the visible label is read out.
 */
export function Swap({ on, off, onLabel }: { on: boolean; off: ReactNode; onLabel: ReactNode }) {
  return (
    <span className="swap">
      <span data-on={!on} aria-hidden={on}>{off}</span>
      <span data-on={on} aria-hidden={!on}>{onLabel}</span>
    </span>
  );
}

/** Button label that turns into a spinner and a short busy text while work is running. */
export function Busy({ busy, label, busyLabel, arrow = false }: { busy: boolean; label: ReactNode; busyLabel: string; arrow?: boolean }) {
  return (
    <Swap
      on={busy}
      off={<>{label}{arrow && <Arrow />}</>}
      onLabel={<><span className="spinner" aria-hidden="true" />{busyLabel}</>}
    />
  );
}

/** Hairline progress bar; animates with scaleX so it never causes layout. */
export function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  const f = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      <span style={{ transform: `scaleX(${f})` }} />
    </div>
  );
}
