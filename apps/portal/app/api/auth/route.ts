import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  accessKey,
  keysMatch,
  portalCookie,
  signedSessionValue,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let key = "";
  try {
    const body = (await req.json()) as { key?: string };
    key = typeof body.key === "string" ? body.key : "";
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    if (!keysMatch(key, accessKey())) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server misconfiguration";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  cookies().set(portalCookie.name, signedSessionValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: portalCookie.maxAgeSeconds,
  });

  return NextResponse.json({ ok: true });
}
