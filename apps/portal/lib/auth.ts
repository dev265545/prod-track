import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "pt_portal";

export function sessionSecret(): string {
  const s = process.env.PORTAL_SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("PORTAL_SESSION_SECRET must be set (min 16 chars)");
  }
  return s;
}

export function accessKey(): string {
  const k = process.env.ACCESS_KEY;
  if (!k || k.length < 8) {
    throw new Error("ACCESS_KEY must be set (min 8 chars)");
  }
  return k;
}

function hashKey(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function keysMatch(submitted: string, expected: string): boolean {
  const a = hashKey(submitted);
  const b = hashKey(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function signedSessionValue(): string {
  return createHmac("sha256", sessionSecret())
    .update(`portal|${accessKey()}`, "utf8")
    .digest("hex");
}

export function sessionValid(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;
  try {
    const want = Buffer.from(signedSessionValue(), "utf8");
    const got = Buffer.from(cookieValue, "utf8");
    if (want.length !== got.length) return false;
    return timingSafeEqual(want, got);
  } catch {
    return false;
  }
}

export const portalCookie = {
  name: COOKIE,
  maxAgeSeconds: 60 * 60 * 24 * 30,
} as const;
