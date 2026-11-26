// Activity type registry. To add a new type: write a module implementing ActivityType,
// add it here, and add its renderer in src/components/activities/renderers.tsx.
// Existing types are not touched (FR-22).
import { sorting } from "./sorting";
import { rating } from "./rating";
import { calcChoice } from "./calc-choice";
import { shortAnswer } from "./short-answer";
import { BASE_ACTIVITY_TYPES, composite } from "./composite";
import type { ActivityType, ScoreContext, ScoreResult } from "./types";

export { BASE_ACTIVITY_TYPES };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ACTIVITY_TYPES: Record<string, ActivityType<any, any, any>> = {
  [sorting.id]: sorting,
  [rating.id]: rating,
  [calcChoice.id]: calcChoice,
  [shortAnswer.id]: shortAnswer,
  [composite.id]: composite,
};

export const TYPE_IDS = Object.keys(ACTIVITY_TYPES);

/** Human-readable type label, listing included base types for combined activities. */
export function activityTypeSummary(type: string, config?: unknown): string {
  if (type === composite.id && config && typeof config === "object" && Array.isArray((config as { parts?: unknown[] }).parts)) {
    const parts = (config as { parts: { type?: string }[] }).parts;
    const labels: string[] = [];
    for (const p of parts) {
      if (p?.type) {
        const lbl = BASE_ACTIVITY_TYPES[p.type]?.label ?? p.type;
        if (!labels.includes(lbl)) labels.push(lbl);
      }
    }
    if (labels.length) return labels.join(" + ");
  }
  return ACTIVITY_TYPES[type]?.label ?? type;
}

export function getType(id: string) {
  const t = ACTIVITY_TYPES[id];
  if (!t) throw new Error(`Unknown activity type "${id}"`);
  return t;
}

export type ParsedActivity = { config: unknown; key: unknown; maxScore: number };

/** Validates config and key against the type's schemas and cross-checks. Throws with readable messages. */
export function parseActivity(type: string, config: unknown, key: unknown): ParsedActivity {
  const t = getType(type);
  const c = t.configSchema.safeParse(config);
  if (!c.success) throw new ActivityValidationError(c.error.issues.map((i) => `Config ${i.path.join(".") || "(root)"}: ${i.message}`));
  const k = t.keySchema.safeParse(key);
  if (!k.success) throw new ActivityValidationError(k.error.issues.map((i) => `Answer key ${i.path.join(".") || "(root)"}: ${i.message}`));
  const errs = t.validate(c.data, k.data);
  if (errs.length) throw new ActivityValidationError(errs);
  return { config: c.data, key: k.data, maxScore: t.maxScore(c.data, k.data) };
}

export class ActivityValidationError extends Error {
  constructor(public issues: string[]) {
    super(issues.join("\n"));
  }
}

/** Builds the student-facing view. Never includes the answer key (FR-23, NF-05). */
export function publicView(type: string, config: unknown, index: string): unknown {
  const t = getType(type);
  return t.view(t.configSchema.parse(config), index);
}

/** Scores a submission on the server. Unknown answer fields are dropped by the schema. */
export function scoreSubmission(type: string, config: unknown, key: unknown, answers: unknown, ctx: ScoreContext): { answers: unknown; result: ScoreResult } {
  const t = getType(type);
  const cfg = t.configSchema.parse(config);
  const k = t.keySchema.parse(key);
  const parsed = t.answersSchema.safeParse(answers ?? {});
  const a = parsed.success ? parsed.data : t.answersSchema.parse({});
  if (type === composite.id) {
    const c = cfg as { parts: { id: string; type: string }[] };
    const rawParts = (a as { parts: Record<string, unknown> }).parts;
    const cleanParts: Record<string, unknown> = {};
    for (const part of c.parts) {
      const base = BASE_ACTIVITY_TYPES[part.type];
      const p = base.answersSchema.safeParse(rawParts[part.id] ?? {});
      cleanParts[part.id] = p.success ? p.data : base.answersSchema.parse({});
    }
    const cleanAnswers = { parts: cleanParts };
    return { answers: cleanAnswers, result: t.score(cfg, k, cleanAnswers, ctx) };
  }
  return { answers: a, result: t.score(cfg, k, a, ctx) };
}

export function describeAnswers(type: string, config: unknown, answers: unknown): string {
  try {
    const t = getType(type);
    return t.describe(t.configSchema.parse(config), t.answersSchema.parse(answers ?? {}));
  } catch {
    return JSON.stringify(answers);
  }
}
