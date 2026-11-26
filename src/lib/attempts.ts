// Attempt limits and best-score rule (FR-25, AR-4, NF-11). Pure functions.

export type AttemptRow = { attempt_no: number; score: number | string; max_score: number | string };

/** The attempt number the next start would get, or null when no attempts are left. */
export function nextAttemptNo(usedAttempts: number, maxAttempts: number): number | null {
  return usedAttempts < maxAttempts ? usedAttempts + 1 : null;
}

export function attemptsLeft(usedAttempts: number, maxAttempts: number): number {
  return Math.max(0, maxAttempts - usedAttempts);
}

/** The best score counts (FR-25). Returns null when there are no attempts. */
export function bestScore(rows: AttemptRow[]): number | null {
  if (!rows.length) return null;
  return Math.max(...rows.map((r) => Number(r.score)));
}

/**
 * Decides what to do with a submission for `attemptNo` given the attempts already saved.
 * - "duplicate": that attempt was already saved (double tap or retry) -> return the saved result.
 * - "accept": the next attempt in sequence, within the limit.
 * - "reject": skipping ahead, or over the limit.
 */
export function submissionDecision(
  attemptNo: number,
  savedAttemptNos: number[],
  maxAttempts: number,
): "duplicate" | "accept" | "reject" {
  if (savedAttemptNos.includes(attemptNo)) return "duplicate";
  if (!Number.isInteger(attemptNo) || attemptNo < 1 || attemptNo > maxAttempts) return "reject";
  return attemptNo === savedAttemptNos.length + 1 ? "accept" : "reject";
}
