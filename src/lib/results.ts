// Totals shared by the live results table (FR-32) and the Excel Summary sheet (FR-34),
// so both always show the same numbers (AC-6).

export type ActivityMeta = { id: string; position: number; title: string; max_score: number | string; week_number?: number };
export type Best = { best: number | string; attempts: number; flagged: boolean };

export type Totals = { total: number; max: number; pct: number | null };

/** Total = sum of best score per activity; max = sum of activity max scores. */
export function totals(activities: ActivityMeta[], bestByActivity: Record<string, Best | undefined>): Totals {
  let total = 0;
  let max = 0;
  for (const a of activities) {
    max += Number(a.max_score);
    const b = bestByActivity[a.id];
    if (b) total += Number(b.best);
  }
  return { total: round1(total), max: round1(max), pct: max > 0 ? round1((total / max) * 100) : null };
}

/** Best score per (student, activity) from raw attempt rows. */
export function bestFromAttempts(attempts: { activity_id: string; index_number: string; score: number | string; flagged: boolean }[]) {
  const map = new Map<string, Record<string, Best>>();
  for (const t of attempts) {
    const per = map.get(t.index_number) ?? {};
    const cur = per[t.activity_id];
    per[t.activity_id] = {
      best: cur ? Math.max(Number(cur.best), Number(t.score)) : Number(t.score),
      attempts: (cur?.attempts ?? 0) + 1,
      flagged: (cur?.flagged ?? false) || t.flagged,
    };
    map.set(t.index_number, per);
  }
  return map;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
