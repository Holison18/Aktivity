"use client";
// Activity builder (FR-30): start from a template or choose one or more activity types
// (sorting, rating, calculation, short answer & fill-in), edit config and answer key,
// validate on the server, and preview exactly what a student receives.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { previewActivity, saveActivity } from "@/app/admin/actions";
import { useAction } from "./useAction";
import { RENDERERS } from "../activities/renderers";
import { Busy, Plus } from "../ui";
import type { Template } from "@/lib/activities/types";

type Initial = { type: string; title: string; instructions: string; max_attempts: number; config: unknown; answer_key: unknown } | null;

type PartDraft = {
  id: string;
  type: string;
  title: string;
  instructions: string;
  config: string;
  answer_key: string;
};

type CompositeInitialConfig = {
  parts?: { id: string; type: string; title: string; instructions?: string; config: unknown }[];
};

type CompositeInitialKey = {
  parts?: Record<string, unknown>;
};

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

function nextPartId(existing: PartDraft[]): string {
  const used = new Set(existing.map((p) => p.id));
  let n = existing.length + 1;
  while (used.has(`part_${n}`)) n++;
  return `part_${n}`;
}

function hydrateParts(initial: Initial, fallback: Template, types: { id: string; label: string }[]): PartDraft[] {
  const labelOf = (typeId: string) => types.find((t) => t.id === typeId)?.label ?? typeId;
  if (initial?.type === "composite") {
    const cfg = (initial.config ?? {}) as CompositeInitialConfig;
    const keyParts = ((initial.answer_key ?? {}) as CompositeInitialKey).parts ?? {};
    if (Array.isArray(cfg.parts) && cfg.parts.length > 0) {
      return cfg.parts.map((p, idx) => ({
        id: p.id || `part_${idx + 1}`,
        type: p.type,
        title: p.title || labelOf(p.type),
        instructions: p.instructions ?? "",
        config: pretty(p.config),
        answer_key: pretty(keyParts[p.id] ?? {}),
      }));
    }
  }
  const src = initial ?? fallback;
  return [
    {
      id: "part_1",
      type: src.type,
      title: labelOf(src.type),
      instructions: "",
      config: pretty(src.config),
      answer_key: pretty(src.answer_key),
    },
  ];
}

export default function ActivityBuilder({ weekId, position, initial, templates, blanks, types, hasAttempts }: {
  weekId: string; position: number; initial: Initial; templates: Template[]; blanks: Record<string, Template>;
  types: { id: string; label: string; description: string }[]; hasAttempts: boolean;
}) {
  const router = useRouter();
  const start = initial ?? { ...templates[0], max_attempts: 2 };
  const [title, setTitle] = useState(start.title);
  const [instructions, setInstructions] = useState(start.instructions);
  const [maxAttempts, setMaxAttempts] = useState(String(start.max_attempts));
  const [parts, setParts] = useState<PartDraft[]>(() => hydrateParts(initial, templates[0], types));
  const [previewIndex, setPreviewIndex] = useState("1234567");
  const [preview, setPreview] = useState<{ type: string; view: unknown; maxScore: number } | null>(null);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, unknown>>({});
  const [previewErr, setPreviewErr] = useState<{ message: string; issues?: string[] } | null>(null);
  const [previewing, startPreview] = useTransition();
  const { run, pending, feedback } = useAction();

  const labelOf = (typeId: string) => types.find((t) => t.id === typeId)?.label ?? typeId;
  const templatesForType = (typeId: string) => templates.filter((t) => t.type === typeId);
  const selectedTypes = new Set(parts.map((p) => p.type));
  const isComposite = parts.length > 1;

  function loadTemplate(t: Template) {
    setTitle(t.title);
    setInstructions(t.instructions);
    setParts([
      {
        id: "part_1",
        type: t.type,
        title: labelOf(t.type),
        instructions: "",
        config: pretty(t.config),
        answer_key: pretty(t.answer_key),
      },
    ]);
    setPreview(null);
    setPreviewErr(null);
  }

  function makePartFromBlank(typeId: string, existing: PartDraft[]): PartDraft {
    const b = blanks[typeId];
    return {
      id: nextPartId(existing),
      type: typeId,
      title: labelOf(typeId),
      instructions: b?.instructions ?? "",
      config: pretty(b?.config ?? {}),
      answer_key: pretty(b?.answer_key ?? {}),
    };
  }

  function toggleType(typeId: string) {
    if (hasAttempts) return;
    setPreview(null);
    setPreviewErr(null);
    setParts((prev) => {
      const hasIt = prev.some((p) => p.type === typeId);
      if (hasIt) {
        const remaining = prev.filter((p) => p.type !== typeId);
        // Keep at least one type selected.
        if (remaining.length === 0) return prev;
        return remaining;
      }
      return [...prev, makePartFromBlank(typeId, prev)];
    });
  }

  function addSection(typeId: string) {
    if (hasAttempts) return;
    setPreview(null);
    setPreviewErr(null);
    setParts((prev) => [...prev, makePartFromBlank(typeId, prev)]);
  }

  function updatePart(partId: string, patch: Partial<PartDraft>) {
    setParts((prev) => prev.map((p) => (p.id === partId ? { ...p, ...patch } : p)));
  }

  function applyTemplateToPart(partId: string, t: Template) {
    updatePart(partId, {
      title: t.title,
      instructions: t.instructions,
      config: pretty(t.config),
      answer_key: pretty(t.answer_key),
    });
    setPreview(null);
    setPreviewErr(null);
  }

  function movePart(idx: number, delta: -1 | 1) {
    const target = idx + delta;
    if (target < 0 || target >= parts.length) return;
    setPreview(null);
    setParts((prev) => {
      const next = prev.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function removePart(partId: string) {
    if (hasAttempts || parts.length <= 1) return;
    setPreview(null);
    setPreviewErr(null);
    setParts((prev) => prev.filter((p) => p.id !== partId));
  }

  function buildPayload(): { type: string; config: unknown; answer_key: unknown } | null {
    if (parts.length === 0) {
      setPreviewErr({ message: "Select at least one activity type." });
      return null;
    }

    if (parts.length === 1) {
      const only = parts[0];
      try {
        return {
          type: only.type,
          config: JSON.parse(only.config),
          answer_key: JSON.parse(only.answer_key),
        };
      } catch (e) {
        setPreviewErr({ message: `The JSON is not valid: ${(e as Error).message}` });
        return null;
      }
    }

    const parsedParts: { id: string; type: string; title: string; instructions: string; config: unknown }[] = [];
    const keyParts: Record<string, unknown> = {};
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      let parsedCfg: unknown;
      let parsedKey: unknown;
      try {
        parsedCfg = JSON.parse(p.config);
      } catch (e) {
        setPreviewErr({ message: `Part ${i + 1} (${p.title || labelOf(p.type)}) configuration JSON is not valid: ${(e as Error).message}` });
        return null;
      }
      try {
        parsedKey = JSON.parse(p.answer_key);
      } catch (e) {
        setPreviewErr({ message: `Part ${i + 1} (${p.title || labelOf(p.type)}) answer key JSON is not valid: ${(e as Error).message}` });
        return null;
      }
      parsedParts.push({
        id: p.id,
        type: p.type,
        title: p.title.trim() || labelOf(p.type),
        instructions: p.instructions,
        config: parsedCfg,
      });
      keyParts[p.id] = parsedKey;
    }

    return {
      type: "composite",
      config: { parts: parsedParts },
      answer_key: { parts: keyParts },
    };
  }

  function doPreview() {
    setPreviewErr(null);
    const payload = buildPayload();
    if (!payload) return;
    startPreview(async () => {
      const r = await previewActivity({ ...payload, index: previewIndex });
      if (r.ok) {
        setPreview({ type: payload.type, view: r.view, maxScore: r.maxScore });
        setPreviewAnswers({});
      } else {
        setPreview(null);
        setPreviewErr({ message: r.error, issues: r.issues });
      }
    });
  }

  const R = preview ? RENDERERS[preview.type] : null;

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <div className="space-y-6">
        {hasAttempts && <p className="notice">Students have already submitted this activity. You can fix wording, but its types, sections, and maximum score are locked.</p>}

        {!hasAttempts && (
          <div className="card p-5 space-y-3">
            <p className="text-ink font-medium">Start from a pre-built template</p>
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <button key={t.id} type="button" className="chip" onClick={() => loadTemplate(t)}>
                  {t.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="card p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-ink font-medium">Activity types</p>
              <p className="text-sm">Select one type, or combine multiple types in this activity.</p>
            </div>
            <span className="badge badge-blue tabular-nums">
              {parts.length} {parts.length === 1 ? "section" : "sections"}
            </span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2" role="group" aria-label="Activity types">
            {types.map((t) => {
              const active = selectedTypes.has(t.id);
              const count = parts.filter((p) => p.type === t.id).length;
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={hasAttempts}
                  aria-pressed={active}
                  onClick={() => toggleType(t.id)}
                  className={`rounded-2xl border p-3.5 text-left transition ${
                    active
                      ? "border-brand bg-brand-soft text-ink"
                      : "border-line bg-surface-soft text-body hover:border-brand/50"
                  } ${hasAttempts ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-ink">{t.label}</span>
                    <span
                      aria-hidden="true"
                      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                        active ? "bg-brand text-white" : "border border-line bg-paper text-muted"
                      }`}
                    >
                      {active ? (count > 1 ? count : "✓") : "+"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-snug">{t.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <div>
            <label className="field-label" htmlFor="a-title">Activity title</label>
            <input id="a-title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="a-att">Attempts allowed</label>
            <input id="a-att" className="field" inputMode="numeric" value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="a-ins">Overall instructions</label>
          <textarea id="a-ins" className="field" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </div>

        {!isComposite && parts[0] ? (
          <>
            <div>
              <label className="field-label" htmlFor="a-config">Configuration (sent to students)</label>
              <textarea
                id="a-config"
                className="field min-h-[18rem] font-mono text-[0.8rem] leading-relaxed"
                spellCheck={false}
                value={parts[0].config}
                onChange={(e) => updatePart(parts[0].id, { config: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="a-key">Answer key (stays on the server, never sent to students)</label>
              <textarea
                id="a-key"
                className="field min-h-[14rem] font-mono text-[0.8rem] leading-relaxed"
                spellCheck={false}
                value={parts[0].answer_key}
                onChange={(e) => updatePart(parts[0].id, { answer_key: e.target.value })}
              />
            </div>
          </>
        ) : (
          <div className="space-y-4">
            {parts.map((part, idx) => {
              const partTemplates = templatesForType(part.type);
              return (
                <section key={part.id} className="card p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                    <div className="flex items-center gap-2">
                      <span className="label">Part {idx + 1}</span>
                      <span className="badge badge-blue">{labelOf(part.type)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {!hasAttempts && partTemplates.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => applyTemplateToPart(part.id, t)}
                        >
                          Load sample
                        </button>
                      ))}
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={idx === 0}
                        aria-label={`Move part ${idx + 1} up`}
                        onClick={() => movePart(idx, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={idx === parts.length - 1}
                        aria-label={`Move part ${idx + 1} down`}
                        onClick={() => movePart(idx, 1)}
                      >
                        ↓
                      </button>
                      {!hasAttempts && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => removePart(part.id)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="field-label" htmlFor={`p-title-${part.id}`}>Section title</label>
                    <input
                      id={`p-title-${part.id}`}
                      className="field"
                      value={part.title}
                      onChange={(e) => updatePart(part.id, { title: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor={`p-ins-${part.id}`}>Section instructions (optional)</label>
                    <textarea
                      id={`p-ins-${part.id}`}
                      className="field min-h-[76px]"
                      value={part.instructions}
                      onChange={(e) => updatePart(part.id, { instructions: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor={`p-cfg-${part.id}`}>Configuration (sent to students)</label>
                    <textarea
                      id={`p-cfg-${part.id}`}
                      className="field min-h-[14rem] font-mono text-[0.8rem] leading-relaxed"
                      spellCheck={false}
                      value={part.config}
                      onChange={(e) => updatePart(part.id, { config: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor={`p-key-${part.id}`}>Answer key (stays on the server)</label>
                    <textarea
                      id={`p-key-${part.id}`}
                      className="field min-h-[11rem] font-mono text-[0.8rem] leading-relaxed"
                      spellCheck={false}
                      value={part.answer_key}
                      onChange={(e) => updatePart(part.id, { answer_key: e.target.value })}
                    />
                  </div>
                </section>
              );
            })}

            {!hasAttempts && (
              <div className="surface-soft p-4 space-y-2.5">
                <p className="label">Add another section</p>
                <div className="flex flex-wrap gap-2">
                  {types
                    .filter((t) => selectedTypes.has(t.id))
                    .map((t) => (
                      <button key={t.id} type="button" className="btn btn-secondary btn-sm" onClick={() => addSection(t.id)}>
                        <Plus /> {t.label}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {feedback}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-secondary" onClick={doPreview} disabled={previewing} aria-busy={previewing}>
            <Busy busy={previewing} label="Validate and preview" busyLabel="Checking…" />
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            aria-busy={pending}
            onClick={() => {
              setPreviewErr(null);
              const payload = buildPayload();
              if (!payload) return;
              run(
                () => saveActivity({ week_id: weekId, position, title, instructions, max_attempts: Number(maxAttempts), ...payload }),
                { onOk: () => router.push(`/admin/weeks/${weekId}`) },
              );
            }}
          >
            <Busy busy={pending} label="Save activity" busyLabel="Saving…" arrow />
          </button>
          <Link href={`/admin/weeks/${weekId}`} className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </div>

      <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="label">Preview as student</h2>
          <div className="flex items-end gap-2">
            <div>
              <label className="field-label text-xs" htmlFor="p-idx">Preview index number</label>
              <input id="p-idx" className="field min-h-[40px] w-36 py-1" value={previewIndex} onChange={(e) => setPreviewIndex(e.target.value)} />
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={doPreview}>Refresh</button>
          </div>
        </div>
        {previewErr && (
          <div className="notice notice-bad" role="alert">
            <p>{previewErr.message}</p>
            {previewErr.issues && <ul className="mt-2 list-disc pl-5 text-sm">{previewErr.issues.slice(0, 20).map((i) => <li key={i}>{i}</li>)}</ul>}
          </div>
        )}
        {!preview && !previewErr && <p className="notice">Press “Validate and preview” to see what students will get.</p>}
        {preview && R && (
          <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-3xl border border-line bg-paper p-5">
            <p className="label">Max score {preview.maxScore}</p>
            <h3 className="display text-3xl mt-2 mb-3">{title}</h3>
            <p className="mb-6 whitespace-pre-line">{instructions}</p>
            <R.Component view={preview.view} value={previewAnswers} onChange={setPreviewAnswers} />
          </div>
        )}
      </div>
    </div>
  );
}
