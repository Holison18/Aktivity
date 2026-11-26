// Short answer & fill-in: supports exact fill-in matches, keyword checks, and open word-count responses.
import { z } from "zod";
import type { ActivityType, FeedbackItem } from "./types";

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/, "Use letters, digits, - or _");

export const shortAnswerConfig = z.object({
  questions: z
    .array(
      z.object({
        id,
        prompt: z.string().min(1).max(800),
        placeholder: z.string().max(160).default(""),
        multiline: z.boolean().default(false),
        hint: z.string().max(200).default(""),
        minWords: z.number().int().min(0).max(500).default(0),
      }),
    )
    .min(1)
    .max(40),
});

const exactRule = z.object({
  mode: z.literal("exact").default("exact"),
  accepted: z.array(z.string().trim().min(1).max(300)).min(1).max(20),
  caseSensitive: z.boolean().default(false),
  points: z.number().min(0).default(1),
  why: z.string().max(500).default(""),
});

const keywordsRule = z.object({
  mode: z.literal("keywords"),
  keywords: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  match: z.enum(["all", "any"]).default("all"),
  minWords: z.number().int().min(0).max(500).default(0),
  points: z.number().min(0).default(2),
  why: z.string().max(500).default(""),
});

const minWordsRule = z.object({
  mode: z.literal("min_words"),
  minWords: z.number().int().min(1).max(500),
  points: z.number().min(0).default(2),
  why: z.string().max(500).default(""),
});

const questionKeySchema = z.union([keywordsRule, minWordsRule, exactRule]);

export const shortAnswerKey = z.object({
  questions: z.record(z.string(), questionKeySchema),
});

export const shortAnswerAnswers = z.object({
  responses: z.record(z.string().max(40), z.string().max(4000)).default({}),
});

type C = z.infer<typeof shortAnswerConfig>;
type K = z.infer<typeof shortAnswerKey>;
type A = z.infer<typeof shortAnswerAnswers>;

const normalizeText = (s: string, caseSensitive: boolean) => {
  const clean = s.trim().replace(/\s+/g, " ");
  return caseSensitive ? clean : clean.toLowerCase();
};

const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export const shortAnswer: ActivityType<C, K, A> = {
  id: "short_answer",
  label: "Short answer & fill-in",
  description: "Fill-in-the-blank, keyword-checked, or open text responses.",
  configSchema: shortAnswerConfig,
  keySchema: shortAnswerKey,
  answersSchema: shortAnswerAnswers,

  view(config) {
    return {
      questions: config.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        placeholder: q.placeholder,
        multiline: q.multiline,
        hint: q.hint,
        minWords: q.minWords,
      })),
    };
  },

  maxScore(config, key) {
    return config.questions.reduce((sum, q) => sum + (key.questions[q.id]?.points ?? 0), 0);
  },

  score(config, key, answers, ctx) {
    let score = 0;
    const items: FeedbackItem[] = config.questions.map((q) => {
      const k = key.questions[q.id];
      const raw = answers.responses[q.id] ?? "";
      const trimmed = raw.trim();
      const wc = countWords(trimmed);

      let ok = false;
      let expected: string | undefined;
      let fallbackWhy: string | undefined;

      if (k.mode === "exact") {
        const normGiven = normalizeText(trimmed, k.caseSensitive);
        ok = trimmed.length > 0 && k.accepted.some((ans) => normalizeText(ans, k.caseSensitive) === normGiven);
        if (ctx.reveal) expected = k.accepted.slice(0, 3).join(" / ");
        if (!ok) fallbackWhy = trimmed ? "Does not match the expected answer." : "No answer given.";
      } else if (k.mode === "keywords") {
        const normGiven = normalizeText(trimmed, false);
        const matched = k.keywords.filter((kw) => normGiven.includes(normalizeText(kw, false)));
        const kwOk = k.match === "all" ? matched.length === k.keywords.length : matched.length > 0;
        const lenOk = wc >= k.minWords;
        ok = trimmed.length > 0 && kwOk && lenOk;
        if (ctx.reveal) {
          const list = k.keywords.join(", ");
          expected = k.match === "all" ? `Include: ${list}` : `Include any of: ${list}`;
        }
        if (!ok) {
          if (!trimmed) fallbackWhy = "No answer given.";
          else if (!lenOk) fallbackWhy = `Write at least ${k.minWords} words.`;
          else fallbackWhy = k.match === "all" ? "Include all required key terms." : "Include at least one expected key term.";
        }
      } else {
        ok = wc >= k.minWords;
        if (ctx.reveal) expected = `At least ${k.minWords} words`;
        if (!ok) fallbackWhy = trimmed ? `Write at least ${k.minWords} words.` : "No answer given.";
      }

      const pts = ok ? k.points : 0;
      score += pts;

      const given =
        !trimmed
          ? "No answer"
          : k.mode === "min_words"
            ? `${trimmed} (${wc} word${wc === 1 ? "" : "s"})`
            : trimmed;

      return {
        id: q.id,
        label: q.prompt,
        ok,
        points: pts,
        maxPoints: k.points,
        given,
        why: k.why || fallbackWhy,
        expected,
      };
    });

    return {
      score,
      max: this.maxScore(config, key),
      sections: [{ title: "Short answers", items }],
    };
  },

  describe(config, answers) {
    return config.questions
      .map((q) => {
        const val = (answers.responses[q.id] ?? "").replace(/\s+/g, " ").trim() || "-";
        return `${q.id}=${val}`;
      })
      .join("; ");
  },

  validate(config, key) {
    const errs: string[] = [];
    const seen = new Set<string>();
    for (const q of config.questions) {
      if (seen.has(q.id)) errs.push(`Question id "${q.id}" is used twice.`);
      seen.add(q.id);
      if (!key.questions[q.id]) {
        errs.push(`Question "${q.id}" has no answer key entry.`);
      }
    }
    return errs;
  },
};
