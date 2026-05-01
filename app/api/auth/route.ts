// POST /api/auth — accepts { password }, sets a signed httpOnly cookie on success.
// Constant-time comparison against OCSF_PASSWORD.

import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_MAX_AGE,
  AUTH_COOKIE_NAME,
  safeEqual,
  signCookie,
} from "@/lib/cookies";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const { password } = (await req.json().catch(() => ({}))) as {
    password?: string;
  };

  const expected = process.env.OCSF_PASSWORD;
  const secret = process.env.OCSF_COOKIE_SECRET;
  if (!expected || !secret) {
    return NextResponse.json(
      { ok: false, error: "Server misconfigured (env vars missing)" },
      { status: 500 },
    );
  }

  if (!password || !safeEqual(password, expected)) {
    return NextResponse.json({ ok: false, error: "Wrong password" }, { status: 401 });
  }

  const value = await signCookie(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
