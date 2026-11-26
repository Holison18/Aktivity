// The week link (FR-01, FR-29). It opens the sign-in page only; window, geofence and class code
// still apply to everyone who opens it (SRS 6.1). No activity content is rendered here (FR-08).
import type { Metadata } from "next";
import { cookies } from "next/headers";
import StudentApp from "@/components/StudentApp";
import { verifyStudentCookie, weekByToken } from "@/lib/server/student";
import { SESSION_COOKIE } from "@/lib/tokens";
import { windowState } from "@/lib/window";
import { requestTime } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in" };

export default async function WeekLinkPage(props: PageProps<"/w/[token]">) {
  const [{ token }, cookieStore] = await Promise.all([props.params, cookies()]);
  const week = /^[A-Za-z0-9]{12,64}$/.test(token) ? await weekByToken(token) : null;

  if (!week) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pt-16 sm:px-8">
        <h1 className="display text-5xl">Link not valid</h1>
        <p className="mt-6">This week link does not work. It may have been replaced. <strong>Ask your lecturer for the current link.</strong></p>
      </main>
    );
  }

  const session = verifyStudentCookie(cookieStore.get(SESSION_COOKIE)?.value);
  const hasSession = Boolean(session && session.w === week.id && session.c === week.class_id);
  const now = requestTime();
  return (
    <StudentApp
      token={token}
      weekId={week.id}
      number={week.number}
      title={week.title}
      className={week.class_name}
      opensAt={week.opens_at}
      closesAt={week.closes_at}
      state={windowState(week, now)}
      geofenceEnabled={week.geofence_enabled}
      serverNow={now}
      hasSession={hasSession}
    />
  );
}
