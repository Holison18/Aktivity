// Shared contract for activity types (FR-22, NF-13).
// The server-side module (this folder) owns config schema, answer-key schema and scoring.
// The browser only ever receives `view(...)` output, which never contains the answer key.
import type { z } from "zod";

export type FeedbackItem = {
  id: string;
  label: string;
  ok: boolean;
  points: number;
  maxPoints: number;
  /** Reason shown to the student (SRS 5.2: per-item feedback with reasons). */
  why?: string;
  /** What the student gave, in words. */
  given?: string;
  /** The correct answer. Only filled when `reveal` is true (no attempts left), so a retry cannot copy it. */
  expected?: string;
};

export type FeedbackSection = { title: string; items: FeedbackItem[] };

export type ScoreResult = {
  score: number;
  max: number;
  sections: FeedbackSection[];
  notes?: string[];
};

export type ScoreContext = {
  /** Normalised index number; seeds per-student numbers (FR-26). */
  index: string;
  /** True when this is the student's last allowed attempt, so correct answers may be shown. */
  reveal: boolean;
};

export interface ActivityType<C = unknown, K = unknown, A = unknown> {
  id: string;
  label: string;
  description: string;
  configSchema: z.ZodType<C>;
  keySchema: z.ZodType<K>;
  answersSchema: z.ZodType<A>;
  /** What the student's browser receives. Must never include the answer key. */
  view(config: C, index: string): unknown;
  score(config: C, key: K, answers: A, ctx: ScoreContext): ScoreResult;
  maxScore(config: C, key: K): number;
  /** One-line text form of the answers for the Excel "Answers" sheet. */
  describe(config: C, answers: A): string;
  /** Cross-checks between config and key (e.g. every card has a key entry). Returns error messages. */
  validate(config: C, key: K): string[];
}

export type Template = {
  id: string;
  type: string;
  title: string;
  instructions: string;
  config: unknown;
  answer_key: unknown;
};
