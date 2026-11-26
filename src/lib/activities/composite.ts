// Composite activity: combines multiple base activity types (e.g. sorting, rating,
// calculation, short answer) into a single weekly activity with unified scoring and feedback.
import { z } from "zod";
import { sorting } from "./sorting";
import { rating } from "./rating";
import { calcChoice } from "./calc-choice";
import { shortAnswer } from "./short-answer";
import type { ActivityType, FeedbackSection } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const BASE_ACTIVITY_TYPES: Record<string, ActivityType<any, any, any>> = {
  [sorting.id]: sorting,
  [rating.id]: rating,
  [calcChoice.id]: calcChoice,
  [shortAnswer.id]: shortAnswer,
};

export const BASE_TYPE_IDS = Object.keys(BASE_ACTIVITY_TYPES) as [string, ...string[]];

const partId = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/, "Use letters, digits, - or _");

export const compositePartSchema = z.object({
  id: partId,
  type: z.enum(BASE_TYPE_IDS),
  title: z.string().trim().min(1).max(160),
  instructions: z.string().max(2000).default(""),
  config: z.unknown(),
});

export const compositeConfig = z.object({
  parts: z.array(compositePartSchema).min(1).max(12),
});

export const compositeKey = z.object({
  parts: z.record(z.string(), z.unknown()),
});

export const compositeAnswers = z.object({
  parts: z.record(z.string().max(40), z.unknown()).default({}),
});

type C = z.infer<typeof compositeConfig>;
type K = z.infer<typeof compositeKey>;
type A = z.infer<typeof compositeAnswers>;

const round2 = (n: number) => Math.round(n * 100) / 100;

export const composite: ActivityType<C, K, A> = {
  id: "composite",
  label: "Combined activity",
  description: "Combine multiple activity types (sorting, rating, calculation, short answer) in one activity.",
  configSchema: compositeConfig,
  keySchema: compositeKey,
  answersSchema: compositeAnswers,

  view(config, index) {
    return {
      parts: config.parts.map((part) => {
        const base = BASE_ACTIVITY_TYPES[part.type];
        const parsedCfg = base.configSchema.parse(part.config);
        return {
          id: part.id,
          type: part.type,
          title: part.title,
          instructions: part.instructions,
          view: base.view(parsedCfg, `${index}|${part.id}`),
        };
      }),
    };
  },

  maxScore(config, key) {
    const total = config.parts.reduce((sum, part) => {
      const base = BASE_ACTIVITY_TYPES[part.type];
      const parsedCfg = base.configSchema.parse(part.config);
      const parsedKey = base.keySchema.parse(key.parts[part.id]);
      return sum + base.maxScore(parsedCfg, parsedKey);
    }, 0);
    return round2(total);
  },

  score(config, key, answers, ctx) {
    let totalScore = 0;
    let totalMax = 0;
    const sections: FeedbackSection[] = [];
    const notes: string[] = [];

    config.parts.forEach((part, idx) => {
      const base = BASE_ACTIVITY_TYPES[part.type];
      const parsedCfg = base.configSchema.parse(part.config);
      const parsedKey = base.keySchema.parse(key.parts[part.id]);
      const parsedAnsRes = base.answersSchema.safeParse(answers.parts[part.id] ?? {});
      const partAns = parsedAnsRes.success ? parsedAnsRes.data : base.answersSchema.parse({});

      const res = base.score(parsedCfg, parsedKey, partAns, {
        ...ctx,
        index: `${ctx.index}|${part.id}`,
      });

      totalScore += res.score;
      totalMax += res.max;

      const partPrefix = `Part ${idx + 1}: ${part.title}`;
      for (const s of res.sections) {
        sections.push({
          title: res.sections.length === 1 ? partPrefix : `${partPrefix} · ${s.title}`,
          items: s.items.map((it) => ({ ...it, id: `${part.id}:${it.id}` })),
        });
      }
      if (res.notes?.length) {
        for (const n of res.notes) notes.push(`${partPrefix} — ${n}`);
      }
    });

    return {
      score: round2(totalScore),
      max: round2(totalMax),
      sections,
      notes: notes.length ? notes : undefined,
    };
  },

  describe(config, answers) {
    return config.parts
      .map((part, idx) => {
        const base = BASE_ACTIVITY_TYPES[part.type];
        const parsedCfg = base.configSchema.parse(part.config);
        const parsedAnsRes = base.answersSchema.safeParse(answers.parts[part.id] ?? {});
        const partAns = parsedAnsRes.success ? parsedAnsRes.data : base.answersSchema.parse({});
        return `[Part ${idx + 1}: ${part.title}] ${base.describe(parsedCfg, partAns)}`;
      })
      .join(" | ");
  },

  validate(config, key) {
    const errs: string[] = [];
    const seen = new Set<string>();

    config.parts.forEach((part, idx) => {
      const label = `Part ${idx + 1} (${part.title || part.id})`;
      if (seen.has(part.id)) errs.push(`${label}: part id "${part.id}" is used twice.`);
      seen.add(part.id);

      const base = BASE_ACTIVITY_TYPES[part.type];
      if (!base) {
        errs.push(`${label}: unknown activity type "${part.type}".`);
        return;
      }

      const c = base.configSchema.safeParse(part.config);
      if (!c.success) {
        for (const i of c.error.issues) {
          errs.push(`${label} config ${i.path.join(".") || "(root)"}: ${i.message}`);
        }
      }

      const rawKey = key.parts[part.id];
      if (rawKey === undefined) {
        errs.push(`${label}: missing answer key.`);
        return;
      }
      const k = base.keySchema.safeParse(rawKey);
      if (!k.success) {
        for (const i of k.error.issues) {
          errs.push(`${label} answer key ${i.path.join(".") || "(root)"}: ${i.message}`);
        }
      }

      if (c.success && k.success) {
        for (const e of base.validate(c.data, k.data)) {
          errs.push(`${label}: ${e}`);
        }
      }
    });

    return errs;
  },
};
