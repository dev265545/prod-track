/**
 * ProdTrack Lite - Auth
 * Login with configurable app password (default 1968). Session expires after 5 hours.
 * Master password (9319123410) is never changeable; required for "delete all data" and "change app password".
 */

const STORAGE_PASSWORD_HASH = 'prodtrack_app_password_hash';
const STORAGE_LOGIN_TS = 'prodtrack_login_ts';
const SESSION_HOURS = 5;
const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000;

/** Master password – never changeable. Required for delete-all and changing app password. */
export const MASTER_PASSWORD = '9319123410';

const DEFAULT_APP_PASSWORD = '1968';

function getStorage() {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

async function hashPassword(password) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(password));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * @returns {Promise<boolean>} true if password matches
 */
export async function verifyAppPassword(input) {
  const stored = getStorage()?.getItem(STORAGE_PASSWORD_HASH);
  const hash = await hashPassword(input);
  if (!stored) {
    return input === DEFAULT_APP_PASSWORD;
  }
  return hash === stored;
}

/**
 * @returns {boolean}
 */
export function verifyMasterPassword(input) {
  return input === MASTER_PASSWORD;
}

/**
 * Set app password (call only after verifying master password).
 * @param {string} newPassword
 */
export async function setAppPassword(newPassword) {
  const hash = await hashPassword(newPassword);
  getStorage()?.setItem(STORAGE_PASSWORD_HASH, hash);
}

/**
 * @returns {boolean}
 */
export function isLoggedIn() {
  const ts = getStorage()?.getItem(STORAGE_LOGIN_TS);
  if (!ts) return false;
  const n = parseInt(ts, 10);
  if (Number.isNaN(n)) return false;
  return Date.now() - n < SESSION_MS;
}

/**
 * Call after successful app password verification. Starts 5-hour session.
 */
export function startSession() {
  getStorage()?.setItem(STORAGE_LOGIN_TS, String(Date.now()));
}

/**
 * Clear session (logout). Does not clear app password hash.
 */
export function logout() {
  getStorage()?.removeItem(STORAGE_LOGIN_TS);
}

/**
 * If session expired, logout and return true. Call on each route.
 * @returns {boolean} true if was expired (caller should show login)
 */
export function checkExpiry() {
  if (!isLoggedIn()) {
    logout();
    return true;
  }
  return false;
}

/**
 * On first successful login with default password, persist the hash so we can verify next time.
 * @param {string} password - the password that was just verified
 */
async function persistDefaultHashIfNeeded(password) {
  if (getStorage()?.getItem(STORAGE_PASSWORD_HASH)) return;
  if (password === DEFAULT_APP_PASSWORD) {
    const hash = await hashPassword(password);
    getStorage()?.setItem(STORAGE_PASSWORD_HASH, hash);
  }
}

/**
 * Login with app password. Returns true if success.
 * @param {string} password
 * @returns {Promise<boolean>}
 */
export async function login(password) {
  const ok = await verifyAppPassword(password);
  if (!ok) return false;
  await persistDefaultHashIfNeeded(password);
  startSession();
  return true;
}
