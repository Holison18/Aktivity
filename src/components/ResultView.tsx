import type { ScoreResult } from "@/lib/activities/types";

/** Per-item feedback with reasons (SRS 5.2 Result screen). Green/red marks always carry a text label (UI-08). */
export function ResultView({ result }: { result: ScoreResult }) {
  return (
    <div className="space-y-8">
      {result.notes?.map((n, idx) => (
        <p key={`${n}-${idx}`} className="notice">{n}</p>
      ))}
      {result.sections.map((s, idx) => (
        <section key={`${s.title}-${idx}`} className="space-y-3">
          <h3 className="label">{s.title}</h3>
          <ul className="stagger space-y-2">
            {s.items.map((it) => (
              <li key={it.id} className="card p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-ink font-normal leading-snug">{it.label}</p>
                  <span className="shrink-0 text-right">
                    <span className="display text-xl tabular-nums">{it.points}</span>
                    <span className="text-sm">/{it.maxPoints}</span>
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className={it.ok ? "mark-ok" : "mark-bad"}>{it.ok ? "Correct" : "Not correct"}</span>
                  {it.given && <span>You gave: <strong>{it.given}</strong></span>}
                  {it.expected && !it.ok && <span>Answer: <strong>{it.expected}</strong></span>}
                </div>
                {it.why && <p className="mt-2 text-sm">{it.why}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
