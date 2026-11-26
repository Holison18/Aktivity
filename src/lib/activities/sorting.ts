// Sorting: place each card in a category and (optionally) judge it, e.g. "helps" or "harms".
import { z } from "zod";
import { seeded } from "../seeded";
import type { ActivityType, FeedbackItem } from "./types";

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/, "Use letters, digits, - or _");

export const sortingConfig = z.object({
  categories: z
    .array(z.object({ id, name: z.string().min(1).max(80), description: z.string().max(300).default("") }))
    .min(2)
    .max(8),
  judge: z
    .object({
      prompt: z.string().min(1).max(120),
      options: z.array(z.object({ id, label: z.string().min(1).max(40) })).min(2).max(4),
    })
    .nullable()
    .default(null),
  cards: z.array(z.object({ id, text: z.string().min(1).max(300) })).min(1).max(60),
  shuffle: z.boolean().default(true),
});

export const sortingKey = z.object({
  cards: z.record(
    z.string(),
    z.object({ category: z.string(), judge: z.string().optional(), why: z.string().max(500).default("") }),
  ),
  points: z.object({ category: z.number().min(0).default(1), judge: z.number().min(0).default(1) }).default({ category: 1, judge: 1 }),
});

export const sortingAnswers = z.object({
  placements: z
    .record(z.string().max(40), z.object({ category: z.string().max(40).optional(), judge: z.string().max(40).optional() }))
    .default({}),
});

type C = z.infer<typeof sortingConfig>;
type K = z.infer<typeof sortingKey>;
type A = z.infer<typeof sortingAnswers>;

function shuffled<T>(arr: T[], seed: string): T[] {
  const r = seeded(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sorting: ActivityType<C, K, A> = {
  id: "sorting",
  label: "Sorting",
  description: "Place cards in categories and judge each one.",
  configSchema: sortingConfig,
  keySchema: sortingKey,
  answersSchema: sortingAnswers,

  view(config, index) {
    return {
      categories: config.categories,
      judge: config.judge,
      cards: config.shuffle ? shuffled(config.cards, `${index}|sort`) : config.cards,
    };
  },

  maxScore(config, key) {
    const per = key.points.category + (config.judge ? key.points.judge : 0);
    return config.cards.length * per;
  },

  score(config, key, answers, ctx) {
    const catName = (cid?: string) => config.categories.find((c) => c.id === cid)?.name ?? "not placed";
    const judgeLabel = (jid?: string) => config.judge?.options.find((o) => o.id === jid)?.label ?? "not judged";
    let score = 0;
    const items: FeedbackItem[] = config.cards.map((card) => {
      const k = key.cards[card.id];
      const g = answers.placements[card.id] ?? {};
      const okCat = !!k && g.category === k.category;
      const okJudge = !config.judge || (!!k && g.judge === k.judge);
      const pts = (okCat ? key.points.category : 0) + (config.judge && okJudge ? key.points.judge : 0);
      score += pts;
      const given = config.judge ? `${catName(g.category)}, ${judgeLabel(g.judge)}` : catName(g.category);
      const expected = k ? (config.judge ? `${catName(k.category)}, ${judgeLabel(k.judge)}` : catName(k.category)) : undefined;
      return {
        id: card.id,
        label: card.text,
        ok: okCat && okJudge,
        points: pts,
        maxPoints: key.points.category + (config.judge ? key.points.judge : 0),
        why: k?.why || undefined,
        given,
        expected: ctx.reveal ? expected : undefined,
      };
    });
    return { score, max: this.maxScore(config, key), sections: [{ title: "Cards", items }] };
  },

  describe(config, answers) {
    return config.cards
      .map((c) => {
        const g = answers.placements[c.id];
        return `${c.id}: ${g?.category ?? "-"}${config.judge ? `/${g?.judge ?? "-"}` : ""}`;
      })
      .join("; ");
  },

  validate(config, key) {
    const errs: string[] = [];
    const cats = new Set(config.categories.map((c) => c.id));
    const opts = new Set(config.judge?.options.map((o) => o.id) ?? []);
    if (cats.size !== config.categories.length) errs.push("Category ids must be unique.");
    const ids = new Set<string>();
    for (const c of config.cards) {
      if (ids.has(c.id)) errs.push(`Card id "${c.id}" is used twice.`);
      ids.add(c.id);
      const k = key.cards[c.id];
      if (!k) { errs.push(`Card "${c.id}" has no answer key entry.`); continue; }
      if (!cats.has(k.category)) errs.push(`Card "${c.id}": key category "${k.category}" is not a category.`);
      if (config.judge && (!k.judge || !opts.has(k.judge))) errs.push(`Card "${c.id}": key judgement must be one of ${[...opts].join(", ")}.`);
    }
    return errs;
  },
};
