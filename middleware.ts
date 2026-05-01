// Edge middleware: gates every route behind the signed auth cookie.
// Allowlist: /login, /api/auth, and Next's static asset paths.

import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifyCookie } from "@/lib/cookies";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public routes — no auth needed.
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  const secret = process.env.OCSF_COOKIE_SECRET;
  if (!secret) {
    // Misconfiguration — fail closed.
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "config");
    return NextResponse.redirect(url);
  }

  const cookie = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const ok = await verifyCookie(cookie, secret);
  if (ok) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}
