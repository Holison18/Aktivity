"use client";
// Student flow (SRS 5.2): Login -> (Register) -> Location check -> This week -> Activity -> Result.
import { useCallback, useEffect, useRef, useState } from "react";
import { Arrow, BrandIcon, Busy, Countdown, Progress, Spinner, Stat } from "./ui";
import { RENDERERS } from "./activities/renderers";
import { ResultView } from "./ResultView";
import type { ScoreResult } from "@/lib/activities/types";
import { clearDraft, getJson, getPosition, loadDraft, post, posFields, saveDraft, serverNow, syncClock, type ApiError, type PosResult } from "@/lib/client/runtime";

export type WeekProps = {
  token: string;
  weekId: string;
  number: number;
  title: string;
  className: string;
  opensAt: string;
  closesAt: string;
  state: "unpublished" | "before" | "open" | "closed";
  geofenceEnabled: boolean;
  serverNow: number;
  hasSession?: boolean;
};

type WeekData = {
  serverNow: number;
  student: { index: string; name: string };
  week: { id: string; number: number; title: string; opensAt: string; closesAt: string; state: WeekProps["state"]; geofenceEnabled: boolean; maxAccuracyM: number };
  activities: { id: string; position: number; title: string; type: string; maxScore: number; maxAttempts: number; attemptsUsed: number; attemptsLeft: number; best: number | null; flagged: boolean; status: string }[];
  past: { week: number; weekTitle: string; title: string; best: number; max: number }[];
};

type Started = {
  activity: { id: string; type: string; title: string; instructions: string; maxScore: number; view: unknown };
  attemptNo: number;
  maxAttempts: number;
  ticket: string;
};

type Submitted = { attemptNo: number; score: number; maxScore: number; result: ScoreResult; flagged: boolean; attemptsLeft: number; best: number | null };

type Screen = "boot" | "login" | "register" | "locate" | "week" | "activity" | "result";
type Pending = { kind: "login" } | { kind: "start"; activityId: string };
type LocState = { status: "intro" | "checking" | "denied"; reason?: string; distanceM?: number | null; accuracyM?: number | null };

const ACCRA_FMT = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Accra", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const fmt = (iso: string) => ACCRA_FMT.format(new Date(iso));

const DENIAL_TEXT: Record<string, { title: string; body: string }> = {
  outside: { title: "You are outside the class area", body: "Move into the classroom, then check again." },
  low_accuracy: { title: "Your location is not precise enough", body: "Turn on precise location and Wi-Fi, step near a window or away from thick walls, then check again." },
  permission_denied: { title: "Location permission is off", body: "Allow location for this site in your browser settings (the lock or ⓘ icon next to the address), then check again." },
  no_position: { title: "Your location could not be read", body: "Turn on location services on your device, then check again." },
};

export default function StudentApp(props: WeekProps) {
  // Skip the boot loading round-trip when the server already verified there is no session cookie for this week.
  const [screen, setScreen] = useState<Screen>(props.hasSession === false ? "login" : "boot");
  const [index, setIndex] = useState("");
  const [reg, setReg] = useState({ indexConfirm: "", name: "", classCode: "" });
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loc, setLoc] = useState<LocState>({ status: "intro" });
  const [pending, setPending] = useState<Pending>({ kind: "login" });
  const [week, setWeek] = useState<WeekData | null>(null);
  const [started, setStarted] = useState<Started | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitState, setSubmitState] = useState<{ status: "idle" | "sending" | "error"; retry?: number; message?: string }>({ status: "idle" });
  const [confirmIncomplete, setConfirmIncomplete] = useState(false);
  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  const lastPos = useRef<PosResult | null>(null);
  const submitting = useRef(false);

  // First clock offset from the server render; refined by every /api/s/week response (NF-12).
  useEffect(() => {
    const t = Date.now();
    syncClock(props.serverNow, t, t);
  }, [props.serverNow]);

  const loadWeek = useCallback(async (): Promise<WeekData | null> => {
    const r = await getJson<WeekData>("/api/s/week");
    if (r.ok && r.data.week.id === props.weekId) {
      syncClock(r.data.serverNow, r.sentAt, r.receivedAt);
      setWeek(r.data);
      return r.data;
    }
    return null;
  }, [props.weekId]);

  // Boot: resume an existing session for this week when a session cookie exists; otherwise login is already shown.
  useEffect(() => {
    if (props.hasSession === false) return;
    let alive = true;
    getJson<WeekData>("/api/s/week").then((r) => {
      if (!alive) return;
      if (r.ok && r.data.week.id === props.weekId) {
        syncClock(r.data.serverNow, r.sentAt, r.receivedAt);
        setWeek(r.data);
        setScreen("week");
      } else setScreen("login");
    });
    return () => {
      alive = false;
    };
  }, [props.weekId, props.hasSession]);

  // Keep the closing time fresh so an extension or early close shows up (FR-10).
  // Pauses while the tab is hidden or the week is already closed, and uses chained timeouts to avoid overlapping requests.
  const weekStateValue = week?.week.state;
  useEffect(() => {
    if (screen !== "week" && screen !== "activity" && screen !== "result") return;
    if (weekStateValue === "closed") return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (!alive || document.hidden) return;
      timer = setTimeout(async () => {
        if (!alive || document.hidden) return;
        const w = await loadWeek();
        if (!alive) return;
        if (!w && screen === "week") {
          setScreen("login");
          return;
        }
        schedule();
      }, 20_000);
    };

    const onVisibility = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (!document.hidden && alive) {
        loadWeek().then((w) => {
          if (!alive) return;
          if (!w && screen === "week") setScreen("login");
          else schedule();
        });
      }
    };

    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [screen, weekStateValue, loadWeek]);

  const needsLocation = (w?: WeekData | null) =>
    w
      ? w.week.geofenceEnabled && w.week.state === "open"
      : props.geofenceEnabled && props.state !== "unpublished" && serverNow() >= Date.parse(props.opensAt) && serverNow() < Date.parse(props.closesAt);

  // --------------------------------------------------------------- location
  function handleDenial(d: ApiError, p: Pending) {
    setPending(p);
    setLoc({ status: "denied", reason: d.reason, distanceM: d.distanceM, accuracyM: d.accuracyM });
    setScreen("locate");
  }

  async function checkLocationThen(p: Pending, forceFresh = false) {
    setPending(p);
    setLoc({ status: "checking" });
    setScreen("locate");
    // Reuse a fresh reading (<30s) when transitioning straight from sign-in to Start activity,
    // avoiding a second 3-15s indoor GPS cold fix. Retries after denial always force a fresh reading.
    const maxAgeMs = !forceFresh && p.kind === "start" ? 30_000 : 0;
    const r = await getPosition(maxAgeMs);
    lastPos.current = r;
    if (p.kind === "login") await doLogin(r);
    else await doStart(p.activityId, r);
  }

  // ------------------------------------------------------------------ login
  async function doLogin(pos: PosResult | null, withRegister = registering) {
    setBusy(true);
    setError(null);
    const r = await post<{ status: "ok" | "register" }>("/api/s/login", {
      token: props.token,
      index,
      ...posFields(pos),
      register: withRegister ? reg : undefined,
    });
    setBusy(false);
    if (r.ok && r.data.status === "register") {
      setRegistering(true);
      setReg((x) => ({ ...x, indexConfirm: "" }));
      setScreen("register");
      return;
    }
    if (r.ok) {
      const w = await loadWeek();
      setScreen(w ? "week" : "login");
      if (!w) setError("Signed in, but the week could not be loaded. Reload the page.");
      return;
    }
    if (r.data.error === "location") {
      if (r.data.reason === "no_position" && !pos) {
        // Show the intro prompt instead of calling getCurrentPosition after await (iOS blocks geolocation without a direct tap).
        setPending({ kind: "login" });
        setLoc({ status: "intro" });
        setScreen("locate");
        return;
      }
      return handleDenial(r.data, { kind: "login" });
    }
    setError(r.data.message ?? "Something went wrong. Try again.");
    setScreen(withRegister ? "register" : "login");
  }

  function onLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!index.trim()) return setError("Type your index or reference number.");
    if (needsLocation()) {
      setPending({ kind: "login" });
      setLoc({ status: "intro" });
      setScreen("locate");
    } else doLogin(null, false);
  }

  async function onRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reg.indexConfirm.trim() || !reg.name.trim() || !reg.classCode.trim()) return setError("Fill in all three fields.");
    const pos = needsLocation() ? await getPosition(120_000) : null;
    await doLogin(pos, true);
  }

  // ------------------------------------------------------------------ start
  async function doStart(activityId: string, pos: PosResult | null) {
    setBusy(true);
    setError(null);
    const r = await post<Started>("/api/s/start", { activityId, ...posFields(pos) });
    setBusy(false);
    if (r.ok) {
      setStarted(r.data);
      const draftKey = `sap:${activityId}:${r.data.attemptNo}:${week?.student.index ?? index}`;
      setAnswers(loadDraft<Record<string, unknown>>(draftKey) ?? {});
      setSubmitState({ status: "idle" });
      setConfirmIncomplete(false);
      setScreen("activity");
      window.scrollTo({ top: 0 });
      return;
    }
    if (r.data.error === "location") return handleDenial(r.data, { kind: "start", activityId });
    if (r.status === 401) {
      setScreen("login");
      setError(r.data.message ?? "Sign in again.");
      return;
    }
    setScreen("week");
    setError(r.data.message ?? "Could not start the activity.");
    loadWeek();
  }

  function onStart(activityId: string) {
    if (week?.week.geofenceEnabled) checkLocationThen({ kind: "start", activityId });
    else {
      // Remember which activity is starting so its button shows the spinner while the server answers.
      setPending({ kind: "start", activityId });
      doStart(activityId, null);
    }
  }
  const isStarting = (activityId: string) => busy && pending.kind === "start" && pending.activityId === activityId;

  // ----------------------------------------------------------------- submit
  const draftKey = started ? `sap:${started.activity.id}:${started.attemptNo}:${week?.student.index ?? index}` : "";

  function updateAnswers(next: Record<string, unknown>) {
    setAnswers(next);
    if (draftKey) saveDraft(draftKey, next);
    setConfirmIncomplete(false);
  }

  const submit = useCallback(
    async (auto: boolean) => {
      if (!started || submitting.current) return;
      submitting.current = true;
      setSubmitState({ status: "sending" });
      // Location is re-checked with a fresh reading at submit; submissions outside the radius are blocked.
      const pos = week?.week.geofenceEnabled ? await getPosition(0, 10_000) : null;
      const r = await post<Submitted>(
        "/api/s/submit",
        { activityId: started.activity.id, ticket: started.ticket, answers, auto, ...posFields(pos) },
        { retries: 6, onRetry: (n) => setSubmitState({ status: "sending", retry: n }) },
      );
      submitting.current = false;
      if (r.ok) {
        clearDraft(draftKey);
        setSubmitted(r.data);
        setSubmitState({ status: "idle" });
        setScreen("result");
        window.scrollTo({ top: 0 });
        loadWeek();
        return;
      }
      if (r.data.error === "location") {
        const info = DENIAL_TEXT[r.data.reason ?? "no_position"];
        let detail = info ? `${info.title}. ${info.body}` : "You must be inside the allowed class area to submit.";
        if (r.data.reason === "outside" && r.data.distanceM != null) {
          detail = `You are outside the class area (about ${r.data.distanceM.toLocaleString("en-GB")} m from the centre). Move into the classroom, then try submitting again.`;
        } else if (r.data.reason === "low_accuracy" && r.data.accuracyM != null) {
          detail = `Your location is not precise enough (±${r.data.accuracyM} m). ${info?.body ?? "Try again."}`;
        }
        setSubmitState({
          status: "error",
          message: `${detail} Your answers are still kept on this device.`,
        });
        return;
      }
      setSubmitState({ status: "error", message: r.data.message ?? "Your answers were not saved yet. They are kept on this device. Try again." });
    },
    [started, answers, week, draftKey, loadWeek],
  );

  // ----------------------------------------------------------------- render
  const closesAt = week ? Date.parse(week.week.closesAt) : Date.parse(props.closesAt);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-24 pt-6 sm:px-8 sm:pt-10">
      <header className="mb-10 flex items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <BrandIcon size={26} />
          <span className="truncate text-sm font-semibold text-ink">{props.className}</span>
        </div>
        {week && screen !== "boot" && (
          <button className="btn-link text-sm" onClick={async () => { await post("/api/s/logout", {}); setWeek(null); setIndex(""); setRegistering(false); setScreen("login"); }}>
            Sign out
          </button>
        )}
      </header>

      {screen === "boot" && <Spinner label="Loading…" />}

      {(screen === "login" || screen === "register") && (
        <section className="fade-in space-y-8">
          <h1 className="display text-5xl sm:text-6xl">
            Week {props.number}
            <span className="fade-line block">{props.title}</span>
          </h1>
          <WindowLine state={props.state} opensAt={props.opensAt} closesAt={props.closesAt} />

          {screen === "login" ? (
            <form onSubmit={onLoginSubmit} className="space-y-4" noValidate>
              <div>
                <label className="field-label" htmlFor="index">Index or reference number</label>
                <input id="index" className="field text-lg tracking-wide" inputMode="numeric" autoComplete="off" spellCheck={false} value={index} onChange={(e) => setIndex(e.target.value)} autoFocus />
                <p className="mt-1.5 text-sm text-muted">Use your student index number, or your reference number if you don&apos;t have one yet.</p>
              </div>
              {error && <p className="notice notice-bad" role="alert">{error}</p>}
              <button className="btn btn-primary w-full sm:w-auto" disabled={busy} aria-busy={busy}>
                <Busy busy={busy} label="Continue" busyLabel="Checking…" arrow />
              </button>
            </form>
          ) : (
            <form onSubmit={onRegisterSubmit} className="space-y-4" noValidate>
              <p className="notice">
                <strong>{index.toUpperCase()}</strong> is not registered for this class yet. Register once; next time you only need your index or reference number.
              </p>
              <div>
                <label className="field-label" htmlFor="index2">Type your index or reference number again</label>
                <input id="index2" className="field text-lg tracking-wide" inputMode="numeric" autoComplete="off" spellCheck={false} value={reg.indexConfirm} onChange={(e) => setReg({ ...reg, indexConfirm: e.target.value })} onPaste={(e) => e.preventDefault()} autoFocus />
              </div>
              <div>
                <label className="field-label" htmlFor="name">Full name</label>
                <input id="name" className="field" autoComplete="name" value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} />
              </div>
              <div>
                <label className="field-label" htmlFor="code">Class code (on the board)</label>
                <input id="code" className="field tracking-widest" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={reg.classCode} onChange={(e) => setReg({ ...reg, classCode: e.target.value })} />
              </div>
              {error && <p className="notice notice-bad" role="alert">{error}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <button className="btn btn-primary" disabled={busy} aria-busy={busy}><Busy busy={busy} label="Register and continue" busyLabel="Registering…" arrow /></button>
                <button type="button" className="btn-link" onClick={() => { setRegistering(false); setError(null); setScreen("login"); }}>Use a different number</button>
              </div>
            </form>
          )}
        </section>
      )}

      {screen === "locate" && (
        <section className="fade-in space-y-6">
          <h1 className="display text-4xl sm:text-5xl">Location check</h1>
          <div className="card-raised p-6 space-y-5">
            {loc.status === "intro" && (
              <>
                <p>
                  This week opens only <strong>inside the classroom</strong>. Your browser will now ask to share your location.
                </p>
                <PrivacyNotice />
                <button className="btn btn-primary" onClick={() => checkLocationThen(pending)}>Share my location <Arrow /></button>
              </>
            )}
            {loc.status === "checking" && <Spinner label={busy ? "Checking with the server…" : "Asking your browser for your location…"} />}
            {loc.status === "denied" && (
              <>
                <div role="alert" className="space-y-2">
                  <p className="text-ink text-xl font-medium">{DENIAL_TEXT[loc.reason ?? "no_position"]?.title ?? "Access denied"}</p>
                  {loc.reason === "outside" && loc.distanceM != null && (
                    <Stat value={`${loc.distanceM.toLocaleString("en-GB")} m`} label="Your distance from the class area" size="md" />
                  )}
                  {loc.reason === "low_accuracy" && loc.accuracyM != null && <p>Your device reported accuracy of <strong>±{loc.accuracyM} m</strong>.</p>}
                  <p>{DENIAL_TEXT[loc.reason ?? "no_position"]?.body ?? "Try again."}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button className="btn btn-primary" onClick={() => checkLocationThen(pending, true)}>Check again <Arrow /></button>
                  <button className="btn btn-secondary" onClick={() => setScreen(week ? "week" : "login")}>Back</button>
                </div>
                <p className="text-sm">Still blocked while in class? Ask your lecturer for an exception.</p>
              </>
            )}
          </div>
        </section>
      )}

      {screen === "week" && week && (
        <section className="fade-in space-y-10">
          <div className="space-y-3">
            <p className="label">Week {week.week.number} · {week.student.name}</p>
            <h1 className="display text-5xl sm:text-6xl">{week.week.title}</h1>
          </div>
          <WeekClock data={week} onChange={() => loadWeek()} />
          {error && <p className="notice notice-bad" role="alert">{error}</p>}
          <ul className="stagger grid gap-3">
            {week.activities.map((a) => (
              <li key={a.id} className="card-raised p-6">
                <div className="flex items-start justify-between gap-6">
                  <div className="space-y-1">
                    <p className="label">Activity {a.position}</p>
                    <h2 className="text-ink text-xl font-medium leading-snug">{a.title}</h2>
                    <p className="text-sm">{statusText(a)}{a.flagged ? " · flagged for review" : ""}</p>
                  </div>
                  <Stat value={a.best == null ? "–" : `${fmtNum(a.best)}`} label={`Best of ${fmtNum(a.maxScore)}`} size="md" />
                </div>
                {(a.status === "not_started" || a.status === "can_retry") && (
                  <button className="btn btn-brand mt-5" disabled={busy} aria-busy={isStarting(a.id)} onClick={() => onStart(a.id)}>
                    <Busy busy={isStarting(a.id)} label={a.status === "not_started" ? "Start activity" : `Try again (${a.attemptsLeft} left)`} busyLabel="Starting…" arrow />
                  </button>
                )}
              </li>
            ))}
            {week.activities.length === 0 && <li className="notice">No activities have been added to this week yet.</li>}
          </ul>
          {week.past.length > 0 && (
            <section className="space-y-3">
              <h2 className="label">Past weeks</h2>
              <ul className="stagger card divide-y divide-line">
                {week.past.map((p, i) => (
                  <li key={`${p.week}-${p.title}-${i}`} className="flex items-center justify-between gap-4 px-5 py-3">
                    <span>Week {p.week} · <strong>{p.title}</strong></span>
                    <span className="display text-lg tabular-nums">{fmtNum(p.best)}<span className="text-sm text-muted font-sans font-light">/{fmtNum(p.max)}</span></span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>
      )}

      {screen === "activity" && started && week && (
        <section className="fade-in space-y-8">
          <div className="sticky top-0 z-10 -mx-5 bg-paper/95 backdrop-blur sm:-mx-8">
            <div className="flex items-center justify-between gap-4 px-5 py-3 sm:px-8">
              <Countdown target={closesAt} label="Time left" size="md" onZero={() => submit(true)} />
              <ProgressPill type={started.activity.type} view={started.activity.view} value={answers} />
            </div>
            <ProgressBar type={started.activity.type} view={started.activity.view} value={answers} />
          </div>
          <div className="space-y-3">
            <p className="label">Activity · attempt {started.attemptNo} of {started.maxAttempts}</p>
            <h1 className="display text-4xl sm:text-5xl">{started.activity.title}</h1>
            <p className="whitespace-pre-line">{started.activity.instructions}</p>
          </div>
          <ActivityBody type={started.activity.type} view={started.activity.view} value={answers} onChange={updateAnswers} />
          <div className="space-y-3 border-t border-line pt-6">
            {submitState.status === "sending" && (
              <p className="notice" role="status">{submitState.retry ? `Connection problem. Retrying (${submitState.retry} of 6). Keep this page open.` : "Submitting your answers…"}</p>
            )}
            {submitState.status === "error" && <p className="notice notice-bad" role="alert">{submitState.message}</p>}
            {confirmIncomplete && <p className="notice" role="alert">Some questions have no answer yet. Submit anyway?</p>}
            <div className="flex flex-wrap gap-3">
              <button
                className="btn btn-primary"
                disabled={submitState.status === "sending"}
                aria-busy={submitState.status === "sending"}
                onClick={() => {
                  const r = RENDERERS[started.activity.type]?.progress(started.activity.view, answers);
                  if (r && r.done < r.total && !confirmIncomplete) return setConfirmIncomplete(true);
                  submit(false);
                }}
              >
                <Busy
                  busy={submitState.status === "sending"}
                  label={submitState.status === "error" ? "Try submitting again" : confirmIncomplete ? "Yes, submit now" : "Submit"}
                  busyLabel="Submitting…"
                  arrow
                />
              </button>
              <button className="btn btn-secondary" onClick={() => { setScreen("week"); }}>Back (answers are kept)</button>
            </div>
            <p className="text-sm">Your answers are saved on this device as you work. At closing time they are submitted automatically.</p>
          </div>
        </section>
      )}

      {screen === "result" && submitted && started && (
        <section className="fade-in space-y-10">
          <div className="space-y-3">
            <p className="label">{started.activity.title} · attempt {submitted.attemptNo}</p>
            <div className="score-pop flex items-end gap-3">
              <Stat value={fmtNum(submitted.score)} label={`Score out of ${fmtNum(submitted.maxScore)}`} size="xl" />
            </div>
            {submitted.best != null && submitted.best > submitted.score && <p>Your best score of <strong>{fmtNum(submitted.best)}</strong> still counts.</p>}
            {submitted.flagged && <p className="notice">Your location could not be confirmed when you submitted. Your answers are saved and your lecturer will review them.</p>}
          </div>
          <ResultView result={submitted.result} />
          <div className="flex flex-wrap gap-3 border-t border-line pt-6">
            {submitted.attemptsLeft > 0 && week?.week.state === "open" && (
              <button className="btn btn-primary" disabled={busy} aria-busy={isStarting(started.activity.id)} onClick={() => onStart(started.activity.id)}>
                <Busy busy={isStarting(started.activity.id)} label={`Try again (${submitted.attemptsLeft} left)`} busyLabel="Starting…" arrow />
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => setScreen("week")}>Back to this week</button>
          </div>
        </section>
      )}
    </main>
  );
}

function ActivityBody({ type, view, value, onChange }: { type: string; view: unknown; value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const r = RENDERERS[type];
  if (!r) return <p className="notice notice-bad">This activity type cannot be shown. Ask your lecturer.</p>;
  return <r.Component view={view} value={value} onChange={onChange} />;
}

function ProgressPill({ type, view, value }: { type: string; view: unknown; value: unknown }) {
  const r = RENDERERS[type]?.progress(view, value);
  if (!r) return null;
  return <span className="capsule px-4 py-2 text-sm text-ink tabular-nums" aria-live="polite">{r.done} / {r.total} answered</span>;
}

function ProgressBar({ type, view, value }: { type: string; view: unknown; value: unknown }) {
  const r = RENDERERS[type]?.progress(view, value);
  if (!r) return <div className="h-px bg-line" />;
  return <Progress done={r.done} total={r.total} label="Questions answered" />;
}

function WindowLine({ state, opensAt, closesAt }: { state: WeekProps["state"]; opensAt: string; closesAt: string }) {
  const text = state === "before" ? `Opens ${fmt(opensAt)}` : state === "open" ? `Open now · closes ${fmt(closesAt)}` : state === "closed" ? `Closed ${fmt(closesAt)}. Sign in to see your scores.` : "Not open yet.";
  return <p><strong>{text}</strong></p>;
}

function WeekClock({ data, onChange }: { data: WeekData; onChange: () => void }) {
  const { state, opensAt, closesAt } = data.week;
  if (state === "open") return (
    <div className="flex flex-wrap items-end gap-10">
      <Countdown target={Date.parse(closesAt)} label="Until closing" size="xl" onZero={onChange} />
      <p className="text-sm">Opened {fmt(opensAt)}<br />Closes <strong>{fmt(closesAt)}</strong></p>
    </div>
  );
  if (state === "before") return (
    <div className="flex flex-wrap items-end gap-10">
      <Countdown target={Date.parse(opensAt)} label="Until opening" size="xl" onZero={onChange} />
      <p className="text-sm">Opens <strong>{fmt(opensAt)}</strong><br />Closes {fmt(closesAt)}</p>
    </div>
  );
  return <p className="notice">This week closed on <strong>{fmt(closesAt)}</strong>. Your scores are below.</p>;
}

function statusText(a: WeekData["activities"][number]) {
  switch (a.status) {
    case "not_started": return `Not started · ${a.maxAttempts} attempt${a.maxAttempts > 1 ? "s" : ""}, best counts`;
    case "can_retry": return `${a.attemptsUsed} of ${a.maxAttempts} attempts used`;
    case "done": return a.attemptsUsed ? `Done · ${a.attemptsUsed} attempt${a.attemptsUsed > 1 ? "s" : ""}` : "Not available";
    default: return a.attemptsUsed ? `${a.attemptsUsed} attempt${a.attemptsUsed > 1 ? "s" : ""}` : "Not available now";
  }
}

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function PrivacyNotice() {
  return (
    <div className="notice text-sm space-y-1">
      <p><strong>What is collected:</strong> your position (rounded to about 11 m), its accuracy, the time, a scrambled form of your IP address and your browser type.</p>
      <p><strong>Why:</strong> to check you are in the classroom and as attendance evidence. Only your lecturer can see it.</p>
      <p><strong>How long:</strong> location records are deleted 90 days after the course ends.</p>
    </div>
  );
}
