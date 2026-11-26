import Link from "next/link";
import { APP_NAME } from "@/lib/env";
import { ArrowUpRight, BrandMark } from "@/components/ui";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/">
            <BrandMark name={APP_NAME} />
          </Link>
          <div className="cta-pair">
            <Link href="/admin" className="btn btn-dark btn-sm">Lecturer sign in</Link>
            <Link href="/admin" className="btn btn-dark btn-sm btn-icon" aria-label="Open lecturer console">
              <ArrowUpRight />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-12 px-5 py-14 sm:px-8 sm:py-20">
        <section className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <h1 className="display text-4xl sm:text-5xl lg:text-6xl">
              Verified in-class{" "}
              <span className="fade-line block">activities & scoring</span>
            </h1>
            <p className="max-w-lg text-base">
              <strong>Students:</strong> open the <strong>week link</strong> shared in class. Sign in with your{" "}
              <strong>index number</strong> and, on your first session, the <strong>class code</strong> shown on the board.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <div className="cta-pair">
                <Link href="/admin" className="btn btn-primary">Open lecturer console</Link>
                <Link href="/admin" className="btn btn-primary btn-icon" aria-label="Go to lecturer console">
                  <ArrowUpRight />
                </Link>
              </div>
              <span className="badge badge-blue">Geofenced · Accra time</span>
            </div>
          </div>

          <div className="surface-soft relative overflow-hidden p-6 sm:p-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-14 -right-12 h-48 w-48 rounded-full bg-[#f7dc6f]/75"
            />
            <div className="relative space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="badge badge-gold">In-Class Session</span>
                <span className="inline-flex items-center rounded-full bg-[#1f7cff] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm">
                  Geofence active
                </span>
              </div>

              <div className="card-raised p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">Classroom check</span>
                  <span className="badge badge-ok">Inside 100 m</span>
                </div>
                <p className="text-ink font-semibold">Location & time window verified</p>
                <p className="text-sm">Submissions outside the configured radius are automatically blocked.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="card p-4 space-y-2.5">
                  <span className="text-xs font-medium text-muted">Submission progress</span>
                  <div className="flex flex-col gap-1">
                    <span className="display text-2xl">100%</span>
                    <span className="text-xs font-semibold text-[#1f7cff]">Auto-graded</span>
                  </div>
                  <div className="progress">
                    <span style={{ transform: "scaleX(0.78)" }} />
                  </div>
                </div>
                <div className="card p-4 space-y-2">
                  <span className="text-xs font-medium text-muted">Export ready</span>
                  <p className="display text-2xl">4 sheets</p>
                  <p className="text-xs text-muted">Summary, attempts, answers & logs</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="surface-soft grid gap-6 px-6 py-6 sm:grid-cols-3 sm:divide-x sm:divide-line">
          <div className="sm:px-4 first:sm:pl-0">
            <p className="display text-2xl text-ink">Geofenced</p>
            <p className="mt-1 text-sm">Auto-detect classroom location and block out-of-radius submissions.</p>
          </div>
          <div className="sm:px-6">
            <p className="display text-2xl text-ink">Timed</p>
            <p className="mt-1 text-sm">Scheduled Accra-time windows with live extensions and auto-submit.</p>
          </div>
          <div className="sm:px-6">
            <p className="display text-2xl text-ink">Instant</p>
            <p className="mt-1 text-sm">Immediate student feedback, live results table, and Excel export.</p>
          </div>
        </section>
      </main>

      <footer className="bg-[#161719] text-[#a6aab2]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm sm:px-8">
          <BrandMark name={APP_NAME} size="sm" inverted />
          <span>Weekly class activities & verified attendance</span>
        </div>
      </footer>
    </div>
  );
}
