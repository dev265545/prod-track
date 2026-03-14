/**
 * ProdTrack Lite - Auth (client-side)
 */

const STORAGE_PASSWORD_HASH = "prodtrack_app_password_hash";
const STORAGE_LOGIN_TS = "prodtrack_login_ts";
const SESSION_HOURS = 5;
const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000;

export const MASTER_PASSWORD = "9319123410";
const DEFAULT_APP_PASSWORD = "1968";

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
  const stored = getStorage()?.getItem(STORAGE_PASSWORD_HASH);
  const hash = await hashPassword(input);
  if (!stored) return input === DEFAULT_APP_PASSWORD;
  return hash === stored;
}

export function verifyMasterPassword(input: string): boolean {
  return input === MASTER_PASSWORD;
}

export async function setAppPassword(newPassword: string): Promise<void> {
  const hash = await hashPassword(newPassword);
  getStorage()?.setItem(STORAGE_PASSWORD_HASH, hash);
}

export function isLoggedIn(): boolean {
  const ts = getStorage()?.getItem(STORAGE_LOGIN_TS);
  if (!ts) return false;
  const n = parseInt(ts, 10);
  if (Number.isNaN(n)) return false;
  return Date.now() - n < SESSION_MS;
}

export function startSession(): void {
  getStorage()?.setItem(STORAGE_LOGIN_TS, String(Date.now()));
}

export function logout(): void {
  getStorage()?.removeItem(STORAGE_LOGIN_TS);
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
  startSession();
  return true;
}
