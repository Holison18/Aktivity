"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { closeWeekNow, deleteActivity, deleteClass, deleteWeek, duplicateWeek, extendWeek, regenerateLink } from "@/app/admin/actions";
import { useAction } from "./useAction";
import { CopyButton } from "./bits";
import { InlineWeekQr, type QrTarget } from "./QrProjector";

/** Week link with Copy, inline QR code + fullscreen projector, and Regenerate (FR-29). */
export function WeekLink({ weekId, url, qr }: { weekId: string; url: string; qr?: QrTarget }) {
  const { run, pending, feedback } = useAction();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <code className="capsule min-w-0 flex-1 truncate px-4 py-2.5 text-sm text-ink">{url}</code>
        <CopyButton text={url} />
        {confirm ? (
          <>
            <button className="btn btn-danger btn-sm" disabled={pending} onClick={() => run(() => regenerateLink(weekId), { success: "New link created. The old link no longer works.", onOk: () => setConfirm(false) })}>Yes, replace link</button>
            <button className="btn-link text-sm" onClick={() => setConfirm(false)}>Cancel</button>
          </>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => setConfirm(true)}>Regenerate</button>
        )}
      </div>
      {feedback}
      {qr && <InlineWeekQr item={qr} />}
    </div>
  );
}

/** Extend +10 min and Close now (FR-10). */
export function WindowControls({ weekId, compact = false }: { weekId: string; compact?: boolean }) {
  const { run, pending, feedback } = useAction();
  const [confirmClose, setConfirmClose] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => extendWeek(weekId), { success: compact ? undefined : "Closing time extended by 10 minutes." })}>Extend +10 min</button>
        {confirmClose ? (
          <>
            <button className="btn btn-danger btn-sm" disabled={pending} onClick={() => run(() => closeWeekNow(weekId), { success: "Week closed. Open attempts have 20 seconds to arrive.", onOk: () => setConfirmClose(false) })}>Yes, close now</button>
            <button className="btn-link text-sm" onClick={() => setConfirmClose(false)}>Cancel</button>
          </>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => setConfirmClose(true)}>Close now</button>
        )}
      </div>
      {feedback}
    </div>
  );
}

export function WeekAdminActions({ weekId, classId }: { weekId: string; classId: string }) {
  const router = useRouter();
  const { run, pending, feedback } = useAction();
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => duplicateWeek(weekId), { onOk: (r) => router.push(`/admin/weeks/${r.id}`) })}>Duplicate as next week</button>
        {confirmDelete ? (
          <>
            <button
              className="btn btn-danger btn-sm"
              disabled={pending}
              onClick={() => run(() => deleteWeek(weekId), { onOk: () => router.push(`/admin/classes/${classId}`), refresh: false })}
            >
              {pending ? "Deleting…" : "Yes, delete week"}
            </button>
            <button className="btn-link text-sm" disabled={pending} onClick={() => setConfirmDelete(false)}>Cancel</button>
          </>
        ) : (
          <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>Delete week</button>
        )}
      </div>
      {confirmDelete && (
        <p className="notice notice-bad text-sm">
          This permanently deletes the week along with its activities, submitted attempts, and access logs. Download Excel first if you need a copy.
        </p>
      )}
      {feedback}
    </div>
  );
}

export function DeleteWeekButton({ weekId, label = "Delete" }: { weekId: string; label?: string }) {
  const { run, pending, feedback } = useAction();
  const [confirm, setConfirm] = useState(false);
  return (
    <span className="inline-flex flex-col items-end gap-1.5">
      <span className="inline-flex items-center gap-2">
        {confirm ? (
          <>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={pending}
              onClick={() => run(() => deleteWeek(weekId), { onOk: () => setConfirm(false) })}
            >
              {pending ? "Deleting…" : "Yes, delete"}
            </button>
            <button type="button" className="btn-link text-sm" disabled={pending} onClick={() => setConfirm(false)}>Cancel</button>
          </>
        ) : (
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirm(true)}>{label}</button>
        )}
      </span>
      {feedback}
    </span>
  );
}

export function DeleteClassButton({
  classId,
  classNameLabel,
  redirectTo,
  compact = false,
}: {
  classId: string;
  classNameLabel?: string;
  redirectTo?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const { run, pending, feedback } = useAction();
  const [confirm, setConfirm] = useState(false);

  const onDelete = () =>
    run(() => deleteClass(classId), {
      onOk: () => {
        setConfirm(false);
        if (redirectTo) router.push(redirectTo);
      },
      refresh: !redirectTo,
    });

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex flex-wrap items-center gap-2">
        {confirm ? (
          <>
            <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={onDelete}>
              {pending ? "Deleting…" : compact ? "Yes, delete" : "Yes, delete class"}
            </button>
            <button type="button" className="btn-link text-sm" disabled={pending} onClick={() => setConfirm(false)}>Cancel</button>
          </>
        ) : (
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirm(true)}>
            {compact ? "Delete" : "Delete class"}
          </button>
        )}
      </div>
      {confirm && !compact && (
        <p className="notice notice-bad text-sm">
          This permanently deletes {classNameLabel ? <strong>{classNameLabel}</strong> : "this class"} along with all of its weeks, activities, registered students, submitted attempts, and access logs. Download Excel first if you need a copy.
        </p>
      )}
      {feedback}
    </div>
  );
}

export function DeleteActivityButton({ activityId }: { activityId: string }) {
  const { run, pending, feedback } = useAction();
  const [confirm, setConfirm] = useState(false);
  return (
    <span className="inline-flex flex-col gap-2">
      {confirm ? (
        <span className="flex gap-2">
          <button className="btn btn-danger btn-sm" disabled={pending} onClick={() => run(() => deleteActivity(activityId))}>Yes, remove</button>
          <button className="btn-link text-sm" onClick={() => setConfirm(false)}>Cancel</button>
        </span>
      ) : (
        <button className="btn btn-secondary btn-sm" onClick={() => setConfirm(true)}>Remove</button>
      )}
      {feedback}
    </span>
  );
}
