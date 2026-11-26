"use client";
// Student renderers, one per activity type (NF-13). They receive only the public view (no answer key)
// and produce an answers object matching the type's answers schema on the server.
// Interaction is tap/keyboard based: every choice is a button, so no drag-and-drop is needed (UI-14).
import { useId, type ReactNode } from "react";

type Opt = { id: string; label: string };

export function ChoiceGroup({ label, options, value, onChange, size = "md" }: { label: string; options: Opt[]; value?: string; onChange: (id: string) => void; size?: "sm" | "md" }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`chip ${size === "sm" ? "px-3" : ""}`}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Item({ n, title, children }: { n: number; title: ReactNode; children: ReactNode }) {
  return (
    <li className="card p-5 sm:p-6">
      <div className="flex gap-3">
        <span className="label pt-1 tabular-nums">{String(n).padStart(2, "0")}</span>
        <div className="flex-1 space-y-4">
          <p className="text-ink font-normal text-[1.02rem] leading-snug">{title}</p>
          {children}
        </div>
      </div>
    </li>
  );
}

// ------------------------------------------------------------------- Sorting
type SortingView = {
  categories: { id: string; name: string; description: string }[];
  judge: { prompt: string; options: { id: string; label: string }[] } | null;
  cards: { id: string; text: string }[];
};
type SortingValue = { placements?: Record<string, { category?: string; judge?: string }> };

function Sorting({ view, value, onChange }: RendererProps<SortingView, SortingValue>) {
  const placements = value.placements ?? {};
  const set = (id: string, patch: { category?: string; judge?: string }) =>
    onChange({ ...value, placements: { ...placements, [id]: { ...placements[id], ...patch } } });
  return (
    <div className="space-y-6">
      <dl className="grid gap-2 sm:grid-cols-3">
        {view.categories.map((c) => (
          <div key={c.id} className="capsule rounded-2xl px-4 py-3">
            <dt className="text-ink font-medium">{c.name}</dt>
            {c.description && <dd className="text-sm">{c.description}</dd>}
          </div>
        ))}
      </dl>
      <ol className="space-y-3">
        {view.cards.map((card, i) => (
          <Item key={card.id} n={i + 1} title={card.text}>
            <ChoiceGroup label={`Category for: ${card.text}`} options={view.categories.map((c) => ({ id: c.id, label: c.name }))} value={placements[card.id]?.category} onChange={(category) => set(card.id, { category })} />
            {view.judge && (
              <div className="space-y-2">
                <p className="label">{view.judge.prompt}</p>
                <ChoiceGroup label={`${view.judge.prompt} ${card.text}`} options={view.judge.options} value={placements[card.id]?.judge} onChange={(judge) => set(card.id, { judge })} />
              </div>
            )}
          </Item>
        ))}
      </ol>
    </div>
  );
}

function sortingProgress(view: SortingView, value: SortingValue) {
  const p = value.placements ?? {};
  const done = view.cards.filter((c) => p[c.id]?.category && (!view.judge || p[c.id]?.judge)).length;
  return { done, total: view.cards.length };
}

// -------------------------------------------------------------------- Rating
type RatingView = {
  items: { id: string; title: string; question: string; action: string }[];
  habitOptions: string[];
  scaleMax: number;
  likelihoodLabel: string;
  impactLabel: string;
  choicePrompt: string;
  justification: { prompt: string; minWords: number } | null;
};
type RatingValue = { ratings?: Record<string, { habit?: string; L?: number; I?: number }>; choice?: string; justification?: string };

const words = (s?: string) => String(s ?? "").trim().split(/\s+/).filter(Boolean).length;

function Rating({ view, value, onChange }: RendererProps<RatingView, RatingValue>) {
  const uid = useId();
  const ratings = value.ratings ?? {};
  const scale = Array.from({ length: view.scaleMax }, (_, i) => ({ id: String(i + 1), label: String(i + 1) }));
  const set = (id: string, patch: { habit?: string; L?: number; I?: number }) => onChange({ ...value, ratings: { ...ratings, [id]: { ...ratings[id], ...patch } } });
  return (
    <div className="space-y-8">
      <ol className="space-y-3">
        {view.items.map((it, i) => {
          const r = ratings[it.id] ?? {};
          const risk = r.L && r.I ? r.L * r.I : null;
          return (
            <Item key={it.id} n={i + 1} title={it.title}>
              {view.habitOptions.length > 0 && (
                <div className="space-y-2">
                  {it.question && <p className="text-sm">{it.question}</p>}
                  <ChoiceGroup label={`Habit: ${it.question || it.title}`} options={view.habitOptions.map((h) => ({ id: h, label: h }))} value={r.habit} onChange={(habit) => set(it.id, { habit })} />
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="label">{view.likelihoodLabel}</p>
                  <ChoiceGroup size="sm" label={`${view.likelihoodLabel} for ${it.title}`} options={scale} value={r.L ? String(r.L) : undefined} onChange={(v) => set(it.id, { L: Number(v) })} />
                </div>
                <div className="space-y-2">
                  <p className="label">{view.impactLabel}</p>
                  <ChoiceGroup size="sm" label={`${view.impactLabel} for ${it.title}`} options={scale} value={r.I ? String(r.I) : undefined} onChange={(v) => set(it.id, { I: Number(v) })} />
                </div>
              </div>
              <p className="text-sm" aria-live="polite">
                Risk = {view.likelihoodLabel.toLowerCase()} × {view.impactLabel.toLowerCase()} = <strong>{risk ?? "?"}</strong>
              </p>
            </Item>
          );
        })}
      </ol>

      <section className="card p-5 sm:p-6 space-y-4">
        <h3 className="text-ink font-medium">{view.choicePrompt}</h3>
        <div role="radiogroup" aria-label={view.choicePrompt} className="grid gap-2">
          {view.items.map((it) => (
            <button key={it.id} type="button" role="radio" aria-checked={value.choice === it.id} onClick={() => onChange({ ...value, choice: it.id })} className="chip justify-start text-left whitespace-normal py-2.5 rounded-2xl">
              {it.action}
            </button>
          ))}
        </div>
        {view.justification && (
          <div>
            <label className="field-label" htmlFor={`${uid}-justification`}>{view.justification.prompt}</label>
            <textarea id={`${uid}-justification`} className="field" value={value.justification ?? ""} onChange={(e) => onChange({ ...value, justification: e.target.value })} />
            <p className="text-sm mt-1" aria-live="polite">
              <strong>{words(value.justification)}</strong> of {view.justification.minWords} words
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function ratingProgress(view: RatingView, value: RatingValue) {
  const r = value.ratings ?? {};
  const rated = view.items.filter((i) => r[i.id]?.L && r[i.id]?.I && (view.habitOptions.length === 0 || r[i.id]?.habit)).length;
  const extra = 1 + (view.justification ? 1 : 0);
  const extraDone = (value.choice ? 1 : 0) + (view.justification && words(value.justification) >= view.justification.minWords ? 1 : 0);
  return { done: rated + extraDone, total: view.items.length + extra };
}

// ------------------------------------------------------- Calculation and choice
type CalcView = { numeric: { id: string; text: string; unit: string }[]; pairs: { id: string; prompt: string; options: { id: string; text: string }[] }[] };
type CalcValue = { calc?: Record<string, string>; pairs?: Record<string, string> };

function CalcChoice({ view, value, onChange }: RendererProps<CalcView, CalcValue>) {
  const uid = useId();
  const calc = value.calc ?? {};
  const pairs = value.pairs ?? {};
  let n = 0;
  return (
    <div className="space-y-8">
      {view.numeric.length > 0 && (
        <ol className="space-y-3">
          {view.numeric.map((q) => (
            <Item key={q.id} n={++n} title={q.text}>
              <div className="flex items-center gap-3">
                <label className="sr-only" htmlFor={`${uid}-q-${q.id}`}>Answer for question {n}</label>
                <input
                  id={`${uid}-q-${q.id}`}
                  className="field max-w-[14rem] tabular-nums"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="Your answer"
                  value={calc[q.id] ?? ""}
                  onChange={(e) => onChange({ ...value, calc: { ...calc, [q.id]: e.target.value } })}
                />
                {q.unit && <span className="text-ink">{q.unit}</span>}
              </div>
            </Item>
          ))}
        </ol>
      )}
      {view.pairs.length > 0 && (
        <ol className="space-y-3" start={n + 1}>
          {view.pairs.map((p) => (
            <Item key={p.id} n={++n} title={p.prompt}>
              <div role="radiogroup" aria-label={p.prompt} className="grid gap-2 sm:grid-cols-2">
                {p.options.map((o) => (
                  <button key={o.id} type="button" role="radio" aria-checked={pairs[p.id] === o.id} onClick={() => onChange({ ...value, pairs: { ...pairs, [p.id]: o.id } })} className="chip justify-start text-left whitespace-normal py-3 rounded-2xl">
                    {o.text}
                  </button>
                ))}
              </div>
            </Item>
          ))}
        </ol>
      )}
    </div>
  );
}

function calcProgress(view: CalcView, value: CalcValue) {
  const done = view.numeric.filter((q) => String(value.calc?.[q.id] ?? "").trim()).length + view.pairs.filter((p) => value.pairs?.[p.id]).length;
  return { done, total: view.numeric.length + view.pairs.length };
}

// ------------------------------------------------------ Short answer & fill-in
type ShortAnswerView = {
  questions: { id: string; prompt: string; placeholder: string; multiline: boolean; hint: string; minWords: number }[];
};
type ShortAnswerValue = { responses?: Record<string, string> };

function ShortAnswer({ view, value, onChange }: RendererProps<ShortAnswerView, ShortAnswerValue>) {
  const uid = useId();
  const responses = value.responses ?? {};
  const set = (id: string, text: string) => onChange({ ...value, responses: { ...responses, [id]: text } });

  return (
    <ol className="space-y-3">
      {view.questions.map((q, i) => {
        const val = responses[q.id] ?? "";
        const fieldId = `${uid}-sa-${q.id}`;
        const useTextarea = q.multiline || q.minWords > 0;
        return (
          <Item key={q.id} n={i + 1} title={q.prompt}>
            {q.hint && <p className="text-sm text-muted">{q.hint}</p>}
            <div>
              <label className="sr-only" htmlFor={fieldId}>Answer for question {i + 1}</label>
              {useTextarea ? (
                <textarea
                  id={fieldId}
                  className="field"
                  placeholder={q.placeholder || "Write your answer…"}
                  value={val}
                  onChange={(e) => set(q.id, e.target.value)}
                />
              ) : (
                <input
                  id={fieldId}
                  type="text"
                  className="field"
                  autoComplete="off"
                  placeholder={q.placeholder || "Your answer"}
                  value={val}
                  onChange={(e) => set(q.id, e.target.value)}
                />
              )}
              {q.minWords > 0 && (
                <p className="text-sm mt-1" aria-live="polite">
                  <strong>{words(val)}</strong> of {q.minWords} words
                </p>
              )}
            </div>
          </Item>
        );
      })}
    </ol>
  );
}

function shortAnswerProgress(view: ShortAnswerView, value: ShortAnswerValue) {
  const r = value.responses ?? {};
  const done = view.questions.filter((q) => {
    const text = String(r[q.id] ?? "").trim();
    if (!text) return false;
    return q.minWords > 0 ? words(text) >= q.minWords : true;
  }).length;
  return { done, total: view.questions.length };
}

// ------------------------------------------------------------------- Composite
type CompositeView = {
  parts: { id: string; type: string; title: string; instructions: string; view: unknown }[];
};
type CompositeValue = { parts?: Record<string, Record<string, unknown>> };

function Composite({ view, value, onChange }: RendererProps<CompositeView, CompositeValue>) {
  const partsVal = value.parts ?? {};
  const setPart = (partId: string, next: Record<string, unknown>) =>
    onChange({ ...value, parts: { ...partsVal, [partId]: next } });

  return (
    <div className="space-y-10">
      {view.parts.map((part, idx) => {
        const renderer = RENDERERS[part.type];
        return (
          <section key={part.id} className="space-y-5 border-t border-line pt-8 first:border-t-0 first:pt-0">
            <div className="space-y-1.5">
              <p className="label">Part {idx + 1} of {view.parts.length}</p>
              <h2 className="display text-2xl sm:text-3xl">{part.title}</h2>
              {part.instructions && <p className="whitespace-pre-line text-sm">{part.instructions}</p>}
            </div>
            {renderer ? (
              <renderer.Component
                view={part.view}
                value={partsVal[part.id] ?? {}}
                onChange={(next) => setPart(part.id, next)}
              />
            ) : (
              <p className="notice notice-bad">This section type cannot be shown. Ask your lecturer.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function compositeProgress(view: CompositeView, value: CompositeValue) {
  const partsVal = value.parts ?? {};
  let done = 0;
  let total = 0;
  for (const part of view.parts) {
    const renderer = RENDERERS[part.type];
    if (!renderer) continue;
    const p = renderer.progress(part.view, partsVal[part.id] ?? {});
    done += p.done;
    total += p.total;
  }
  return { done, total };
}

// ------------------------------------------------------------------ registry
export type RendererProps<V, A> = { view: V; value: A; onChange: (next: A) => void };
type Renderer = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Component: (p: RendererProps<any, any>) => ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  progress: (view: any, value: any) => { done: number; total: number };
};

export const RENDERERS: Record<string, Renderer> = {
  sorting: { Component: Sorting, progress: sortingProgress },
  rating: { Component: Rating, progress: ratingProgress },
  calc_choice: { Component: CalcChoice, progress: calcProgress },
  short_answer: { Component: ShortAnswer, progress: shortAnswerProgress },
  composite: { Component: Composite, progress: compositeProgress },
};
