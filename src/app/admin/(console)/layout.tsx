import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin";
import { APP_NAME } from "@/lib/env";
import SignOut from "@/components/admin/SignOut";
import NavLinks from "@/components/admin/NavLinks";
import { ArrowUpRight, BrandMark } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/admin" className="shrink-0">
            <BrandMark name={APP_NAME} />
          </Link>
          <nav aria-label="Console" className="flex flex-wrap items-center gap-1.5">
            <NavLinks />
          </nav>
          <div className="cta-pair shrink-0">
            <Link href="/admin/weeks/new" className="btn btn-dark btn-sm">New week</Link>
            <Link href="/admin/weeks/new" className="btn btn-dark btn-sm btn-icon" aria-label="Schedule a new week">
              <ArrowUpRight />
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-24 pt-12 sm:px-8">{children}</main>
      <footer className="mt-auto shrink-0 bg-[#161719] text-[#a6aab2]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-sm sm:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <BrandMark name={APP_NAME} size="sm" inverted />
            <span aria-hidden="true" className="text-white/25">·</span>
            <span>Signed in as <span className="font-medium text-white">{admin.email}</span></span>
          </div>
          <SignOut inverted />
        </div>
      </footer>
    </div>
  );
}
