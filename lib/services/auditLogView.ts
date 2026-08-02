/**
 * Everything the audit viewer needs to turn stored entries into something a
 * factory owner can read — bucketing, filtering, paging, diff rendering and
 * file export.
 *
 * Pure by design: no database, no React, no `t()`. The page passes translated
 * labels *in* and gets plain data *out*, which is what lets the whole of the
 * viewer's behaviour be tested under vitest's node environment (there is no
 * React test harness in this repo).
 *
 * Scale note: the store has no timestamp index, so the page loads the log once
 * and everything below runs over that in-memory array. Filtering is a single
 * linear pass and paging is a slice, so a few tens of thousands of entries
 * stay instant; past that the honest fix is an index on `audit_log.timestamp`
 * in `lib/db/indexes.ts` plus a ranged read, not a cleverer filter here.
 */

import type { AuditEntry, AuditFieldChange } from "./auditService";

/**
 * The buckets the viewer's "what kind of thing" filter offers. Deliberately
 * named after parts of the factory rather than parts of the code — an owner
 * looks for "money", not for "advance_deductions".
 */
export const AUDIT_CATEGORIES = [
  "auth",
  "attendance",
  "production",
  "money",
  "people",
  "stock",
  "settings",
  "data",
  "other",
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

/**
 * Bucket an action by its `group.verb` prefix. Unknown actions — an entry from
 * an older or newer build — fall into "other" rather than vanishing from every
 * filter, because an entry you cannot find is an entry you have lost.
 */
export function categoryOfAction(action: string): AuditCategory {
  const group = action.split(".")[0];
  switch (group) {
    case "login":
    case "logout":
    case "password":
      return "auth";
    case "attendance":
      return "attendance";
    case "production":
    case "item":
    case "machine":
    case "report":
      return "production";
    case "advance":
    case "deduction":
    case "salary":
      return "money";
    case "employee":
      return "people";
    case "inventory":
      return "stock";
    case "holiday":
    case "shift":
    case "sunday":
    case "settings":
      return "settings";
    case "data":
    case "audit":
    case "storage":
      return "data";
    default:
      return "other";
  }
}

/** The calendar day (`yyyy-mm-dd`) an entry's UTC timestamp falls on. */
export function entryDate(entry: AuditEntry): string {
  return entry.timestamp.slice(0, 10);
}

export interface AuditFilter {
  /** Inclusive `yyyy-mm-dd` lower bound, or "" for no bound. */
  from: string;
  /** Inclusive `yyyy-mm-dd` upper bound, or "" for no bound. */
  to: string;
  category: AuditCategory | "all";
  /** A role string as stored ("admin"/"worker"), or "all". */
  role: string | "all";
  /** Free text, matched case-insensitively against the summary. */
  search: string;
}

export const EMPTY_FILTER: AuditFilter = {
  from: "",
  to: "",
  category: "all",
  role: "all",
  search: "",
};

export function isFilterActive(filter: AuditFilter): boolean {
  return (
    filter.from !== "" ||
    filter.to !== "" ||
    filter.category !== "all" ||
    filter.role !== "all" ||
    filter.search.trim() !== ""
  );
}

/**
 * Apply every filter at once, preserving input order (the caller hands us the
 * list newest-first and expects it back that way).
 *
 * Free text searches the summary only, on purpose: the summary is the sentence
 * on screen, so searching it means what you typed is what you will see
 * highlighted in the results. Searching ids as well would return rows whose
 * visible text contains nothing you asked for.
 */
export function filterEntries(
  entries: AuditEntry[],
  filter: AuditFilter,
): AuditEntry[] {
  const needle = filter.search.trim().toLowerCase();
  return entries.filter((entry) => {
    const day = entryDate(entry);
    if (filter.from && day < filter.from) return false;
    if (filter.to && day > filter.to) return false;
    if (
      filter.category !== "all" &&
      categoryOfAction(entry.action) !== filter.category
    ) {
      return false;
    }
    if (filter.role !== "all" && (entry.role ?? "") !== filter.role) {
      return false;
    }
    if (needle && !entry.summary.toLowerCase().includes(needle)) return false;
    return true;
  });
}

/** Distinct roles present in the log, so the filter only offers real options. */
export function rolesPresent(entries: AuditEntry[]): string[] {
  const seen = new Set<string>();
  for (const e of entries) if (e.role) seen.add(e.role);
  return [...seen].sort();
}

export const AUDIT_PAGE_SIZE = 50;

export interface AuditPage {
  rows: AuditEntry[];
  /** 1-based, clamped into range. */
  page: number;
  pageCount: number;
  total: number;
  /** 1-based index of the first row on this page; 0 when empty. */
  firstIndex: number;
  /** 1-based index of the last row on this page; 0 when empty. */
  lastIndex: number;
}

/**
 * Paging rather than virtualisation. A windowed list would also stay fast, but
 * it costs a scroll-position library and gives an owner no way to say "I was
 * on page 3" — and every row here is a fixed-height sentence, so a page of 50
 * is a screenful he can read top to bottom and then move on from.
 *
 * `page` is clamped, so shrinking the result set under a deep page (by typing
 * into the search box) lands on the last real page instead of on nothing.
 */
export function paginate(
  rows: AuditEntry[],
  page: number,
  pageSize: number = AUDIT_PAGE_SIZE,
): AuditPage {
  const size = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (current - 1) * size;
  const slice = rows.slice(start, start + size);
  return {
    rows: slice,
    page: current,
    pageCount,
    total: rows.length,
    firstIndex: slice.length ? start + 1 : 0,
    lastIndex: slice.length ? start + slice.length : 0,
  };
}

/* -------------------------------------------------------------------------
 * Diff rendering
 * ---------------------------------------------------------------------- */

/** Field names that are plumbing, never shown even if a diff carries them. */
const INTERNAL_FIELDS = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "sortOrder",
  "schemaVersion",
  "sessionNonce",
  "hash",
  "salt",
  "iterations",
  "algo",
]);

/**
 * Coerce whatever landed in `entry.diff` into displayable changes.
 *
 * `diff` is typed `unknown` because it survives restores from other builds, so
 * this accepts the three shapes that have ever been written — an array of
 * {@link AuditFieldChange}, a `{before, after}` pair, or a flat bag of
 * parameters — and returns `null` for anything else rather than guessing.
 * Internal fields are stripped here as well as at write time, so an entry
 * restored from an old backup cannot leak them either.
 */
export function readableChanges(diff: unknown): AuditFieldChange[] | null {
  if (diff == null || typeof diff !== "object") return null;

  const keep = (c: AuditFieldChange) => !INTERNAL_FIELDS.has(c.field);

  if (Array.isArray(diff)) {
    const changes = diff.filter(
      (c): c is AuditFieldChange =>
        !!c && typeof c === "object" && typeof (c as AuditFieldChange).field === "string",
    );
    const kept = changes.filter(keep);
    return kept.length ? kept : null;
  }

  const bag = diff as Record<string, unknown>;
  const before = bag.before;
  const after = bag.after;
  if (
    (before !== undefined || after !== undefined) &&
    (before === null || typeof before === "object" || before === undefined) &&
    (after === null || typeof after === "object" || after === undefined)
  ) {
    const b = (before ?? {}) as Record<string, unknown>;
    const a = (after ?? {}) as Record<string, unknown>;
    const fields = [...new Set([...Object.keys(b), ...Object.keys(a)])];
    const kept = fields
      .filter((f) => !INTERNAL_FIELDS.has(f))
      .filter((f) => JSON.stringify(b[f]) !== JSON.stringify(a[f]))
      .map((f) => ({ field: f, before: b[f] ?? null, after: a[f] ?? null }));
    return kept.length ? kept : null;
  }

  // A flat parameter bag: show each value as an "after" with nothing before.
  const kept = Object.keys(bag)
    .filter((f) => !INTERNAL_FIELDS.has(f))
    .map((f) => ({ field: f, before: null, after: bag[f] }));
  return kept.length ? kept : null;
}

/**
 * `monthlySalary` -> `Monthly salary`. Field names are developer words; this
 * is the cheapest honest way to put them in front of an owner without adding a
 * translation key for every column in the database. Genuinely opaque names
 * should get a real label in the caller's `labels` map instead.
 */
export function humanizeField(field: string): string {
  const spaced = field
    .replace(/[_.]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  if (!spaced) return field;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export interface ValueLabels {
  empty: string;
  yes: string;
  no: string;
}

/**
 * A diff value as a short piece of prose. Booleans become yes/no because
 * "true" means nothing on a shop floor, empty becomes an explicit word so a
 * blank cell is never mistaken for a rendering bug, and an object degrades to
 * compact JSON — rare, and better than a silent blank.
 */
export function formatDiffValue(value: unknown, labels: ValueLabels): string {
  if (value === null || value === undefined || value === "") return labels.empty;
  if (typeof value === "boolean") return value ? labels.yes : labels.no;
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return labels.empty;
  }
}

/* -------------------------------------------------------------------------
 * File export
 * ---------------------------------------------------------------------- */

/** RFC 4180 quoting, plus the leading-`=`/`+` guard against formula injection. */
function csvCell(value: string): string {
  const risky = /^[=+\-@\t\r]/.test(value);
  const text = risky ? `'${value}` : value;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** One flattened "field: before → after" string per entry, for the CSV cell. */
function changesCell(diff: unknown, labels: ValueLabels): string {
  const changes = readableChanges(diff);
  if (!changes) return "";
  return changes
    .map(
      (c) =>
        `${humanizeField(c.field)}: ${formatDiffValue(c.before, labels)} -> ${formatDiffValue(c.after, labels)}`,
    )
    .join("; ");
}

export interface CsvHeaders {
  when: string;
  what: string;
  who: string;
  category: string;
  action: string;
  recordType: string;
  recordId: string;
  changes: string;
}

/**
 * The filtered log as CSV, for keeping outside the app.
 *
 * The human sentence is the second column, right after the time, so the file
 * is readable in a spreadsheet without touching the technical columns; the
 * action id and record id trail behind for anyone who needs to trace a row
 * back to the data.
 */
export function toCsv(
  entries: AuditEntry[],
  headers: CsvHeaders,
  labels: ValueLabels,
): string {
  const lines = [
    [
      headers.when,
      headers.what,
      headers.who,
      headers.category,
      headers.action,
      headers.recordType,
      headers.recordId,
      headers.changes,
    ]
      .map(csvCell)
      .join(","),
  ];
  for (const e of entries) {
    lines.push(
      [
        e.timestamp,
        e.summary,
        e.role ?? "",
        categoryOfAction(e.action),
        e.action,
        e.entity,
        e.entityId ?? "",
        changesCell(e.diff, labels),
      ]
        .map((v) => csvCell(String(v)))
        .join(","),
    );
  }
  // Trailing newline: without it some spreadsheet importers drop the last row.
  return lines.join("\r\n") + "\r\n";
}

/** The filtered log as JSON, for a machine or a developer rather than Excel. */
export function toJson(entries: AuditEntry[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      count: entries.length,
      entries,
    },
    null,
    2,
  );
}

/** `factory-log-2026-08-02.csv` — sortable, and obvious in a Downloads folder. */
export function exportFilename(extension: "csv" | "json", now = new Date()): string {
  return `factory-log-${now.toISOString().slice(0, 10)}.${extension}`;
}
