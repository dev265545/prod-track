import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/components/language-provider";
import type { AuditEntry } from "@/lib/services/auditService";

/**
 * The viewer now reads the log a page at a time, through the timestamp index,
 * instead of loading it whole and slicing in the page. That swap is invisible
 * to the type checker and to the pure tests of `auditLogView`, and it is the
 * kind of change that breaks quietly:
 *
 *  1. a filter typed while a page is in flight can paint the older answer,
 *  2. a filter changed on page 4 can leave the owner on an empty page 4,
 *  3. a search capped at 10,000 rows can show a subset with no sign of it —
 *     the one failure mode an audit log must never have, because it reads as
 *     proof that something did not happen,
 *  4. "nothing recorded yet", "nothing matches" and "it would not open" can
 *     collapse into one another once the empty page is a query result rather
 *     than an array.
 */

const queryAuditEntries = vi.fn();
const listAuditRoles = vi.fn();
const collectAuditEntries = vi.fn();
const readAuditLogHealth = vi.fn();
const readCountEntriesBefore = vi.fn();

vi.mock("@/lib/services/auditService", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/services/auditService")
  >("@/lib/services/auditService");
  return {
    ...actual,
    queryAuditEntries: (...args: unknown[]) => queryAuditEntries(...args),
    listAuditRoles: (...args: unknown[]) => listAuditRoles(...args),
    collectAuditEntries: (...args: unknown[]) => collectAuditEntries(...args),
    readAuditLogHealth: (...args: unknown[]) => readAuditLogHealth(...args),
    readCountEntriesBefore: (...args: unknown[]) =>
      readCountEntriesBefore(...args),
    pruneAuditEntriesBefore: vi.fn(),
    record: vi.fn(),
  };
});

vi.mock("@/lib/hooks/useAuthGuard", () => ({
  useAuthGuard: () => ({ ready: true, role: "admin" }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import AuditPage from "@/app/audit/page";
import { AUDIT_PAGE_SIZE } from "@/lib/services/auditLogView";

function entry(n: number): AuditEntry {
  return {
    id: `e${n}`,
    timestamp: `2026-07-${String((n % 28) + 1).padStart(2, "0")}T09:00:00.000Z`,
    action: "attendance.mark",
    entity: "attendance",
    entityId: `a${n}`,
    summary: `Asha Devi was marked present on day ${n}`,
    role: "admin",
    userId: null,
  };
}

/** What `queryAuditEntries` returns for a full page of a multi-page log. */
function pageResult(page: number, total: number, truncated = false) {
  const start = (page - 1) * AUDIT_PAGE_SIZE;
  const rows = Array.from(
    { length: Math.max(0, Math.min(AUDIT_PAGE_SIZE, total - start)) },
    (_, i) => entry(start + i),
  );
  return {
    rows,
    page,
    pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
    total,
    firstIndex: rows.length ? start + 1 : 0,
    lastIndex: rows.length ? start + rows.length : 0,
    truncated,
  };
}

const EMPTY_RESULT = {
  rows: [],
  page: 1,
  pageCount: 1,
  total: 0,
  firstIndex: 0,
  lastIndex: 0,
  truncated: false,
};

function renderPage() {
  render(
    <LanguageProvider>
      <AuditPage />
    </LanguageProvider>,
  );
}

/** The filter object handed to the most recent query. */
function lastQuery() {
  const call = queryAuditEntries.mock.calls.at(-1);
  return { filter: call?.[0], page: call?.[1] as number };
}

beforeEach(() => {
  vi.clearAllMocks();
  queryAuditEntries.mockResolvedValue(EMPTY_RESULT);
  listAuditRoles.mockResolvedValue(["admin", "worker"]);
  collectAuditEntries.mockResolvedValue({ entries: [], truncated: false });
  readAuditLogHealth.mockResolvedValue({
    count: 0,
    cap: 20000,
    overCap: false,
    oldest: null,
  });
  readCountEntriesBefore.mockResolvedValue(0);
});

describe("activity log viewer", () => {
  it("reads only the page it shows, and turns the page through the query", async () => {
    const user = userEvent.setup();
    queryAuditEntries.mockImplementation(async (_f: unknown, page: number) =>
      pageResult(page, 130),
    );
    renderPage();

    await screen.findByText("Showing 1 to 50 of 130");
    expect(lastQuery().page).toBe(1);

    await user.click(screen.getByRole("button", { name: "Next" }));

    await screen.findByText("Showing 51 to 100 of 130");
    expect(lastQuery().page).toBe(2);
    // Never the whole log: one paged query per page shown, and 50 rows in
    // hand rather than 130.
    expect(queryAuditEntries).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole("listitem")).toHaveLength(AUDIT_PAGE_SIZE);
  });

  it("goes back to page 1 when the filter changes", async () => {
    const user = userEvent.setup();
    queryAuditEntries.mockImplementation(async (_f: unknown, page: number) =>
      pageResult(page, 130),
    );
    renderPage();

    await screen.findByText("Showing 1 to 50 of 130");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Showing 51 to 100 of 130");

    await user.type(screen.getByRole("textbox", { name: "Search" }), "a");

    await waitFor(() => expect(lastQuery().filter.search).toBe("a"));
    // Page 4 of a 2-page result is an empty screen and a bug report.
    expect(lastQuery().page).toBe(1);
  });

  it("says so when the search only looked at the newest entries", async () => {
    queryAuditEntries.mockResolvedValue(pageResult(1, 60, true));
    renderPage();

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(
      "Searched the most recent 10000 entries only. Narrow the date range to look further back.",
    );
  });

  it("shows no truncation notice when the result is complete", async () => {
    queryAuditEntries.mockResolvedValue(pageResult(1, 60, false));
    renderPage();

    await screen.findByText("Showing 1 to 50 of 60");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("distinguishes an empty log from an empty search", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Nothing has been recorded yet",
      }),
    ).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Search" }), "zzz");

    expect(
      await screen.findByRole("heading", {
        name: "Nothing matches what you asked for",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Nothing has been recorded yet" }),
    ).toBeNull();
  });

  it("shows the failure state, and retries from it", async () => {
    const user = userEvent.setup();
    queryAuditEntries.mockRejectedValueOnce(new Error("no database"));
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "The activity log could not be opened",
      }),
    ).toBeInTheDocument();
    // Not the empty state: "it did not open" and "there is nothing in it" are
    // opposite conclusions about the same blank screen.
    expect(
      screen.queryByRole("heading", { name: "Nothing has been recorded yet" }),
    ).toBeNull();

    queryAuditEntries.mockResolvedValue(pageResult(1, 60));
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await screen.findByText("Showing 1 to 50 of 60");
  });

  it("ignores a result that arrives for a filter the owner has left", async () => {
    const user = userEvent.setup();
    const first: { release: () => void } = { release: () => {} };
    queryAuditEntries.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          first.release = () => resolve(pageResult(1, 130));
        }),
    );
    queryAuditEntries.mockImplementation(async () => pageResult(1, 7));
    renderPage();

    await waitFor(() => expect(queryAuditEntries).toHaveBeenCalledTimes(1));
    await user.type(screen.getByRole("textbox", { name: "Search" }), "asha");
    await screen.findByText("Showing 1 to 7 of 7");

    first.release();

    // The stale answer must never overwrite the filtered one.
    await waitFor(() =>
      expect(screen.queryByText("Showing 1 to 50 of 130")).toBeNull(),
    );
    expect(screen.getByText("Showing 1 to 7 of 7")).toBeInTheDocument();
  });
});
