"use client";
// Crisp local SVG/PNG QR generator and lecture-hall fullscreen projector for week links.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { BrandMark } from "../ui";
import { CopyButton } from "./bits";

export type QrTarget = {
  id: string;
  url: string;
  className: string;
  weekNumber: number;
  weekTitle: string;
  joinCode?: string;
  statusLabel?: string;
};

/** Encodes a URL into a single-path SVG QR code synchronously with zero external requests. */
export function QrSvg({
  value,
  className = "h-full w-full",
  label = "QR code",
}: {
  value: string;
  className?: string;
  label?: string;
}) {
  const { size, path } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    const cmds: string[] = [];
    for (let y = 0; y < n; y++) {
      let x = 0;
      while (x < n) {
        if (qr.modules.get(y, x)) {
          const start = x;
          while (x < n && qr.modules.get(y, x)) x++;
          cmds.push(`M${start + 2} ${y + 2}h${x - start}v1h-${x - start}z`);
        } else {
          x++;
        }
      }
    }
    return { size: n + 4, path: cmds.join("") };
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#141518" />
    </svg>
  );
}

/** Downloads a crisp 1024x1024 PNG image of the QR code. */
export async function downloadQrPng(url: string, filename: string) {
  const dataUrl = await QRCode.toDataURL(url, {
    width: 1024,
    margin: 3,
    errorCorrectionLevel: "M",
    color: { dark: "#141518", light: "#ffffff" },
  });
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function qrFilename(item: QrTarget) {
  const slug = item.className
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${slug || "class"}-week-${item.weekNumber}-qr.png`;
}

export function QrIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="4.5" height="4.5" rx="0.8" />
      <rect x="9.5" y="2" width="4.5" height="4.5" rx="0.8" />
      <rect x="2" y="9.5" width="4.5" height="4.5" rx="0.8" />
      <path d="M9.5 9.5h2v2h-2zM12.5 12.5H14V14h-1.5zM12.5 9.5H14M9.5 13.5H11" />
    </svg>
  );
}

function FullscreenIcon({ active }: { active: boolean }) {
  return active ? (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2.5v7.5M5 7.5 8 10.5l3-3M2.5 12.5h11" />
    </svg>
  );
}

/** Full-viewport & native Fullscreen API projection overlay for a lecture hall. */
export function QrProjectorOverlay({
  items,
  initialId,
  open,
  onClose,
}: {
  items: QrTarget[];
  initialId?: string;
  open: boolean;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string>(initialId ?? items[0]?.id ?? "");
  const [showCode, setShowCode] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const active = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items.find((item) => item.id === initialId) ?? items[0] ?? null,
    [items, selectedId, initialId],
  );

  const closeAndExit = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    onClose();
  }, [onClose]);

  const toggleFullscreen = useCallback(async () => {
    const el = overlayRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (el.requestFullscreen) {
        await el.requestFullscreen();
      }
    } catch {
      /* Browser denied or unsupported — the fixed full-viewport overlay still fills the screen. */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Automatically request real browser fullscreen when projecting.
    const el = overlayRef.current;
    if (el?.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) {
        onClose();
      }
    };
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, [open, onClose]);

  if (!open || !active || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={`QR code for ${active.className}, Week ${active.weekNumber}`}
      className="fixed inset-0 z-50 flex flex-col bg-paper text-ink"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <BrandMark size="sm" />
          {items.length > 1 && (
            <select
              aria-label="Choose week to project"
              className="field min-h-[38px] w-auto py-1.5 text-sm"
              value={active.id}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {items.map((w) => (
                <option key={w.id} value={w.id}>
                  Week {w.weekNumber}: {w.weekTitle}
                  {w.statusLabel ? ` (${w.statusLabel})` : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {active.joinCode && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowCode((v) => !v)}
            >
              {showCode ? "Hide class code" : "Show class code"}
            </button>
          )}
          <CopyButton text={active.url} label="Copy link" />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => downloadQrPng(active.url, qrFilename(active))}
          >
            <DownloadIcon />
            PNG
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit browser fullscreen" : "Enter browser fullscreen"}
          >
            <FullscreenIcon active={isFullscreen} />
            {isFullscreen ? "Windowed" : "Fullscreen"}
          </button>
          <button
            type="button"
            className="btn btn-dark btn-sm"
            onClick={closeAndExit}
          >
            Close
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-6 py-6 text-center sm:gap-7">
        <div className="space-y-2 max-w-3xl">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="badge badge-blue text-sm">{active.className}</span>
            <span className="badge badge-neutral text-sm">Week {active.weekNumber}</span>
            {active.statusLabel && <span className="badge badge-ok text-sm">{active.statusLabel}</span>}
          </div>
          <h2 className="display text-3xl sm:text-5xl">{active.weekTitle}</h2>
          <p className="text-sm sm:text-base text-body">
            Scan with your phone camera to open this week&apos;s activity
          </p>
        </div>

        <div className="w-[min(48vh,74vw)] max-w-[440px] aspect-square rounded-3xl border-2 border-line bg-white p-4 shadow-lg sm:p-6">
          <QrSvg
            value={active.url}
            label={`QR code for ${active.className} Week ${active.weekNumber}`}
          />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 max-w-3xl">
          <code className="capsule max-w-full break-all px-4 py-2 text-xs text-ink sm:text-sm">
            {active.url}
          </code>
          {active.joinCode && showCode && (
            <div className="inline-flex items-center gap-2.5 rounded-full border border-line bg-surface-soft py-1.5 pl-4 pr-2">
              <span className="label">Class code</span>
              <span className="badge badge-gold px-3.5 py-1 text-base tracking-widest sm:text-lg">
                {active.joinCode}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** One-click button that opens the fullscreen QR projection overlay for a single week or a class's weeks. */
export function ProjectQrButton({
  item,
  items,
  initialId,
  label = "Project QR",
  variant = "secondary",
}: {
  item?: QrTarget;
  items?: QrTarget[];
  initialId?: string;
  label?: string;
  variant?: "primary" | "secondary" | "outline" | "dark";
}) {
  const [open, setOpen] = useState(false);
  const list = useMemo(() => (items && items.length > 0 ? items : item ? [item] : []), [items, item]);
  if (list.length === 0) return null;

  const btnClass =
    variant === "primary"
      ? "btn btn-primary btn-sm"
      : variant === "dark"
        ? "btn btn-dark btn-sm"
        : variant === "outline"
          ? "btn btn-outline-brand btn-sm"
          : "btn btn-secondary btn-sm";

  return (
    <>
      <button type="button" className={btnClass} onClick={() => setOpen(true)}>
        <QrIcon />
        {label}
      </button>
      {open && (
        <QrProjectorOverlay
          key={initialId ?? list[0].id}
          items={list}
          initialId={initialId ?? list[0].id}
          open={open}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** Inline scannable QR card used on the Week settings page alongside the week link. */
export function InlineWeekQr({ item }: { item: QrTarget }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative h-36 w-36 shrink-0 self-start rounded-2xl border border-line bg-white p-2.5 transition hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
        title="Click to project fullscreen"
        aria-label={`Project QR code fullscreen for ${item.className} Week ${item.weekNumber}`}
      >
        <QrSvg value={item.url} label={`QR code for ${item.weekTitle}`} />
      </button>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="space-y-1">
          <p className="text-ink font-semibold">Classroom QR code</p>
          <p className="text-sm text-body">
            Project full screen on the board so students can scan straight into Week {item.weekNumber}. Regenerating the link above automatically updates this QR code.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-dark btn-sm" onClick={() => setOpen(true)}>
            <FullscreenIcon active={false} />
            Project fullscreen
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => downloadQrPng(item.url, qrFilename(item))}
          >
            <DownloadIcon />
            Download PNG
          </button>
        </div>
      </div>
      {open && (
        <QrProjectorOverlay
          key={item.id}
          items={[item]}
          initialId={item.id}
          open={open}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
