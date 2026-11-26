"use client";
import { useRouter } from "next/navigation";
import { browserAuth } from "@/lib/supabase/auth-browser";

export default function SignOut({ inverted = false }: { inverted?: boolean }) {
  const router = useRouter();
  return (
    <button
      className={
        inverted
          ? "inline-flex min-h-[36px] items-center rounded-full border border-white/15 bg-white/10 px-4 text-sm font-medium text-white transition hover:bg-white/20 cursor-pointer"
          : "btn-link"
      }
      onClick={async () => {
        await browserAuth().auth.signOut();
        router.replace("/admin/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
