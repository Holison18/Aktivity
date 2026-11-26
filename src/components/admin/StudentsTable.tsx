"use client";
// Manage registered students: search, filter by class, add one or bulk import,
// correct index/name, remove a registration, or merge duplicates (FR-28).
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { addStudent, correctStudent, deleteStudent, importStudents, mergeStudents } from "@/app/admin/actions";
import { useAction } from "./useAction";
import { Busy } from "../ui";

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Accra" });
const PAGE_SIZE = 50;

export type StudentRow = {
  class_id?: string;
  class_name?: string;
  index_number: string;
  name: string;
  registered_at: string;
  attempts: number;
};

export type ClassChoice = { id: string; name: string };

export default function StudentsTable({
  classId,
  classes,
  students,
}: {
  classId?: string;
  classes?: ClassChoice[];
  students: StudentRow[];
}) {
  const showClassCol = !classId;
  const [classFilter, setClassFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);
  const [page, setPage] = useState(1);
  const [panel, setPanel] = useState<"none" | "add" | "import">("none");

  const defaultTargetClass = classId ?? (classFilter !== "all" ? classFilter : classes?.[0]?.id ?? "");
  const [targetClass, setTargetClass] = useState(defaultTargetClass);
  const effectiveTargetClass = classId ?? (classes?.some((c) => c.id === targetClass) ? targetClass : classes?.[0]?.id ?? "");

  const [newStudent, setNewStudent] = useState({ indexNumber: "", name: "" });
  const [importText, setImportText] = useState("");
  const [importReport, setImportReport] = useState<{ added: number; skipped: number; issues: string[] } | null>(null);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [form, setForm] = useState({ index: "", name: "" });
  const [merge, setMerge] = useState({ keep: "", drop: "" });
  const [confirmMerge, setConfirmMerge] = useState(false);
  const { run, pending, feedback } = useAction();

  const rowKey = (s: StudentRow) => `${s.class_id ?? classId ?? ""}:${s.index_number}`;
  const rowClassId = (s: StudentRow) => s.class_id ?? classId ?? "";

  const scoped = useMemo(() => {
    if (!showClassCol || classFilter === "all") return students;
    return students.filter((s) => s.class_id === classFilter);
  }, [showClassCol, classFilter, students]);

  const list = useMemo(() => {
    const s = deferredQ.trim().toLowerCase();
    return s
      ? scoped.filter(
          (x) =>
            x.index_number.toLowerCase().includes(s) ||
            x.name.toLowerCase().includes(s) ||
            (x.class_name?.toLowerCase().includes(s) ?? false),
        )
      : scoped;
  }, [deferredQ, scoped]);

  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = useMemo(
    () => list.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [list, safePage],
  );

  // Likely duplicates: same name under two index numbers within the same class.
  const dupNames = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of students) {
      const k = `${s.class_id ?? classId ?? ""}:${s.name.toLowerCase()}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return new Set([...m].filter(([, n]) => n > 1).map(([k]) => k));
  }, [students, classId]);

  const mergeClassId = classId ?? (classFilter !== "all" ? classFilter : classes?.length === 1 ? classes[0].id : null);
  const mergeCandidates = useMemo(
    () => (mergeClassId ? students.filter((s) => (s.class_id ?? classId) === mergeClassId) : []),
    [mergeClassId, students, classId],
  );

  const canAdd = Boolean(effectiveTargetClass);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[14rem] flex-1">
          <label className="field-label" htmlFor="s-q">Search students</label>
          <input id="s-q" className="field" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Index number or name" />
        </div>
        {showClassCol && classes && classes.length > 0 && (
          <div className="min-w-[13rem]">
            <label className="field-label" htmlFor="s-cls">Class</label>
            <select
              id="s-cls"
              className="field"
              value={classFilter}
              onChange={(e) => {
                const next = e.target.value;
                setClassFilter(next);
                setPage(1);
                if (next !== "all") setTargetClass(next);
                setMerge({ keep: "", drop: "" });
                setConfirmMerge(false);
              }}
            >
              <option value="all">All classes ({students.length})</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2.5 pb-0.5">
          {canAdd && (
            <>
              <button
                type="button"
                className={panel === "add" ? "btn btn-primary btn-sm" : "btn btn-outline-brand btn-sm"}
                onClick={() => { setPanel(panel === "add" ? "none" : "add"); setImportReport(null); }}
              >
                {panel === "add" ? "Close" : "Add student"}
              </button>
              <button
                type="button"
                className={panel === "import" ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
                onClick={() => { setPanel(panel === "import" ? "none" : "import"); setImportReport(null); }}
              >
                {panel === "import" ? "Close" : "Import list"}
              </button>
            </>
          )}
        </div>
      </div>

      <p className="text-sm">
        <strong>{list.length}</strong> {list.length === 1 ? "student" : "students"}
        {list.length !== scoped.length ? ` matching (of ${scoped.length})` : " registered"}
      </p>

      {panel === "add" && canAdd && (
        <form
          className="card p-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => addStudent({ classId: effectiveTargetClass, indexNumber: newStudent.indexNumber, name: newStudent.name }),
              {
                success: `Added ${newStudent.name.trim()}.`,
                onOk: () => setNewStudent({ indexNumber: "", name: "" }),
              },
            );
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-ink font-medium">Add a student</h3>
            <button type="button" className="btn-link text-sm" onClick={() => setPanel("none")}>Cancel</button>
          </div>
          <div className={`grid gap-4 ${showClassCol ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {showClassCol && classes && (
              <div>
                <label className="field-label" htmlFor="add-cls">Class</label>
                <select id="add-cls" className="field" value={effectiveTargetClass} onChange={(e) => setTargetClass(e.target.value)} required>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="field-label" htmlFor="add-idx">Index number</label>
              <input
                id="add-idx"
                className="field"
                value={newStudent.indexNumber}
                onChange={(e) => setNewStudent({ ...newStudent, indexNumber: e.target.value })}
                placeholder="e.g. 1234567"
                required
              />
            </div>
            <div>
              <label className="field-label" htmlFor="add-name">Full name</label>
              <input
                id="add-name"
                className="field"
                value={newStudent.name}
                onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                placeholder="e.g. Ama Mensah"
                required
              />
            </div>
          </div>
          <button className="btn btn-primary btn-sm" disabled={pending} aria-busy={pending}>
            <Busy busy={pending} label="Add student" busyLabel="Adding…" />
          </button>
        </form>
      )}

      {panel === "import" && canAdd && (
        <form
          className="card p-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setImportReport(null);
            run(
              () => importStudents({ classId: effectiveTargetClass, text: importText }),
              {
                onOk: (r) => {
                  setImportReport({ added: r.added, skipped: r.skipped, issues: r.issues });
                  if (r.added > 0 && r.issues.length === 0) setImportText("");
                },
              },
            );
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-ink font-medium">Bulk import roster</h3>
            <button type="button" className="btn-link text-sm" onClick={() => setPanel("none")}>Cancel</button>
          </div>
          <p className="text-sm">
            Paste one student per line using a comma, tab, or space between index number and full name (for example <code>1234567, Ama Mensah</code>). Already-registered students are skipped automatically.
          </p>
          {showClassCol && classes && (
            <div className="max-w-sm">
              <label className="field-label" htmlFor="imp-cls">Class</label>
              <select id="imp-cls" className="field" value={effectiveTargetClass} onChange={(e) => setTargetClass(e.target.value)} required>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="field-label" htmlFor="imp-text">Students list</label>
            <textarea
              id="imp-text"
              className="field font-mono text-sm"
              rows={6}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={"1234567, Ama Mensah\n2345678, Kwame Boateng"}
              required
            />
          </div>
          <button className="btn btn-primary btn-sm" disabled={pending || !importText.trim()} aria-busy={pending}>
            <Busy busy={pending} label="Import students" busyLabel="Importing…" />
          </button>
          {importReport && (
            <div className={importReport.issues.length > 0 ? "notice space-y-2" : "notice"} role="status">
              <p>
                <strong>{importReport.added}</strong> added
                {importReport.skipped > 0 ? ` · ${importReport.skipped} already in class (skipped)` : ""}
                {importReport.issues.length > 0 ? ` · ${importReport.issues.length} issue${importReport.issues.length === 1 ? "" : "s"}` : ""}.
              </p>
              {importReport.issues.length > 0 && (
                <ul className="list-disc pl-5 text-sm">
                  {importReport.issues.slice(0, 20).map((issue, idx) => <li key={idx}>{issue}</li>)}
                </ul>
              )}
            </div>
          )}
        </form>
      )}

      {feedback}

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Index number</th>
              <th>Name</th>
              {showClassCol && <th>Class</th>}
              <th>Registered</th>
              <th>Attempts</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => {
              const key = rowKey(s);
              const cid = rowClassId(s);
              const isEditing = editingKey === key;
              const isDeleting = confirmDeleteKey === key;
              return (
                <tr key={key}>
                  {isEditing ? (
                    <>
                      <td><input aria-label="Index number" className="field min-h-[40px] py-1" value={form.index} onChange={(e) => setForm({ ...form, index: e.target.value })} /></td>
                      <td><input aria-label="Name" className="field min-h-[40px] py-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></td>
                      {showClassCol && <td className="text-body">{s.class_name}</td>}
                      <td colSpan={2} />
                      <td className="whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={pending}
                            onClick={() => run(() => correctStudent({ classId: cid, oldIndex: s.index_number, newIndex: form.index, newName: form.name }), { success: "Student updated.", onOk: () => setEditingKey(null) })}
                          >
                            Save
                          </button>
                          <button className="btn-link text-sm" onClick={() => setEditingKey(null)}>Cancel</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="tabular-nums">{s.index_number}</td>
                      <td>
                        {s.name}
                        {dupNames.has(`${cid}:${s.name.toLowerCase()}`) && <span className="ml-2 capsule px-2 py-0.5 text-xs">same name twice</span>}
                      </td>
                      {showClassCol && (
                        <td>
                          {s.class_id ? (
                            <Link href={`/admin/classes/${s.class_id}`} className="underline underline-offset-2">{s.class_name}</Link>
                          ) : (
                            s.class_name ?? "–"
                          )}
                        </td>
                      )}
                      <td className="text-body">{DATE_FMT.format(new Date(s.registered_at))}</td>
                      <td className="tabular-nums">{s.attempts}</td>
                      <td className="whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {isDeleting ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                disabled={pending}
                                onClick={() =>
                                  run(() => deleteStudent({ classId: cid, indexNumber: s.index_number }), {
                                    success: `Removed ${s.index_number} (${s.name}).`,
                                    onOk: () => setConfirmDeleteKey(null),
                                  })
                                }
                              >
                                {pending ? "Removing…" : "Yes, remove"}
                              </button>
                              <button type="button" className="btn-link text-sm" disabled={pending} onClick={() => setConfirmDeleteKey(null)}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  setConfirmDeleteKey(null);
                                  setEditingKey(key);
                                  setForm({ index: s.index_number, name: s.name });
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => {
                                  setEditingKey(null);
                                  setConfirmDeleteKey(key);
                                }}
                              >
                                Remove
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={showClassCol ? 6 : 5} className="text-body">
                  {students.length === 0 ? "No students registered yet. Use Add student or Import list above." : "No students match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-muted tabular-nums">
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, list.length)} of {list.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="px-2 tabular-nums text-ink font-medium">
              Page {safePage} / {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {mergeClassId && mergeCandidates.length >= 2 && (
        <details className="card p-5">
          <summary className="cursor-pointer text-ink font-medium">Merge two registrations</summary>
          <p className="mt-3 text-sm">Use this when one student registered twice (for example a mistyped index number). Attempts and log entries move to the record you keep; the other record is removed.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            {(["keep", "drop"] as const).map((k) => (
              <div key={k}>
                <label className="field-label" htmlFor={`m-${k}`}>{k === "keep" ? "Keep this record" : "Merge and remove this record"}</label>
                <select id={`m-${k}`} className="field" value={merge[k]} onChange={(e) => { setMerge({ ...merge, [k]: e.target.value }); setConfirmMerge(false); }}>
                  <option value="">Choose…</option>
                  {mergeCandidates.map((s) => <option key={s.index_number} value={s.index_number}>{s.index_number} · {s.name}</option>)}
                </select>
              </div>
            ))}
            <button
              className="btn btn-primary"
              disabled={pending || !merge.keep || !merge.drop || merge.keep === merge.drop || confirmMerge}
              onClick={() => setConfirmMerge(true)}
            >
              Merge
            </button>
          </div>
          {confirmMerge && (
            <div className="mt-4 space-y-3 notice" role="alert">
              <p>Move every attempt and log entry from <strong>{merge.drop}</strong> to <strong>{merge.keep}</strong>, then remove <strong>{merge.drop}</strong>? This cannot be undone.</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="btn btn-danger btn-sm"
                  disabled={pending}
                  aria-busy={pending}
                  onClick={() => run(() => mergeStudents({ classId: mergeClassId, ...merge }), { success: `Merged ${merge.drop} into ${merge.keep}.`, onOk: () => { setMerge({ keep: "", drop: "" }); setConfirmMerge(false); } })}
                >
                  <Busy busy={pending} label={`Yes, merge and remove ${merge.drop}`} busyLabel="Merging…" />
                </button>
                <button className="btn-link text-sm" onClick={() => setConfirmMerge(false)}>Cancel</button>
              </div>
            </div>
          )}
        </details>
      )}
    </div>
  );
}
