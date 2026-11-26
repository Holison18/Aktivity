// Refreshes the admin's Supabase Auth cookies and sends signed-out visitors to the sign-in page.
// This is an optimistic check only; every admin page and action calls requireAdmin() (FR-27).
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  // Verify the JWT locally against cached JWKS (falling back to GoTrue only for symmetric keys
  // or when refreshing an expiring token) instead of making an Auth HTTP round-trip on every click.
  const { data, error } = await supabase.auth.getClaims();
  let authed = !!data?.claims?.sub;
  if (!authed && error) {
    const { data: userData } = await supabase.auth.getUser();
    authed = !!userData?.user;
  }

  const isLogin = request.nextUrl.pathname.startsWith("/admin/login");
  if (!authed && request.nextUrl.pathname.startsWith("/api/admin")) {
    return NextResponse.json({ error: "signed_out" }, { status: 401 });
  }
  if (!authed && !isLogin) {
    const to = request.nextUrl.clone();
    to.pathname = "/admin/login";
    to.search = "";
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
