"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/app/admin/actions";

/** Runs a server action, keeps its error for display, and lets the action's revalidatePath refresh the view. */
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ message: string; issues?: string[] } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function run<T extends object>(fn: () => Promise<ActionResult<T>>, opts: { success?: string; onOk?: (r: { ok: true } & T) => void; refresh?: boolean } = {}) {
    setError(null);
    setDone(null);
    start(async () => {
      const r = await fn();
      if (r.ok) {
        if (opts.success) setDone(opts.success);
        opts.onOk?.(r);
        // Server actions already call revalidatePath, which returns updated RSC data in the action response.
        // Only trigger an extra router.refresh() when explicitly requested.
        if (opts.refresh === true) router.refresh();
      } else setError({ message: r.error, issues: r.issues });
    });
  }

  const feedback = (
    <>
      {error && (
        <div className="notice notice-bad" role="alert">
          <p>{error.message}</p>
          {error.issues && (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {error.issues.slice(0, 20).map((i) => <li key={i}>{i}</li>)}
            </ul>
          )}
        </div>
      )}
      {done && <p className="notice" role="status">{done}</p>}
    </>
  );

  return { run, pending, error, feedback };
}
