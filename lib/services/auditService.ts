/**
 * Append-only audit log.
 *
 * Every entry is a row in the `audit_log` store; nothing in this module ever
 * updates an entry, and `clearAllData()` deliberately skips the store so the
 * evidence outlives a wipe.
 *
 * The one deletion path is `pruneAuditEntriesBefore()` — an explicit, admin
 * initiated retention sweep that writes its own audit entry *before* it
 * deletes anything, so the log always says who shortened it and by how much.
 * Nothing prunes automatically: a factory must never discover that the month
 * it needed was silently dropped to stay under a cap.
 *
 * HONEST LIMITS — this is a tamper-*evident* convention, not a tamper-*proof*
 * store. The data layer enforces nothing: any code that can reach
 * `lib/db/adapter` can rewrite or delete rows here, and the `role` stamped on
 * an entry is a localStorage value the person at the keyboard controls. It is
 * a shared-office record of what the app did, not evidence for a wage dispute.
 * The viewer says so on screen.
 *
 * Deliberately does NOT import from `lib/auth` (auth records audit events, so
 * importing back would be a cycle) — the session role is read straight from
 * localStorage instead.
 */

import { deleteWhere, getAll, put } from "../db/adapter";
import { STORES } from "../db/schema";

const STORAGE_SESSION_ROLE = "prodtrack_session_role";

/**
 * The complete catalogue of things the app can do to its own data.
 *
 * Call sites pass `AUDIT_ACTIONS.attendanceMark`, never a bare string, so a
 * typo becomes a compile error instead of a row no filter will ever match.
 * Values are `group.verb`; the group prefix is what `categoryOfAction()` reads
 * to bucket entries for the viewer's filter, so a new action only has to pick
 * the right prefix to become filterable.
 *
 * Anything missing here is a mutation nobody has agreed to log yet: add the
 * action first, then wire the call site.
 */
export const AUDIT_ACTIONS = {
  // --- auth ---------------------------------------------------------------
  loginSuccess: "login.success",
  loginFailure: "login.failure",
  logout: "logout",
  passwordChange: "password.change",

  // --- whole-database data movement ---------------------------------------
  dataExport: "data.export",
  dataImport: "data.import",
  dataClear: "data.clear",
  dataPurge: "data.purge",
  auditExport: "audit.export",
  auditPrune: "audit.prune",
  storageModeChange: "storage.mode.change",

  // --- attendance ---------------------------------------------------------
  attendanceMark: "attendance.mark",
  attendanceUpdate: "attendance.update",
  attendanceClear: "attendance.clear",

  // --- production ---------------------------------------------------------
  productionCreate: "production.create",
  productionUpdate: "production.update",
  productionDelete: "production.delete",
  productionPurge: "production.purge",

  // --- money paid out in advance ------------------------------------------
  advanceCreate: "advance.create",
  advanceUpdate: "advance.update",
  advanceDelete: "advance.delete",
  advancePurge: "advance.purge",
  deductionSet: "deduction.set",
  deductionClear: "deduction.clear",

  // --- people -------------------------------------------------------------
  employeeCreate: "employee.create",
  employeeUpdate: "employee.update",
  employeeDelete: "employee.delete",
  employeeReorder: "employee.reorder",
  employeeTypeChange: "employee.type.change",

  // --- catalogue: items, machines -----------------------------------------
  itemCreate: "item.create",
  itemUpdate: "item.update",
  itemDelete: "item.delete",
  machineCreate: "machine.create",
  machineUpdate: "machine.update",
  machineDelete: "machine.delete",

  // --- stock --------------------------------------------------------------
  inventoryItemCreate: "inventory.item.create",
  inventoryItemUpdate: "inventory.item.update",
  inventoryItemDelete: "inventory.item.delete",
  inventoryInward: "inventory.inward",
  inventoryOutward: "inventory.outward",
  inventoryMovementDelete: "inventory.movement.delete",
  inventoryExport: "inventory.export",
  inventoryImport: "inventory.import",

  // --- payroll ------------------------------------------------------------
  salaryOverrideSet: "salary.override.set",
  salaryOverrideClear: "salary.override.clear",
  salaryRecordSave: "salary.record.save",
  salaryPrint: "salary.print",

  // --- calendars and rules ------------------------------------------------
  holidayCreate: "holiday.create",
  holidayDelete: "holiday.delete",
  shiftCreate: "shift.create",
  shiftUpdate: "shift.update",
  shiftDelete: "shift.delete",
  sundayCategoryCreate: "sunday.category.create",
  sundayCategoryUpdate: "sunday.category.update",
  sundayCategoryDelete: "sunday.category.delete",

  // --- paper --------------------------------------------------------------
  reportPrint: "report.print",
  reportExport: "report.export",

  // --- settings -----------------------------------------------------------
  settingsUpdate: "settings.update",
} as const;

/** Every value of {@link AUDIT_ACTIONS} — what writers are allowed to pass. */
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/**
 * What readers must accept. Entries written by an older build — or by a newer
 * one, restored from a backup — can carry an action string this build has
 * never heard of, and the viewer has to render them rather than crash. Writes
 * stay narrowed to {@link AuditAction}.
 */
export type StoredAuditAction = AuditAction | (string & Record<never, never>);

export interface AuditEntry {
  id: string;
  /** ISO-8601 UTC. */
  timestamp: string;
  /** What happened. */
  action: StoredAuditAction;
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

/** One field that changed, as captured by {@link diffEntity}. */
export interface AuditFieldChange {
  field: string;
  before: unknown;
  after: unknown;
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

/**
 * True when `summary` reads as a sentence an owner can understand.
 *
 * The point of the log is that a non-technical reader can scan it, so
 * `summary` is contractually pre-rendered prose — "Rakesh was marked present
 * on 3 August" — never a serialised payload. This is the check that keeps the
 * contract honest: it rejects the shapes that leak out when somebody reaches
 * for `JSON.stringify`, a raw id, or the action name itself.
 */
export function isHumanSummary(summary: unknown): boolean {
  if (typeof summary !== "string") return false;
  const text = summary.trim();
  // Two words minimum: "updated" is a log line, not a sentence.
  if (text.length < 8 || !text.includes(" ")) return false;
  if (text.includes("[object ")) return false;
  if (text.includes("undefined") || text.includes("NaN")) return false;
  // Serialised structures: `{id:…}`, `["a"]`.
  if (/[{}[\]]/.test(text)) return false;
  // A dotted action id pressed into service as prose.
  if (/^[a-z]+(\.[a-z]+)+\b/i.test(text)) return false;
  return true;
}

export function buildEntry(
  action: AuditAction,
  entity: string,
  entityId: string | null,
  summary: string,
  diff?: unknown,
): AuditEntry {
  if (!isHumanSummary(summary)) {
    // Loud but non-fatal. A bad sentence must never abort the action being
    // audited — a missing entry is worse than an ugly one — so this warns the
    // developer and stores it anyway; the viewer flags it on screen.
    console.warn(
      `[audit] summary for "${action}" is not plain language and will read badly in the log:`,
      summary,
    );
  }
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
  action: AuditAction,
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

/**
 * Before/after for the fields a reader would care about, and only those.
 *
 * `fields` is an allowlist rather than a blocklist on purpose: a plain
 * `{before, after}` dump would put `id`, `createdAt`, storage keys and every
 * future internal column straight onto the owner's screen. Naming the fields
 * means a new internal column stays invisible until somebody decides it
 * belongs in front of a human.
 *
 * Unchanged fields are dropped, so `[]` genuinely means "nothing the log cares
 * about moved". Pass `null` for `before` on a create, for `after` on a delete.
 */
export function diffEntity(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  fields: readonly string[],
): AuditFieldChange[] {
  const changes: AuditFieldChange[] = [];
  for (const field of fields) {
    const b = before ? before[field] : undefined;
    const a = after ? after[field] : undefined;
    if (b === undefined && a === undefined) continue;
    if (sameValue(b, a)) continue;
    changes.push({ field, before: b ?? null, after: a ?? null });
  }
  return changes;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === "object" || typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

/** All audit entries, newest first. */
export async function listAuditEntries(): Promise<AuditEntry[]> {
  const rows = (await getAll(STORES.AUDIT_LOG)) as unknown as AuditEntry[];
  return [...rows].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

/**
 * Where the log starts feeling heavy. Not a hard limit and nothing enforces
 * it — crossing it only makes the viewer suggest exporting and pruning, which
 * keeps the decision to lose history with the owner rather than with a
 * constant in a source file.
 */
export const AUDIT_SOFT_CAP = 20_000;

export interface AuditLogHealth {
  count: number;
  cap: number;
  /** True once the viewer should nudge the owner to archive and prune. */
  overCap: boolean;
  /** Timestamp of the oldest surviving entry, or null when empty. */
  oldest: string | null;
}

export function summariseHealth(entries: AuditEntry[]): AuditLogHealth {
  let oldest: string | null = null;
  for (const e of entries) {
    if (oldest === null || e.timestamp < oldest) oldest = e.timestamp;
  }
  return {
    count: entries.length,
    cap: AUDIT_SOFT_CAP,
    overCap: entries.length > AUDIT_SOFT_CAP,
    oldest,
  };
}

/** How many entries a prune at `cutoffIso` would remove. Read-only. */
export function countEntriesBefore(
  entries: AuditEntry[],
  cutoffIso: string,
): number {
  return entries.filter((e) => e.timestamp < cutoffIso).length;
}

/**
 * Delete entries older than `cutoffIso` (exclusive) and return how many went.
 *
 * The only path by which rows ever leave this store, and it is deliberately
 * manual. The record of the prune is written *first* so that it is newer than
 * the cutoff and cannot be caught by its own sweep: a log that has been
 * shortened must always still say who shortened it, when, and by how much.
 */
export async function pruneAuditEntriesBefore(
  cutoffIso: string,
): Promise<number> {
  const doomed = countEntriesBefore(await listAuditEntries(), cutoffIso);
  await record(
    AUDIT_ACTIONS.auditPrune,
    "audit_log",
    null,
    `Deleted ${doomed} old log entries from before ${cutoffIso.slice(0, 10)}`,
    { cutoff: cutoffIso, removed: doomed },
  );
  return deleteWhere(STORES.AUDIT_LOG, (row) => {
    const ts = row.timestamp;
    return typeof ts === "string" && ts < cutoffIso;
  });
}
