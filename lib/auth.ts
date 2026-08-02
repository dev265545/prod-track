/**
 * ProdTrack Lite - Auth (client-side)
 *
 * Threat model note: this is a *local-first* app with no server. Everything
 * here raises the cost of casual/opportunistic access to a shared machine
 * (shoulder-surfed password, a colleague poking at Settings). It is NOT a
 * defence against someone with local filesystem/devtools access — the session
 * marker is a localStorage value and the data layer enforces nothing.
 */

import { getAppDbRecord, upsertAppDbRecord } from "./db/appMetadata";
import { record as auditRecord } from "./services/auditService";

const STORAGE_PASSWORD_HASH = "prodtrack_app_password_hash";
const STORAGE_WORKER_PASSWORD_HASH = "prodtrack_worker_password_hash";
const STORAGE_LOGIN_TS = "prodtrack_login_ts";
const STORAGE_SESSION_ROLE = "prodtrack_session_role";
/** Nonce baked into the current session. */
const STORAGE_SESSION_NONCE = "prodtrack_session_nonce";
/** Nonce currently valid for this install; rotated on every password change. */
const STORAGE_APP_NONCE = "prodtrack_app_session_nonce";
const STORAGE_LAST_ACTIVITY = "prodtrack_last_activity";

const SESSION_HOURS = 5;
/** Absolute cap: a session dies this long after login no matter what. */
const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000;
/** Idle cap: a session dies after this long with no activity. */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Minimum length enforced by `setAppPassword` / `setWorkerPassword`. */
export const MIN_PASSWORD_LENGTH = 6;

const PBKDF2_ITERATIONS = 200_000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_KEY_BITS = 256;
const ALGO_PBKDF2 = "pbkdf2-sha256";
const ALGO_LEGACY = "sha256-legacy";

export type AppRole = "admin" | "worker";

/**
 * Serialized form of a stored password. Persisted as a JSON string in the
 * `passwordHash` field so the existing string-typed `_app` row still fits.
 */
export interface PasswordRecord {
  algo: typeof ALGO_PBKDF2;
  salt: string;
  iterations: number;
  hash: string;
}

function getStorage(): Storage | null {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

function toHex(buf: ArrayBuffer | Uint8Array): string {
  return Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Legacy (pre-PBKDF2) unsalted single-round SHA-256. Verification only. */
async function legacyHash(password: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(password),
  );
  return toHex(buf);
}

async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      // Copy into a fresh buffer: some runtimes reject Uint8Array views here.
      salt: salt.slice().buffer as ArrayBuffer,
      iterations,
      hash: "SHA-256",
    },
    key,
    PBKDF2_KEY_BITS,
  );
  return toHex(bits);
}

/** Hash a password with a fresh per-install random salt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  const rec: PasswordRecord = {
    algo: ALGO_PBKDF2,
    salt: toHex(salt),
    iterations: PBKDF2_ITERATIONS,
    hash,
  };
  return JSON.stringify(rec);
}

function parsePasswordRecord(stored: string): PasswordRecord | null {
  if (!stored.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(stored) as Partial<PasswordRecord>;
    if (
      parsed.algo === ALGO_PBKDF2 &&
      typeof parsed.salt === "string" &&
      typeof parsed.hash === "string" &&
      typeof parsed.iterations === "number"
    ) {
      return parsed as PasswordRecord;
    }
  } catch {
    /* not a password record */
  }
  return null;
}

/** Which algorithm a stored credential uses; null when unreadable. */
export function storedAlgo(
  stored: string | null | undefined,
): typeof ALGO_PBKDF2 | typeof ALGO_LEGACY | null {
  if (!stored) return null;
  if (parsePasswordRecord(stored)) return ALGO_PBKDF2;
  if (/^[0-9a-f]{64}$/i.test(stored)) return ALGO_LEGACY;
  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify `input` against a stored credential, transparently supporting both
 * PBKDF2 records and legacy bare-SHA-256 hex hashes.
 */
export async function verifyAgainstStored(
  input: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false;
  const rec = parsePasswordRecord(stored);
  if (rec) {
    const hash = await pbkdf2(input, fromHex(rec.salt), rec.iterations);
    return timingSafeEqual(hash, rec.hash);
  }
  if (storedAlgo(stored) === ALGO_LEGACY) {
    return timingSafeEqual(await legacyHash(input), stored.toLowerCase());
  }
  return false;
}

function newNonce(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

/** The stored admin credential, preferring the DB row over localStorage. */
async function readStoredAdminCredential(): Promise<string | null> {
  try {
    const meta = await getAppDbRecord();
    if (meta?.sessionNonce) {
      // Keep the local view of the valid nonce in step with the DB.
      getStorage()?.setItem(STORAGE_APP_NONCE, meta.sessionNonce);
    }
    if (meta?.passwordHash) return meta.passwordHash;
  } catch {
    // DB not open yet — fall through to localStorage.
  }
  return getStorage()?.getItem(STORAGE_PASSWORD_HASH) ?? null;
}

/**
 * True when this install has an admin password configured. When false the app
 * must route to onboarding — there is deliberately no default password.
 */
export async function hasAppPassword(): Promise<boolean> {
  return (await readStoredAdminCredential()) !== null;
}

export async function verifyAppPassword(input: string): Promise<boolean> {
  return verifyAgainstStored(input, await readStoredAdminCredential());
}

/** The stored worker credential, preferring the DB row over localStorage. */
async function readStoredWorkerCredential(): Promise<string | null> {
  let stored: string | null = null;
  try {
    const meta = await getAppDbRecord();
    stored = meta?.workerPasswordHash ?? null;
  } catch {
    // DB not open yet — fall through to localStorage.
  }
  if (!stored) {
    stored = getStorage()?.getItem(STORAGE_WORKER_PASSWORD_HASH) ?? null;
  }
  return stored;
}

export async function verifyWorkerPassword(input: string): Promise<boolean> {
  // No default worker password: absent credential means "nobody can log in".
  return verifyAgainstStored(input, await readStoredWorkerCredential());
}

/**
 * True when this install has a worker password configured. When false the only
 * way in is the admin password, which hands the daily user admin rights — the
 * settings screen surfaces that as something to fix.
 */
export async function hasWorkerPassword(): Promise<boolean> {
  return (await readStoredWorkerCredential()) !== null;
}

/** Persist a credential without rotating the session nonce (silent re-hash). */
async function persistAdminCredential(encoded: string): Promise<void> {
  getStorage()?.setItem(STORAGE_PASSWORD_HASH, encoded);
  try {
    await upsertAppDbRecord({ passwordHash: encoded, onboardingComplete: true });
  } catch {
    // IndexedDB/sqlite not ready (e.g. unit tests) — localStorage still updated.
  }
}

/**
 * Set the admin password. Rotates the session nonce, which kills every live
 * session (including the caller's) — sign in again with the new password.
 */
export async function setAppPassword(newPassword: string): Promise<void> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
  const encoded = await hashPassword(newPassword);
  const nonce = newNonce();
  getStorage()?.setItem(STORAGE_PASSWORD_HASH, encoded);
  getStorage()?.setItem(STORAGE_APP_NONCE, nonce);
  try {
    await upsertAppDbRecord({
      passwordHash: encoded,
      onboardingComplete: true,
      sessionNonce: nonce,
    });
  } catch {
    // IndexedDB/sqlite not ready (e.g. unit tests) — localStorage still updated.
  }
  // Every existing session now carries a stale nonce; drop the local one too.
  logout({ audit: false });
  void auditRecord(
    "password.change",
    "auth",
    "admin",
    "Admin password changed; all sessions invalidated",
  );
}

/**
 * Set the worker password. Like `setAppPassword` this rotates the session
 * nonce, so every live session carrying the old nonce dies — that is the point:
 * whoever is signed in with the previous worker password must be signed out.
 *
 * The one exception is the admin performing the change: their session is
 * re-stamped with the new nonce so rotating the worker credential from Settings
 * does not bounce the owner back to the login screen mid-task.
 */
export async function setWorkerPassword(newPassword: string): Promise<void> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
  const existed = await hasWorkerPassword();
  const encoded = await hashPassword(newPassword);
  const nonce = newNonce();
  const keepAdminSession = isAdmin();
  getStorage()?.setItem(STORAGE_WORKER_PASSWORD_HASH, encoded);
  getStorage()?.setItem(STORAGE_APP_NONCE, nonce);
  try {
    await upsertAppDbRecord({
      workerPasswordHash: encoded,
      sessionNonce: nonce,
    });
  } catch {
    // IndexedDB/sqlite not ready (e.g. unit tests) — localStorage still updated.
  }
  if (keepAdminSession) getStorage()?.setItem(STORAGE_SESSION_NONCE, nonce);
  else logout({ audit: false });
  void auditRecord(
    "password.change",
    "auth",
    "worker",
    existed
      ? "Worker password changed; worker sessions invalidated"
      : "Worker password set for the first time",
  );
}

function readTs(key: string): number | null {
  const raw = getStorage()?.getItem(key);
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

/** A session is alive only if it is within the absolute cap, within the idle
 * window, and carries the current nonce. */
export function isLoggedIn(): boolean {
  const loginTs = readTs(STORAGE_LOGIN_TS);
  if (loginTs === null) return false;
  const now = Date.now();
  if (now - loginTs >= SESSION_MS) return false;

  const lastActivity = readTs(STORAGE_LAST_ACTIVITY) ?? loginTs;
  if (now - lastActivity >= IDLE_TIMEOUT_MS) return false;

  const appNonce = getStorage()?.getItem(STORAGE_APP_NONCE);
  if (appNonce) {
    const sessionNonce = getStorage()?.getItem(STORAGE_SESSION_NONCE);
    if (sessionNonce !== appNonce) return false;
  }
  return true;
}

export function startSession(role: AppRole): void {
  const s = getStorage();
  if (!s) return;
  const now = String(Date.now());
  s.setItem(STORAGE_LOGIN_TS, now);
  s.setItem(STORAGE_LAST_ACTIVITY, now);
  s.setItem(STORAGE_SESSION_ROLE, role);
  const appNonce = s.getItem(STORAGE_APP_NONCE);
  if (appNonce) s.setItem(STORAGE_SESSION_NONCE, appNonce);
  else s.removeItem(STORAGE_SESSION_NONCE);
}

/** Refresh the idle timer. No-op for a dead session (never resurrects one). */
export function touchSession(): void {
  if (!isLoggedIn()) return;
  getStorage()?.setItem(STORAGE_LAST_ACTIVITY, String(Date.now()));
}

/**
 * Re-read the DB's session nonce so a password change made in another window
 * or on another machine invalidates this session too.
 */
export async function syncSessionNonceFromDb(): Promise<void> {
  try {
    const meta = await getAppDbRecord();
    if (meta?.sessionNonce) {
      getStorage()?.setItem(STORAGE_APP_NONCE, meta.sessionNonce);
    }
  } catch {
    /* DB unavailable — keep the local view */
  }
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

export function logout(options?: { audit?: boolean }): void {
  const role = getStorage()?.getItem(STORAGE_SESSION_ROLE);
  const s = getStorage();
  s?.removeItem(STORAGE_LOGIN_TS);
  s?.removeItem(STORAGE_SESSION_ROLE);
  s?.removeItem(STORAGE_SESSION_NONCE);
  s?.removeItem(STORAGE_LAST_ACTIVITY);
  if (options?.audit !== false && role) {
    void auditRecord("logout", "auth", role, `Signed out (${role})`);
  }
}

export function checkExpiry(): boolean {
  if (!isLoggedIn()) {
    logout({ audit: false });
    return true;
  }
  return false;
}

/** If the credential is still legacy SHA-256, upgrade it to PBKDF2 in place. */
async function upgradeLegacyHashIfNeeded(password: string): Promise<void> {
  const stored = await readStoredAdminCredential();
  if (storedAlgo(stored) !== ALGO_LEGACY) return;
  await persistAdminCredential(await hashPassword(password));
}

export async function login(password: string): Promise<boolean> {
  const ok = await verifyAppPassword(password);
  if (!ok) {
    void auditRecord(
      "login.failure",
      "auth",
      "admin",
      "Failed sign-in attempt (admin password)",
    );
    return false;
  }
  await upgradeLegacyHashIfNeeded(password);
  startSession("admin");
  void auditRecord("login.success", "auth", "admin", "Signed in as admin");
  return true;
}

/**
 * Combined login for either the admin or the worker password. The *worker*
 * password is checked first on purpose: if both credentials are ever set to
 * the same value, the safe resolution is the lower privilege, not the higher.
 * Returns the resolved role, or `null` if neither matched (no session is
 * started in that case).
 */
export async function loginAs(password: string): Promise<AppRole | null> {
  const workerOk = await verifyWorkerPassword(password);
  if (workerOk) {
    startSession("worker");
    void auditRecord("login.success", "auth", "worker", "Signed in as worker");
    return "worker";
  }

  const adminOk = await verifyAppPassword(password);
  if (adminOk) {
    await upgradeLegacyHashIfNeeded(password);
    startSession("admin");
    void auditRecord("login.success", "auth", "admin", "Signed in as admin");
    return "admin";
  }

  void auditRecord(
    "login.failure",
    "auth",
    null,
    "Failed sign-in attempt (no password matched)",
  );
  return null;
}
