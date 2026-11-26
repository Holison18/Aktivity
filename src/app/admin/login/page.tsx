import type { Metadata } from "next";
import Link from "next/link";
import LoginForm from "./LoginForm";
import { APP_NAME } from "@/lib/env";
import { BrandMark } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin sign in" };

export default async function AdminLogin(props: PageProps<"/admin/login">) {
  const sp = await props.searchParams;
  const reason = typeof sp.reason === "string" ? sp.reason : undefined;
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/">
            <BrandMark name={APP_NAME} />
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-14 sm:px-6">
        <div className="card-raised p-7 sm:p-8 space-y-6">
          <div className="space-y-2.5">
            <h1 className="display text-4xl">
              Console{" "}
              <span className="fade-line">Sign in</span>
            </h1>
            <p className="text-sm">Lecturer access only. Enter your email, password, and authenticator code.</p>
          </div>
          <LoginForm key={reason ?? "default"} reason={reason} />
        </div>
      </main>
    </div>
  );
}
