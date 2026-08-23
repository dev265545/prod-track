import { describe, it, expect } from "vitest";
import type { AuditEntry } from "../auditService";
import {
  AUDIT_CATEGORIES,
  AUDIT_PAGE_SIZE,
  EMPTY_FILTER,
  categoryOfAction,
  entryDate,
  exportFilename,
  filterEntries,
  formatDiffValue,
  humanizeField,
  isFilterActive,
  paginate,
  readableChanges,
  rolesPresent,
  toCsv,
  toJson,
} from "../auditLogView";

const LABELS = { empty: "—", yes: "Yes", no: "No" };

const HEADERS = {
  when: "When",
  what: "What happened",
  who: "Who",
  category: "Kind",
  action: "Action",
  recordType: "Record type",
  recordId: "Record id",
  changes: "Changes",
};

function entry(over: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: "id",
    timestamp: "2026-08-01T10:00:00.000Z",
    action: "login.success",
    entity: "auth",
    entityId: null,
    summary: "Signed in as admin",
    role: "admin",
    userId: null,
    ...over,
  };
}

describe("categoryOfAction", () => {
  it("buckets every catalogue prefix into a factory-shaped category", () => {
    expect(categoryOfAction("login.success")).toBe("auth");
    expect(categoryOfAction("logout")).toBe("auth");
    expect(categoryOfAction("password.change")).toBe("auth");
    expect(categoryOfAction("attendance.mark")).toBe("attendance");
    expect(categoryOfAction("production.create")).toBe("production");
    expect(categoryOfAction("item.update")).toBe("production");
    expect(categoryOfAction("advance.create")).toBe("money");
    expect(categoryOfAction("salary.override.set")).toBe("money");
    expect(categoryOfAction("employee.delete")).toBe("people");
    expect(categoryOfAction("inventory.inward")).toBe("stock");
    expect(categoryOfAction("holiday.create")).toBe("settings");
    expect(categoryOfAction("data.export")).toBe("data");
    expect(categoryOfAction("audit.prune")).toBe("data");
  });

  it("keeps an unknown action findable under 'other' instead of hiding it", () => {
    expect(categoryOfAction("something.new")).toBe("other");
    expect(AUDIT_CATEGORIES).toContain("other");
  });
});

describe("filterEntries", () => {
  const entries = [
    entry({ id: "a", timestamp: "2026-08-05T09:00:00.000Z", action: "attendance.mark", role: "worker", summary: "Rakesh was marked present on 5 August" }),
    entry({ id: "b", timestamp: "2026-08-01T09:00:00.000Z", action: "advance.create", role: "admin", summary: "Sita was paid an advance of 2000 rupees" }),
    entry({ id: "c", timestamp: "2026-07-20T09:00:00.000Z", action: "login.failure", role: null, summary: "Failed sign-in attempt on the admin password" }),
  ];

  it("returns everything for the empty filter, in the given order", () => {
    expect(filterEntries(entries, EMPTY_FILTER).map((e) => e.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("applies an inclusive date range on the entry's calendar day", () => {
    const only = filterEntries(entries, {
      ...EMPTY_FILTER,
      from: "2026-08-01",
      to: "2026-08-01",
    });
    expect(only.map((e) => e.id)).toEqual(["b"]);
  });

  it("filters by category and by role", () => {
    expect(
      filterEntries(entries, { ...EMPTY_FILTER, category: "money" }).map(
        (e) => e.id,
      ),
    ).toEqual(["b"]);
    expect(
      filterEntries(entries, { ...EMPTY_FILTER, role: "worker" }).map(
        (e) => e.id,
      ),
    ).toEqual(["a"]);
  });

  it("searches the summary case-insensitively", () => {
    expect(
      filterEntries(entries, { ...EMPTY_FILTER, search: "  RAKESH " }).map(
        (e) => e.id,
      ),
    ).toEqual(["a"]);
    expect(
      filterEntries(entries, { ...EMPTY_FILTER, search: "nobody" }),
    ).toEqual([]);
  });

  it("combines filters with AND", () => {
    expect(
      filterEntries(entries, {
        ...EMPTY_FILTER,
        from: "2026-08-01",
        role: "admin",
        search: "advance",
      }).map((e) => e.id),
    ).toEqual(["b"]);
  });

  it("knows whether any filter is set", () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(isFilterActive({ ...EMPTY_FILTER, search: "   " })).toBe(false);
    expect(isFilterActive({ ...EMPTY_FILTER, role: "admin" })).toBe(true);
  });

  it("lists only the roles actually present", () => {
    expect(rolesPresent(entries)).toEqual(["admin", "worker"]);
  });

  it("reads the calendar day off the timestamp", () => {
    expect(entryDate(entries[0])).toBe("2026-08-05");
  });
});

describe("paginate", () => {
  const rows = Array.from({ length: 125 }, (_, i) => entry({ id: `e${i}` }));

  it("slices a page and reports human 1-based positions", () => {
    const page = paginate(rows, 2, 50);
    expect(page.rows).toHaveLength(50);
    expect(page.rows[0].id).toBe("e50");
    expect(page.page).toBe(2);
    expect(page.pageCount).toBe(3);
    expect(page.total).toBe(125);
    expect(page.firstIndex).toBe(51);
    expect(page.lastIndex).toBe(100);
  });

  it("clamps a page number past the end onto the last real page", () => {
    expect(paginate(rows, 99, 50).page).toBe(3);
    expect(paginate(rows, 0, 50).page).toBe(1);
    expect(paginate(rows, -4, 50).page).toBe(1);
  });

  it("survives an empty result set", () => {
    const page = paginate([], 3);
    expect(page.rows).toEqual([]);
    expect(page.pageCount).toBe(1);
    expect(page.total).toBe(0);
    expect(page.firstIndex).toBe(0);
    expect(page.lastIndex).toBe(0);
  });

  it("defaults to the shared page size", () => {
    expect(paginate(rows, 1).rows).toHaveLength(AUDIT_PAGE_SIZE);
  });

  it("handles a partial final page", () => {
    const page = paginate(rows, 3, 50);
    expect(page.rows).toHaveLength(25);
    expect(page.lastIndex).toBe(125);
  });
});

describe("readableChanges", () => {
  it("passes through an array of field changes", () => {
    expect(
      readableChanges([{ field: "name", before: "A", after: "B" }]),
    ).toEqual([{ field: "name", before: "A", after: "B" }]);
  });

  it("derives changed fields from a before/after pair", () => {
    const changes = readableChanges({
      before: { name: "Rakesh", monthlySalary: 12000 },
      after: { name: "Rakesh", monthlySalary: 13000 },
    });
    expect(changes).toEqual([
      { field: "monthlySalary", before: 12000, after: 13000 },
    ]);
  });

  it("strips internal plumbing even when an old entry carries it", () => {
    expect(
      readableChanges([
        { field: "id", before: "1", after: "2" },
        { field: "hash", before: "x", after: "y" },
      ]),
    ).toBeNull();
    expect(
      readableChanges({ before: { id: "1" }, after: { id: "2", name: "B" } }),
    ).toEqual([{ field: "name", before: null, after: "B" }]);
  });

  it("shows a flat parameter bag as after-only values", () => {
    expect(readableChanges({ cutoff: "2025-01-01", removed: 12 })).toEqual([
      { field: "cutoff", before: null, after: "2025-01-01" },
      { field: "removed", before: null, after: 12 },
    ]);
  });

  it("returns null when there is nothing worth showing", () => {
    expect(readableChanges(undefined)).toBeNull();
    expect(readableChanges(null)).toBeNull();
    expect(readableChanges("a string")).toBeNull();
    expect(readableChanges({})).toBeNull();
    expect(readableChanges([])).toBeNull();
  });
});

describe("value rendering", () => {
  it("turns developer field names into readable words", () => {
    expect(humanizeField("monthlySalary")).toBe("Monthly salary");
    expect(humanizeField("hours_extra")).toBe("Hours extra");
    expect(humanizeField("sunday.category")).toBe("Sunday category");
    expect(humanizeField("name")).toBe("Name");
  });

  it("renders booleans and blanks as words, not as code", () => {
    expect(formatDiffValue(true, LABELS)).toBe("Yes");
    expect(formatDiffValue(false, LABELS)).toBe("No");
    expect(formatDiffValue(null, LABELS)).toBe("—");
    expect(formatDiffValue("", LABELS)).toBe("—");
    expect(formatDiffValue(undefined, LABELS)).toBe("—");
    expect(formatDiffValue(2400, LABELS)).toBe("2400");
    expect(formatDiffValue("present", LABELS)).toBe("present");
  });
});

describe("file export", () => {
  it("writes a header row and one row per entry", () => {
    const csv = toCsv(
      [entry({ summary: "Signed in as admin", entityId: "admin" })],
      HEADERS,
      LABELS,
    );
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      "When,What happened,Who,Kind,Action,Record type,Record id,Changes",
    );
    expect(lines[1]).toBe(
      "2026-08-01T10:00:00.000Z,Signed in as admin,admin,auth,login.success,auth,admin,",
    );
  });

  it("quotes commas, quotes and newlines", () => {
    const csv = toCsv(
      [entry({ summary: 'Paid "Sita", 2000 rupees\nin cash' })],
      HEADERS,
      LABELS,
    );
    expect(csv).toContain('"Paid ""Sita"", 2000 rupees\nin cash"');
  });

  it("defuses a summary that a spreadsheet would run as a formula", () => {
    const csv = toCsv([entry({ summary: "=SUM(A1:A9) was written down" })], HEADERS, LABELS);
    expect(csv).toContain("'=SUM(A1:A9) was written down");
  });

  it("flattens the diff into one readable cell", () => {
    const csv = toCsv(
      [
        entry({
          summary: "Rakesh had his salary changed",
          diff: [{ field: "monthlySalary", before: 12000, after: 13000 }],
        }),
      ],
      HEADERS,
      LABELS,
    );
    expect(csv).toContain("Monthly salary: 12000 -> 13000");
  });

  it("ends with a newline so importers keep the last row", () => {
    expect(toCsv([entry()], HEADERS, LABELS).endsWith("\r\n")).toBe(true);
  });

  it("writes JSON with a count and the entries", () => {
    const parsed = JSON.parse(toJson([entry(), entry({ id: "b" })]));
    expect(parsed.count).toBe(2);
    expect(parsed.entries).toHaveLength(2);
    expect(typeof parsed.exportedAt).toBe("string");
  });

  it("names the file by date so a Downloads folder stays sortable", () => {
    const when = new Date("2026-08-02T05:00:00.000Z");
    expect(exportFilename("csv", when)).toBe("factory-log-2026-08-02.csv");
    expect(exportFilename("json", when)).toBe("factory-log-2026-08-02.json");
  });
});
