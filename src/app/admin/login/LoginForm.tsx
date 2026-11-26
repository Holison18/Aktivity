"use client";
// Admin sign in (FR-27): email + password, then a TOTP code. First sign-in enrols an authenticator app.
import { useState } from "react";
import { browserAuth } from "@/lib/supabase/auth-browser";
import { Busy } from "@/components/ui";

type Step = "password" | "enrol" | "code";

function reasonMessage(reason?: string): string | null {
  if (reason === "not_admin") {
    return "This account is not listed as an admin. Ask the system owner to add it to the admins table.";
  }
  if (reason === "mfa_required") {
    return "Enter the 6-digit code from your authenticator app to finish signing in.";
  }
  if (reason === "signed_out") {
    return "Your session ended. Sign in again to continue.";
  }
  return null;
}

export default function LoginForm({ reason }: { reason?: string }) {
  const [step, setStep] = useState<Step>(reason === "mfa_required" ? "code" : "password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<{ svg: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(() => reasonMessage(reason));
  const [busy, setBusy] = useState(false);

  function goToDashboard() {
    // Full navigation guarantees the freshly written AAL2 cookies are sent on a clean request
    // and never races with Next.js client-router prefetch/refresh cache.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/admin");
  }

  async function afterPassword(): Promise<boolean> {
    const supa = browserAuth();
    const { data: aal } = await supa.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal2") {
      goToDashboard();
      return true;
    }
    const { data: factors, error: fErr } = await supa.auth.mfa.listFactors();
    if (fErr) throw fErr;
    const totp = factors?.totp?.find((f) => f.status === "verified");
    if (totp) {
      setFactorId(totp.id);
      setStep("code");
      return false;
    }
    // Clean up unfinished enrolments, then enrol a new authenticator.
    for (const f of factors?.all ?? []) if (f.status === "unverified") await supa.auth.mfa.unenroll({ factorId: f.id });
    const { data, error: enrollErr } = await supa.auth.mfa.enroll({ factorType: "totp", friendlyName: `Console ${new Date().toISOString().slice(0, 10)}` });
    if (enrollErr) throw enrollErr;
    setFactorId(data.id);
    setQr({ svg: data.totp.qr_code, secret: data.totp.secret });
    setStep("enrol");
    return false;
  }

  async function onPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    let navigating = false;
    try {
      const { error: signInErr } = await browserAuth().auth.signInWithPassword({ email: email.trim(), password });
      if (signInErr) throw new Error("Email or password is wrong. Check them and try again.");
      navigating = await afterPassword();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (!navigating) setBusy(false);
    }
  }

  async function onCode(e: React.FormEvent) {
    e.preventDefault();
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError(null);
    let navigating = false;
    try {
      const supa = browserAuth();
      let id = factorId;
      if (!id) {
        const { data, error: listErr } = await supa.auth.mfa.listFactors();
        if (listErr) {
          setStep("password");
          throw new Error("Your sign-in session expired. Sign in with your email and password again.");
        }
        id = data?.totp?.find((f) => f.status === "verified")?.id ?? null;
        if (!id) {
          // Signed in with a password but no authenticator yet: enrol one now.
          const { data: u } = await supa.auth.getUser();
          if (!u.user) {
            setStep("password");
            throw new Error("Sign in with your email and password first.");
          }
          navigating = await afterPassword();
          return;
        }
      }
      const { error: verifyErr } = await supa.auth.mfa.challengeAndVerify({ factorId: id, code: digits });
      if (verifyErr) {
        const msg = verifyErr.message?.toLowerCase() ?? "";
        if (msg.includes("invalid") || msg.includes("totp") || msg.includes("code") || msg.includes("expired")) {
          throw new Error("That code did not work. Codes change every 30 seconds; type the current one.");
        }
        throw new Error(verifyErr.message || "Verification failed. Try again.");
      }
      // Confirm the upgraded AAL2 session is persisted before navigating to the server-checked dashboard.
      const { data: aal } = await supa.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel !== "aal2") {
        await supa.auth.refreshSession();
      }
      navigating = true;
      goToDashboard();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (!navigating) setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {step === "password" && (
        <form onSubmit={onPassword} className="space-y-4">
          <div>
            <label className="field-label" htmlFor="email">Email</label>
            <input id="email" type="email" className="field" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="field-label" htmlFor="password">Password</label>
            <input id="password" type="password" className="field" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="notice notice-bad" role="alert">{error}</p>}
          <button className="btn btn-primary" disabled={busy} aria-busy={busy}><Busy busy={busy} label="Continue" busyLabel="Signing in…" arrow /></button>
        </form>
      )}

      {(step === "enrol" || step === "code") && (
        <form onSubmit={onCode} className="space-y-4">
          {step === "enrol" && qr && (
            <div className="card p-5 space-y-3">
              <p><strong>Set up multi-factor authentication.</strong> Scan this code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password), then type the 6-digit code it shows.</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr.svg.startsWith("data:") ? qr.svg : `data:image/svg+xml;utf-8,${encodeURIComponent(qr.svg)}`} alt="QR code for your authenticator app" width={180} height={180} className="rounded-xl border border-line bg-paper p-2" />
              <details className="text-sm">
                <summary className="cursor-pointer">Cannot scan? Enter the key by hand</summary>
                <code className="mt-2 block break-all rounded-lg bg-fill p-2 text-ink">{qr.secret}</code>
              </details>
            </div>
          )}
          <div>
            <label className="field-label" htmlFor="code">6-digit code from your authenticator app</label>
            <input
              id="code"
              className="field max-w-[12rem] text-xl tracking-[0.3em] tabular-nums"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={9}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
            />
          </div>
          {error && <p className="notice notice-bad" role="alert">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-primary" disabled={busy} aria-busy={busy}><Busy busy={busy} label="Verify and sign in" busyLabel="Checking…" arrow /></button>
            <button
              type="button"
              className="btn-link text-sm"
              disabled={busy}
              onClick={() => {
                setStep("password");
                setCode("");
                setFactorId(null);
                setQr(null);
                setError(null);
              }}
            >
              Start over
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
