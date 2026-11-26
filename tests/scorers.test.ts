import { describe, expect, it } from "vitest";
import { ACTIVITY_TYPES, activityTypeSummary, describeAnswers, parseActivity, publicView, scoreSubmission } from "@/lib/activities/registry";
import { TEMPLATES, BLANKS, ciaTemplate, riskTemplate, passwordTemplate, shortAnswerTemplate } from "@/lib/activities/templates";
import { questionVars, parseNumber, withinTolerance } from "@/lib/activities/calc-choice";
import { evaluate } from "@/lib/expr";

const IDX = "1234567";
const ctx = (reveal = false) => ({ index: IDX, reveal });

describe("templates and blanks are valid (FR-21, FR-22)", () => {
  for (const t of [...TEMPLATES, ...Object.values(BLANKS)]) {
    it(`${t.id} parses and has a positive max score`, () => {
      const p = parseActivity(t.type, t.config, t.answer_key);
      expect(p.maxScore).toBeGreaterThan(0);
    });
  }
  it("keeps the prototype max scores (30, 12, 12)", () => {
    expect(parseActivity("sorting", ciaTemplate.config, ciaTemplate.answer_key).maxScore).toBe(30);
    expect(parseActivity("rating", riskTemplate.config, riskTemplate.answer_key).maxScore).toBe(12);
    expect(parseActivity("calc_choice", passwordTemplate.config, passwordTemplate.answer_key).maxScore).toBe(12);
  });
  it("refuses a sorting key that does not cover every card", () => {
    const cfg = structuredClone(ciaTemplate.config) as { cards: { id: string; text: string }[] };
    cfg.cards.push({ id: "extra", text: "No key for me" });
    expect(() => parseActivity("sorting", cfg, ciaTemplate.answer_key)).toThrow(/no answer key/);
  });
  it("refuses an unknown type", () => {
    expect(() => parseActivity("essay", {}, {})).toThrow(/Unknown activity type/);
  });
});

describe("public views never contain answer keys (FR-23, NF-05, AC-5)", () => {
  for (const t of TEMPLATES) {
    it(`${t.id} view has no key material`, () => {
      const json = JSON.stringify(publicView(t.type, t.config, IDX));
      expect(json).not.toContain("answer_key");
      expect(json).not.toContain("formula");
      expect(json).not.toContain("correct");
      expect(json).not.toContain('"why"');
      expect(json).not.toContain("tolerance");
      // No key value appears verbatim in the view: e.g. the CIA "why" explanations.
      const key = t.answer_key as Record<string, unknown>;
      for (const s of JSON.stringify(key).match(/"why":"([^"]{20,})"/g) ?? []) {
        expect(json).not.toContain(s.slice(7, 40));
      }
    });
  }
  it("feedback hides expected answers until the last attempt", () => {
    const first = scoreSubmission("sorting", ciaTemplate.config, ciaTemplate.answer_key, {}, ctx(false)).result;
    expect(first.sections[0].items.every((i) => i.expected === undefined)).toBe(true);
    const last = scoreSubmission("sorting", ciaTemplate.config, ciaTemplate.answer_key, {}, ctx(true)).result;
    expect(last.sections[0].items.every((i) => typeof i.expected === "string")).toBe(true);
  });
});

describe("sorting scorer", () => {
  const key = ciaTemplate.answer_key as { cards: Record<string, { category: string; judge: string }> };
  const perfect = { placements: Object.fromEntries(Object.entries(key.cards).map(([id, k]) => [id, { category: k.category, judge: k.judge }])) };

  it("scores a perfect answer 30/30", () => {
    expect(scoreSubmission("sorting", ciaTemplate.config, ciaTemplate.answer_key, perfect, ctx()).result.score).toBe(30);
  });
  it("gives 1 point for the right category with the wrong judgement", () => {
    const one = { placements: { k01: { category: "C", judge: "helps" } } }; // k01 is C / harms
    const r = scoreSubmission("sorting", ciaTemplate.config, ciaTemplate.answer_key, one, ctx()).result;
    expect(r.score).toBe(1);
    expect(r.sections[0].items.find((i) => i.id === "k01")?.ok).toBe(false);
  });
  it("scores empty or junk answers as 0 without throwing", () => {
    expect(scoreSubmission("sorting", ciaTemplate.config, ciaTemplate.answer_key, {}, ctx()).result.score).toBe(0);
    expect(scoreSubmission("sorting", ciaTemplate.config, ciaTemplate.answer_key, { placements: "nope" }, ctx()).result.score).toBe(0);
    expect(scoreSubmission("sorting", ciaTemplate.config, ciaTemplate.answer_key, null, ctx()).result.score).toBe(0);
  });
  it("shuffles cards per student but keeps the same order for the same student", () => {
    const a = publicView("sorting", ciaTemplate.config, "1111111") as { cards: { id: string }[] };
    const b = publicView("sorting", ciaTemplate.config, "1111111") as { cards: { id: string }[] };
    const c = publicView("sorting", ciaTemplate.config, "2222222") as { cards: { id: string }[] };
    expect(a.cards.map((x) => x.id)).toEqual(b.cards.map((x) => x.id));
    expect(a.cards.map((x) => x.id)).not.toEqual(c.cards.map((x) => x.id));
  });
});

describe("rating scorer", () => {
  const all = (L: number, I: number) => Object.fromEntries(["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"].map((id) => [id, { habit: "Sometimes", L, I }]));
  const fifteen = "I chose this because phishing is the most common attack and multi factor stops stolen passwords working";

  it("scores a full, consistent answer 12/12", () => {
    const ratings = { ...all(2, 2), t1: { habit: "Often", L: 5, I: 5 } };
    const r = scoreSubmission("rating", riskTemplate.config, riskTemplate.answer_key, { ratings, choice: "t1", justification: fifteen }, ctx()).result;
    expect(r.score).toBe(12);
  });
  it("accepts any of several tied top risks", () => {
    const r = scoreSubmission("rating", riskTemplate.config, riskTemplate.answer_key, { ratings: all(3, 3), choice: "t6", justification: fifteen }, ctx()).result;
    expect(r.score).toBe(12);
  });
  it("gives no choice points when the choice is not the top risk", () => {
    const ratings = { ...all(2, 2), t1: { habit: "Often", L: 5, I: 5 } };
    const r = scoreSubmission("rating", riskTemplate.config, riskTemplate.answer_key, { ratings, choice: "t2", justification: "too short" }, ctx()).result;
    expect(r.score).toBe(8);
  });
  it("gives no choice points until every item is rated", () => {
    const r = scoreSubmission("rating", riskTemplate.config, riskTemplate.answer_key, { ratings: { t1: { habit: "Often", L: 5, I: 5 } }, choice: "t1" }, ctx()).result;
    expect(r.score).toBe(1);
  });
  it("rejects out-of-scale ratings and unknown habits", () => {
    const r = scoreSubmission("rating", riskTemplate.config, riskTemplate.answer_key, { ratings: { t1: { habit: "Always", L: 3, I: 3 }, t2: { habit: "Never", L: 6, I: 1 }, t3: { habit: "Never", L: "4", I: "2" } } }, ctx()).result;
    expect(r.score).toBe(1); // only t3 counts; string numbers are accepted
  });
});

describe("calculation and choice scorer (FR-26)", () => {
  const cfg = passwordTemplate.config as Parameters<typeof questionVars>[0] extends infer Q ? { numeric: Q[] } : never;
  const key = passwordTemplate.answer_key as { numeric: Record<string, { formula: string }>; pairs: Record<string, { correct: "a" | "b" }> };

  const perfectFor = (index: string) => ({
    calc: Object.fromEntries(cfg.numeric.map((q) => [q.id, String(evaluate(key.numeric[q.id].formula, questionVars(q, index)))])),
    pairs: Object.fromEntries(Object.entries(key.pairs).map(([id, p]) => [id, p.correct])),
  });

  it("scores a perfect answer 12/12 for several students", () => {
    for (const idx of ["1234567", "7654321", "0000001"]) {
      const r = scoreSubmission("calc_choice", passwordTemplate.config, passwordTemplate.answer_key, perfectFor(idx), { index: idx, reveal: false }).result;
      expect(r.score).toBe(12);
    }
  });
  it("gives neighbours different numbers but the same student the same numbers", () => {
    const views = ["1234567", "1234568", "1234569", "1234570"].map((i) => JSON.stringify(publicView("calc_choice", passwordTemplate.config, i)));
    expect(new Set(views).size).toBeGreaterThan(1);
    expect(JSON.stringify(publicView("calc_choice", passwordTemplate.config, "1234567"))).toBe(views[0]);
  });
  it("a neighbour's answers do not score full marks on the calculations", () => {
    const a = perfectFor("1234567");
    let full = 0;
    for (const other of ["2000001", "3000002", "4000003", "5000004", "6000005"]) {
      const r = scoreSubmission("calc_choice", passwordTemplate.config, passwordTemplate.answer_key, a, { index: other, reveal: false }).result;
      if (r.sections[0].items.every((i) => i.ok)) full++;
    }
    expect(full).toBeLessThan(5);
  });
  it("applies absolute and relative tolerance", () => {
    expect(withinTolerance(52.0, 52.44, { abs: 0.5 })).toBe(true);
    expect(withinTolerance(51.9, 52.44, { abs: 0.5 })).toBe(false);
    expect(withinTolerance(104, 100, { rel: 0.05 })).toBe(true);
    expect(withinTolerance(106, 100, { rel: 0.05 })).toBe(false);
    expect(withinTolerance(NaN, 100, { rel: 0.05 })).toBe(false);
  });
  it("parses the ways students type numbers", () => {
    expect(parseNumber("52,4")).toBe(52.4);
    expect(parseNumber("1,000,000")).toBe(1_000_000);
    expect(parseNumber("1.2e9")).toBe(1.2e9);
    expect(parseNumber("1.2 x 10^9")).toBe(1.2e9);
    expect(parseNumber("abc")).toBeNaN();
    expect(parseNumber("")).toBeNaN();
  });
  it("shows the correct value only on the last attempt", () => {
    const r1 = scoreSubmission("calc_choice", passwordTemplate.config, passwordTemplate.answer_key, {}, ctx(false)).result;
    expect(r1.sections.flatMap((s) => s.items).every((i) => !i.expected)).toBe(true);
    const r2 = scoreSubmission("calc_choice", passwordTemplate.config, passwordTemplate.answer_key, {}, ctx(true)).result;
    expect(r2.sections.flatMap((s) => s.items).every((i) => !!i.expected)).toBe(true);
  });
});

it("every registered type has the full module contract (NF-13)", () => {
  for (const t of Object.values(ACTIVITY_TYPES)) {
    for (const k of ["configSchema", "keySchema", "answersSchema", "view", "score", "maxScore", "describe", "validate"]) {
      expect(t).toHaveProperty(k);
    }
  }
});

describe("short answer & fill-in scorer", () => {
  it("scores exact, keyword, and min-words questions and hides answers until reveal", () => {
    const perfect = {
      responses: {
        q1: "  confidentiality  ",
        q2: "Turn on MFA for every login",
        q3: "If one website is breached attackers can reuse the same stolen password on other accounts",
      },
    };
    const r = scoreSubmission("short_answer", shortAnswerTemplate.config, shortAnswerTemplate.answer_key, perfect, ctx(false)).result;
    expect(r.score).toBe(5);
    expect(r.max).toBe(5);
    expect(r.sections[0].items.every((i) => i.ok && i.expected === undefined)).toBe(true);

    const wrong = scoreSubmission("short_answer", shortAnswerTemplate.config, shortAnswerTemplate.answer_key, { responses: { q1: "Integrity", q2: "password", q3: "too short" } }, ctx(true)).result;
    expect(wrong.score).toBe(0);
    expect(wrong.sections[0].items.every((i) => !i.ok && typeof i.expected === "string")).toBe(true);
  });

  it("supports case-sensitive exact checks and all-keyword matching", () => {
    const cfg = {
      questions: [
        { id: "a", prompt: "Type HTTP in uppercase", multiline: false },
        { id: "b", prompt: "Mention both TLS and HTTPS", multiline: true },
      ],
    };
    const key = {
      questions: {
        a: { mode: "exact", accepted: ["HTTP"], caseSensitive: true, points: 2 },
        b: { mode: "keywords", keywords: ["TLS", "HTTPS"], match: "all", points: 3 },
      },
    };
    expect(scoreSubmission("short_answer", cfg, key, { responses: { a: "http", b: "Use TLS" } }, ctx()).result.score).toBe(0);
    expect(scoreSubmission("short_answer", cfg, key, { responses: { a: "HTTP", b: "HTTPS runs over TLS" } }, ctx()).result.score).toBe(5);
  });

  it("never leaks accepted answers or keywords in the public view", () => {
    const json = JSON.stringify(publicView("short_answer", shortAnswerTemplate.config, IDX));
    expect(json).not.toContain("accepted");
    expect(json).not.toContain("keywords");
    expect(json).not.toContain("Confidentiality");
  });
});

describe("composite (multi-type) activity scorer", () => {
  const mixedConfig = {
    parts: [
      { id: "p_sort", type: "sorting", title: "Part A: Sort", instructions: "Sort these", config: BLANKS.sorting.config },
      { id: "p_calc", type: "calc_choice", title: "Part B: Calculate", instructions: "", config: BLANKS.calc_choice.config },
      { id: "p_rate", type: "rating", title: "Part C: Rate", instructions: "", config: BLANKS.rating.config },
      { id: "p_text", type: "short_answer", title: "Part D: Fill-in", instructions: "", config: BLANKS.short_answer.config },
    ],
  };
  const mixedKey = {
    parts: {
      p_sort: BLANKS.sorting.answer_key,
      p_calc: BLANKS.calc_choice.answer_key,
      p_rate: BLANKS.rating.answer_key,
      p_text: BLANKS.short_answer.answer_key,
    },
  };

  it("parses, sums maxScore across all parts, and summarizes included types", () => {
    const parsed = parseActivity("composite", mixedConfig, mixedKey);
    // sorting(1) + calc_choice(1) + rating(2*1 + 3 = 5) + short_answer(1) = 8
    expect(parsed.maxScore).toBe(8);
    expect(activityTypeSummary("composite", mixedConfig)).toBe(
      "Sorting + Calculation and choice + Rating + Short answer & fill-in",
    );
  });

  it("never leaks answer keys in the public view", () => {
    const json = JSON.stringify(publicView("composite", mixedConfig, IDX));
    expect(json).not.toContain("formula");
    expect(json).not.toContain("tolerance");
    expect(json).not.toContain("accepted");
    expect(json).not.toContain("choiceMatchesTop");
    expect(json).not.toContain("Availability");
  });

  it("scores a full multi-type submission accurately using deterministic per-part seeding", () => {
    const view = publicView("composite", mixedConfig, IDX) as {
      parts: { id: string; view: { numeric?: { id: string; text: string }[] } }[];
    };
    const calcPrompt = view.parts.find((p) => p.id === "p_calc")!.view.numeric![0].text;
    const m = calcPrompt.match(/What is (\d+) \+ (\d+)\?/);
    expect(m).toBeTruthy();
    const sum = String(Number(m![1]) + Number(m![2]));

    const answers = {
      parts: {
        p_sort: { placements: { k01: { category: "x" } } },
        p_calc: { calc: { q1: sum } },
        p_rate: { ratings: { t1: { L: 5, I: 5 }, t2: { L: 1, I: 1 } }, choice: "t1" },
        p_text: { responses: { q1: "availability" } },
      },
    };
    const scored = scoreSubmission("composite", mixedConfig, mixedKey, answers, ctx(false));
    expect(scored.result.score).toBe(8);
    expect(scored.result.max).toBe(8);
    expect(scored.result.sections.length).toBeGreaterThanOrEqual(4);

    const desc = describeAnswers("composite", mixedConfig, scored.answers);
    expect(desc).toContain("Part 1: Part A: Sort");
    expect(desc).toContain("q1=availability");
  });

  it("rejects invalid inner part config or missing part answer keys", () => {
    const missingKey = { parts: { p_sort: BLANKS.sorting.answer_key } };
    expect(() => parseActivity("composite", mixedConfig, missingKey)).toThrow(/missing answer key/);
  });

  it("scores empty or junk composite answers as 0 without throwing", () => {
    expect(scoreSubmission("composite", mixedConfig, mixedKey, {}, ctx()).result.score).toBe(0);
    expect(scoreSubmission("composite", mixedConfig, mixedKey, { parts: { p_sort: "bad" } }, ctx()).result.score).toBe(0);
  });
});
