// Rating: rate each item on likelihood and impact (and optionally a habit scale),
// then pick the action for the highest risk and justify it.
import { z } from "zod";
import type { ActivityType, FeedbackItem } from "./types";

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/, "Use letters, digits, - or _");

export const ratingConfig = z.object({
  items: z
    .array(z.object({ id, title: z.string().min(1).max(200), question: z.string().max(300).default(""), action: z.string().min(1).max(200) }))
    .min(2)
    .max(30),
  habitOptions: z.array(z.string().min(1).max(30)).max(6).default([]),
  scaleMax: z.number().int().min(3).max(10).default(5),
  likelihoodLabel: z.string().max(40).default("Likelihood"),
  impactLabel: z.string().max(40).default("Impact"),
  choicePrompt: z.string().max(300).default("Pick the one change you will make first."),
  justification: z.object({ prompt: z.string().max(300), minWords: z.number().int().min(0).max(500) }).nullable().default(null),
});

// For a rating activity the "answer key" is the marking scheme. It stays on the server like any key.
export const ratingKey = z.object({
  perCompleteItem: z.number().min(0).default(1),
  choiceMatchesTop: z.number().min(0).default(3),
  justification: z.number().min(0).default(1),
  /** When true, the choice only scores if every item is rated (prototype behaviour). */
  choiceRequiresAllRated: z.boolean().default(true),
});

const intIn = z.union([z.number(), z.string()]).transform((v) => Number(v)).optional();

export const ratingAnswers = z.object({
  ratings: z.record(z.string().max(40), z.object({ habit: z.string().max(30).optional(), L: intIn, I: intIn })).default({}),
  choice: z.string().max(40).optional(),
  justification: z.string().max(4000).optional(),
});

type C = z.infer<typeof ratingConfig>;
type K = z.infer<typeof ratingKey>;
type A = z.infer<typeof ratingAnswers>;

const words = (s?: string) => String(s ?? "").trim().split(/\s+/).filter(Boolean).length;

export const rating: ActivityType<C, K, A> = {
  id: "rating",
  label: "Rating",
  description: "Rate items on scales, then pick an action for the top risk.",
  configSchema: ratingConfig,
  keySchema: ratingKey,
  answersSchema: ratingAnswers,

  view(config) {
    return config;
  },

  maxScore(config, key) {
    return config.items.length * key.perCompleteItem + key.choiceMatchesTop + (config.justification ? key.justification : 0);
  },

  score(config, key, answers) {
    const valid = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= config.scaleMax;
    const rows: { id: string; title: string; risk: number }[] = [];
    let score = 0;
    const itemFeedback: FeedbackItem[] = config.items.map((it) => {
      const r = answers.ratings[it.id] ?? {};
      const habitOk = config.habitOptions.length === 0 || (r.habit != null && config.habitOptions.includes(r.habit));
      const complete = habitOk && valid(r.L) && valid(r.I);
      if (complete) {
        score += key.perCompleteItem;
        rows.push({ id: it.id, title: it.title, risk: (r.L as number) * (r.I as number) });
      }
      return {
        id: it.id,
        label: it.title,
        ok: complete,
        points: complete ? key.perCompleteItem : 0,
        maxPoints: key.perCompleteItem,
        given: complete ? `${config.likelihoodLabel} ${r.L} × ${config.impactLabel} ${r.I} = risk ${(r.L as number) * (r.I as number)}` : "Not fully rated",
        why: complete ? undefined : "Every scale on this item needs an answer.",
      };
    });

    const top = rows.slice().sort((a, b) => b.risk - a.risk);
    const best = top.length ? top[0].risk : null;
    const topIds = top.filter((x) => x.risk === best).map((x) => x.id);
    const allRated = rows.length === config.items.length;
    const choiceOk = (!key.choiceRequiresAllRated || allRated) && !!answers.choice && topIds.includes(answers.choice);
    if (choiceOk) score += key.choiceMatchesTop;
    const chosen = config.items.find((i) => i.id === answers.choice);

    const decision: FeedbackItem[] = [
      {
        id: "choice",
        label: "Your first change matches your highest rated risk",
        ok: choiceOk,
        points: choiceOk ? key.choiceMatchesTop : 0,
        maxPoints: key.choiceMatchesTop,
        given: chosen ? chosen.action : "No change picked",
        why: choiceOk
          ? undefined
          : !allRated && key.choiceRequiresAllRated
            ? "Rate every item first, then pick the change for your highest risk."
            : "Pick the change that belongs to the item with your highest likelihood × impact.",
      },
    ];
    if (config.justification) {
      const n = words(answers.justification);
      const ok = n >= config.justification.minWords;
      if (ok) score += key.justification;
      decision.push({
        id: "justification",
        label: `Justification of at least ${config.justification.minWords} words`,
        ok,
        points: ok ? key.justification : 0,
        maxPoints: key.justification,
        given: `${n} words`,
      });
    }

    return {
      score,
      max: this.maxScore(config, key),
      sections: [
        { title: "Ratings", items: itemFeedback },
        { title: "Decision", items: decision },
      ],
      notes: top.length ? [`Your top risks: ${top.slice(0, 3).map((t) => `${t.title} (${t.risk})`).join("; ")}`] : undefined,
    };
  },

  describe(config, answers) {
    const parts = config.items.map((it) => {
      const r = answers.ratings[it.id] ?? {};
      return `${it.id} habit=${r.habit ?? "-"} L=${r.L ?? "-"} I=${r.I ?? "-"}`;
    });
    parts.push(`choice=${answers.choice ?? "-"}`);
    if (config.justification) parts.push(`justification=${(answers.justification ?? "").replace(/\s+/g, " ").trim() || "-"}`);
    return parts.join("; ");
  },

  validate(config) {
    const ids = config.items.map((i) => i.id);
    return new Set(ids).size === ids.length ? [] : ["Item ids must be unique."];
  },
};
