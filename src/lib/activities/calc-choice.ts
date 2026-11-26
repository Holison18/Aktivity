// Calculation and choice: numeric answers with tolerance (values seeded from the index number, FR-26)
// plus pick-one pairs.
import { z } from "zod";
import { seeded } from "../seeded";
import { evaluate, fillTemplate } from "../expr";
import type { ActivityType, FeedbackItem } from "./types";

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/, "Use letters, digits, - or _");
const varName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);

const variable = z.union([
  z.object({ min: z.number(), max: z.number(), step: z.number().positive().default(1) }),
  z.object({ choices: z.array(z.number()).min(1) }),
]);

export const calcConfig = z.object({
  numeric: z
    .array(z.object({ id, text: z.string().min(1).max(600), unit: z.string().max(30).default(""), vars: z.record(varName, variable).default({}) }))
    .max(20)
    .default([]),
  pairs: z
    .array(z.object({ id, prompt: z.string().max(200).default("Which is stronger?"), a: z.string().min(1).max(300), b: z.string().min(1).max(300), shuffle: z.boolean().default(true) }))
    .max(20)
    .default([]),
});

export const calcKey = z.object({
  numeric: z
    .record(
      z.string(),
      z.object({
        formula: z.string().min(1).max(300),
        tolerance: z.object({ abs: z.number().min(0).optional(), rel: z.number().min(0).optional() }),
        points: z.number().min(0).default(2),
        work: z.string().max(300).default(""),
        /** How the correct answer is printed: "fixed:1" (1 decimal) or "precision:3" (3 significant digits). */
        display: z.string().regex(/^(fixed|precision):\d{1,2}$/).default("fixed:2"),
      }),
    )
    .default({}),
  pairs: z.record(z.string(), z.object({ correct: z.enum(["a", "b"]), why: z.string().max(500).default(""), points: z.number().min(0).default(1) })).default({}),
});

export const calcAnswers = z.object({
  calc: z.record(z.string().max(40), z.union([z.string().max(60), z.number()])).default({}),
  pairs: z.record(z.string().max(40), z.enum(["a", "b"])).default({}),
});

type C = z.infer<typeof calcConfig>;
type K = z.infer<typeof calcKey>;
type A = z.infer<typeof calcAnswers>;

/** Per-student values for one question. Deterministic for (index, question id). */
export function questionVars(q: C["numeric"][number], index: string): Record<string, number> {
  const r = seeded(`${index}|calc|${q.id}`);
  const out: Record<string, number> = {};
  for (const [name, v] of Object.entries(q.vars)) {
    if ("choices" in v) out[name] = v.choices[Math.floor(r() * v.choices.length)];
    else {
      const steps = Math.floor((v.max - v.min) / v.step);
      out[name] = Number((v.min + Math.floor(r() * (steps + 1)) * v.step).toFixed(10));
    }
  }
  return out;
}

function flipPair(pairId: string, index: string): boolean {
  return seeded(`${index}|pair|${pairId}`)() < 0.5;
}

/** Parses what a student typed: accepts "1,5", "1.5", "1.2e9", "1.2 x 10^9", spaces and thousands separators. */
export function parseNumber(raw: string | number | undefined): number {
  if (raw == null || raw === "") return NaN;
  if (typeof raw === "number") return raw;
  let s = raw.trim().replace(/\s+/g, "").replace(/[×xX*]10\^/g, "e").replace(/^\+/, "");
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else s = s.replace(",", ".");
  return /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s) ? Number(s) : NaN;
}

export function withinTolerance(given: number, truth: number, tol: { abs?: number; rel?: number }): boolean {
  if (!Number.isFinite(given) || !Number.isFinite(truth)) return false;
  const diff = Math.abs(given - truth);
  const absOk = tol.abs != null && diff <= tol.abs + 1e-12;
  const relOk = tol.rel != null && diff <= Math.abs(truth) * tol.rel + 1e-12;
  if (tol.abs == null && tol.rel == null) return diff <= 1e-9;
  return absOk || relOk;
}

function fmt(v: number, display: string): string {
  const [mode, d] = display.split(":");
  return mode === "precision" ? v.toPrecision(Number(d)) : v.toFixed(Number(d));
}

export const calcChoice: ActivityType<C, K, A> = {
  id: "calc_choice",
  label: "Calculation and choice",
  description: "Numeric answers with tolerance, plus pick-one pairs.",
  configSchema: calcConfig,
  keySchema: calcKey,
  answersSchema: calcAnswers,

  view(config, index) {
    return {
      numeric: config.numeric.map((q) => ({ id: q.id, text: fillTemplate(q.text, questionVars(q, index)), unit: q.unit })),
      pairs: config.pairs.map((p) => {
        const opts = [{ id: "a", text: p.a }, { id: "b", text: p.b }];
        return { id: p.id, prompt: p.prompt, options: p.shuffle && flipPair(p.id, index) ? opts.reverse() : opts };
      }),
    };
  },

  maxScore(config, key) {
    const n = config.numeric.reduce((s, q) => s + (key.numeric[q.id]?.points ?? 0), 0);
    const p = config.pairs.reduce((s, q) => s + (key.pairs[q.id]?.points ?? 0), 0);
    return n + p;
  },

  score(config, key, answers, ctx) {
    let score = 0;
    const calcItems: FeedbackItem[] = config.numeric.map((q) => {
      const k = key.numeric[q.id];
      const vars = questionVars(q, ctx.index);
      const truth = evaluate(k.formula, vars);
      const raw = answers.calc[q.id];
      const given = parseNumber(raw);
      const ok = withinTolerance(given, truth, k.tolerance);
      if (ok) score += k.points;
      return {
        id: q.id,
        label: fillTemplate(q.text, vars),
        ok,
        points: ok ? k.points : 0,
        maxPoints: k.points,
        given: raw == null || raw === "" ? "No answer" : `${raw}${q.unit ? ` ${q.unit}` : ""}`,
        why: ok ? undefined : Number.isFinite(given) ? "Outside the accepted range. Check the formula and your units." : "Not a number. Type digits, for example 52.4 or 1.2e9.",
        expected: ctx.reveal ? `${fmt(truth, k.display)}${q.unit ? ` ${q.unit}` : ""}${k.work ? ` (${fillTemplate(k.work, vars)})` : ""}` : undefined,
      };
    });
    const pairItems: FeedbackItem[] = config.pairs.map((p) => {
      const k = key.pairs[p.id];
      const g = answers.pairs[p.id];
      const ok = g === k.correct;
      if (ok) score += k.points;
      const text = (x?: string) => (x === "a" ? p.a : x === "b" ? p.b : "No choice");
      return {
        id: p.id,
        label: `${p.prompt} ${p.a} or ${p.b}`,
        ok,
        points: ok ? k.points : 0,
        maxPoints: k.points,
        given: text(g),
        why: k.why || undefined,
        expected: ctx.reveal ? text(k.correct) : undefined,
      };
    });
    const sections = [];
    if (calcItems.length) sections.push({ title: "Calculations", items: calcItems });
    if (pairItems.length) sections.push({ title: "Choices", items: pairItems });
    return { score, max: this.maxScore(config, key), sections };
  },

  describe(config, answers) {
    const c = config.numeric.map((q) => `${q.id}=${answers.calc[q.id] ?? "-"}`).join(", ");
    const p = config.pairs.map((q) => `${q.id}=${answers.pairs[q.id] ?? "-"}`).join(", ");
    return [c && `Calc: ${c}`, p && `Pairs: ${p}`].filter(Boolean).join("; ");
  },

  validate(config, key) {
    const errs: string[] = [];
    if (config.numeric.length + config.pairs.length === 0) errs.push("Add at least one calculation or pair.");
    for (const q of config.numeric) {
      const k = key.numeric[q.id];
      if (!k) { errs.push(`Question "${q.id}" has no answer key entry.`); continue; }
      if (k.tolerance.abs == null && k.tolerance.rel == null) errs.push(`Question "${q.id}": set an absolute or relative tolerance.`);
      for (const [n, v] of Object.entries(q.vars)) if ("min" in v && v.max < v.min) errs.push(`Question "${q.id}": variable ${n} has max below min.`);
      try {
        const v = evaluate(k.formula, questionVars(q, "TEST"));
        if (!Number.isFinite(v)) errs.push(`Question "${q.id}": formula does not give a finite number.`);
      } catch (e) {
        errs.push(`Question "${q.id}": ${(e as Error).message}.`);
      }
    }
    for (const p of config.pairs) if (!key.pairs[p.id]) errs.push(`Pair "${p.id}" has no answer key entry.`);
    return errs;
  },
};
