/**
 * Append-only audit log.
 *
 * Every entry is a row in the `audit_log` store; nothing in this module ever
 * updates or deletes an entry, and `clearAllData()` deliberately skips the
 * store so the evidence outlives a wipe.
 *
 * Deliberately does NOT import from `lib/auth` (auth records audit events, so
 * importing back would be a cycle) — the session role is read straight from
 * localStorage instead.
 */

import { getAll, put } from "../db/adapter";
import { STORES } from "../db/schema";

const STORAGE_SESSION_ROLE = "prodtrack_session_role";

export type AuditAction =
  | "login.success"
  | "login.failure"
  | "logout"
  | "password.change"
  | "data.import"
  | "data.export"
  | "data.clear"
  | "data.purge";

export interface AuditEntry {
  id: string;
  /** ISO-8601 UTC. */
  timestamp: string;
  /** What happened. */
  action: AuditAction | string;
  /** Which kind of thing it happened to, e.g. "auth", "database", "advances". */
  entity: string;
  /** Id of the affected record, or a stable pseudo-id for global actions. */
  entityId: string | null;
  /** Human-readable one-liner for the audit UI. */
  summary: string;
  /** Optional structured before/after or parameter detail. */
  diff?: unknown;
  /** Session role at the time of the action. */
  role: string | null;
  /**
   * Reserved for real user accounts. Always null today (the app has a single
   * shared password per role), but persisted so entries written now remain
   * queryable once accounts exist.
   */
  userId: string | null;
}

function currentRole(): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(STORAGE_SESSION_ROLE);
  } catch {
    return null;
  }
}

function newId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${Date.now()}-${rand}`;
}

export function buildEntry(
  action: AuditAction | string,
  entity: string,
  entityId: string | null,
  summary: string,
  diff?: unknown,
): AuditEntry {
  const entry: AuditEntry = {
    id: newId(),
    timestamp: new Date().toISOString(),
    action,
    entity,
    entityId,
    summary,
    role: currentRole(),
    userId: null,
  };
  if (diff !== undefined) entry.diff = diff;
  return entry;
}

/**
 * Append one audit entry. Never throws: an unavailable database must not break
 * the action being audited (login, import, …), so failures are swallowed.
 * Returns true when the entry was persisted.
 */
export async function record(
  action: AuditAction | string,
  entity: string,
  entityId: string | null,
  summary: string,
  diff?: unknown,
): Promise<boolean> {
  try {
    await put(
      STORES.AUDIT_LOG,
      buildEntry(action, entity, entityId, summary, diff) as unknown as Record<
        string,
        unknown
      >,
    );
    return true;
  } catch {
    return false;
  }
}

/** All audit entries, newest first. */
export async function listAuditEntries(): Promise<AuditEntry[]> {
  const rows = (await getAll(STORES.AUDIT_LOG)) as unknown as AuditEntry[];
  return [...rows].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}
