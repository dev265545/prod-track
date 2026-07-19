/**
 * ProdTrack Lite - Auth (client-side)
 */

import { getAppDbRecord, upsertAppDbRecord } from "./db/appMetadata";

const STORAGE_PASSWORD_HASH = "prodtrack_app_password_hash";
const STORAGE_WORKER_PASSWORD_HASH = "prodtrack_worker_password_hash";
const STORAGE_LOGIN_TS = "prodtrack_login_ts";
const STORAGE_SESSION_ROLE = "prodtrack_session_role";
const SESSION_HOURS = 5;
const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000;

export const MASTER_PASSWORD = "9319123410";
const DEFAULT_APP_PASSWORD = "1968";

export type AppRole = "admin" | "worker";

function getStorage(): Storage | null {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(password));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyAppPassword(input: string): Promise<boolean> {
  const hash = await hashPassword(input);
  try {
    const meta = await getAppDbRecord();
    if (meta?.passwordHash) {
      return hash === meta.passwordHash;
    }
  } catch {
    // DB not open yet — fall through to local defaults
  }
  const stored = getStorage()?.getItem(STORAGE_PASSWORD_HASH);
  if (!stored) return input === DEFAULT_APP_PASSWORD;
  return hash === stored;
}

export async function verifyWorkerPassword(input: string): Promise<boolean> {
  const hash = await hashPassword(input);
  try {
    const meta = await getAppDbRecord();
    if (meta?.workerPasswordHash) {
      return hash === meta.workerPasswordHash;
    }
  } catch {
    // DB not open yet — fall through to local defaults
  }
  const stored = getStorage()?.getItem(STORAGE_WORKER_PASSWORD_HASH);
  if (!stored) return false; // no default worker password fallback
  return hash === stored;
}

export function verifyMasterPassword(input: string): boolean {
  return input === MASTER_PASSWORD;
}

export async function setAppPassword(newPassword: string): Promise<void> {
  const hash = await hashPassword(newPassword);
  getStorage()?.setItem(STORAGE_PASSWORD_HASH, hash);
  try {
    await upsertAppDbRecord({
      passwordHash: hash,
      onboardingComplete: true,
    });
  } catch {
    // IndexedDB/sqlite not ready (e.g. unit tests) — localStorage still updated
  }
}

export async function setWorkerPassword(newPassword: string): Promise<void> {
  const hash = await hashPassword(newPassword);
  getStorage()?.setItem(STORAGE_WORKER_PASSWORD_HASH, hash);
  try {
    await upsertAppDbRecord({
      workerPasswordHash: hash,
    });
  } catch {
    // IndexedDB/sqlite not ready (e.g. unit tests) — localStorage still updated
  }
}

export function isLoggedIn(): boolean {
  const ts = getStorage()?.getItem(STORAGE_LOGIN_TS);
  if (!ts) return false;
  const n = parseInt(ts, 10);
  if (Number.isNaN(n)) return false;
  return Date.now() - n < SESSION_MS;
}

export function startSession(role: AppRole): void {
  getStorage()?.setItem(STORAGE_LOGIN_TS, String(Date.now()));
  getStorage()?.setItem(STORAGE_SESSION_ROLE, role);
}

export function getCurrentRole(): AppRole | null {
  if (!isLoggedIn()) return null;
  const role = getStorage()?.getItem(STORAGE_SESSION_ROLE);
  if (role === "admin" || role === "worker") return role;
  return null;
}

export function isAdmin(): boolean {
  return getCurrentRole() === "admin";
}

export function logout(): void {
  getStorage()?.removeItem(STORAGE_LOGIN_TS);
  getStorage()?.removeItem(STORAGE_SESSION_ROLE);
}

export function checkExpiry(): boolean {
  if (!isLoggedIn()) {
    logout();
    return true;
  }
  return false;
}

async function persistDefaultHashIfNeeded(password: string): Promise<void> {
  if (getStorage()?.getItem(STORAGE_PASSWORD_HASH)) return;
  if (password === DEFAULT_APP_PASSWORD) {
    const hash = await hashPassword(password);
    getStorage()?.setItem(STORAGE_PASSWORD_HASH, hash);
  }
}

export async function login(password: string): Promise<boolean> {
  const ok = await verifyAppPassword(password);
  if (!ok) return false;
  await persistDefaultHashIfNeeded(password);
  try {
    const hash = await hashPassword(password);
    await upsertAppDbRecord({
      passwordHash: hash,
      onboardingComplete: true,
    });
  } catch {
    /* ignore */
  }
  startSession("admin");
  return true;
}

/**
 * Combined login for either the admin or the worker password. Tries the
 * admin path first (identical to `login()`'s behavior, root-and-branch),
 * then falls back to the worker password. Returns the resolved role, or
 * `null` if neither password matched (no session is started in that case).
 */
export async function loginAs(password: string): Promise<AppRole | null> {
  const ok = await login(password);
  if (ok) return "admin";

  const workerOk = await verifyWorkerPassword(password);
  if (workerOk) {
    startSession("worker");
    return "worker";
  }

  return null;
}
