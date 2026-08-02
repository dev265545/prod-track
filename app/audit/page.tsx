"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ScrollText,
  ShieldAlert,
  SearchX,
  TriangleAlert,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { Button } from "@/components/ui/button";
import { useAuthGuard } from "@/lib/hooks/useAuthGuard";
import { useLanguage } from "@/components/language-provider";
import { listAuditEntries, type AuditEntry } from "@/lib/services/auditService";
import {
  AUDIT_PAGE_SIZE,
  EMPTY_FILTER,
  filterEntries,
  isFilterActive,
  paginate,
  rolesPresent,
  type AuditFilter,
} from "@/lib/services/auditLogView";
import { AuditEntryRow } from "@/components/audit/audit-entry-row";
import { AuditFilters } from "@/components/audit/audit-filters";
import { AuditExportCard } from "@/components/audit/audit-export-card";
import { AuditRetentionCard } from "@/components/audit/audit-retention-card";

type LoadState = "loading" | "ready" | "failed";

/**
 * The activity log.
 *
 * Admin-only, enforced by `useAuthGuard({ requireAdmin: true })` — which reads
 * the role inside an effect, after mount. Reading it during render would make
 * the server markup and the first client paint disagree, and the visible cost
 * of that mismatch is a flash of the whole factory's history in front of
 * whoever happens to be at the terminal.
 *
 * Scale: the `audit_log` store has no timestamp index (adding one belongs in
 * `lib/db/indexes.ts`, which this change does not own), so the log is read
 * once into memory and filtered and paged there. Filtering is one linear pass
 * memoised on the filter, so typing in the search box re-runs it over an array
 * and nothing else; only 50 rows are ever mounted. That holds comfortably into
 * the tens of thousands of entries — several years of a busy factory — and the
 * retention card warns the owner before it stops holding.
 */
export default function AuditPage() {
  const { ready: guardReady } = useAuthGuard({ requireAdmin: true });
  const { t } = useLanguage();

  const [entries, setEntries] = React.useState<AuditEntry[]>([]);
  const [state, setState] = React.useState<LoadState>("loading");
  const [filter, setFilter] = React.useState<AuditFilter>(EMPTY_FILTER);
  const [page, setPage] = React.useState(1);

  // Deliberately does not flip to "loading" synchronously: it is called from
  // an effect, and a setState in an effect body costs a whole extra render
  // pass. The initial state is already "loading", and the retry button sets it
  // itself from an event handler.
  const load = React.useCallback(() => {
    return listAuditEntries()
      .then((rows) => {
        setEntries(rows);
        setState("ready");
      })
      .catch((error: unknown) => {
        console.error("[audit] failed to load the activity log", error);
        setEntries([]);
        setState("failed");
      });
  }, []);

  React.useEffect(() => {
    if (!guardReady) return;
    void load();
  }, [guardReady, load]);

  const matching = React.useMemo(
    () => filterEntries(entries, filter),
    [entries, filter],
  );
  const view = React.useMemo(
    () => paginate(matching, page, AUDIT_PAGE_SIZE),
    [matching, page],
  );
  const roles = React.useMemo(() => rolesPresent(entries), [entries]);

  // Narrowing the results under a deep page number would otherwise leave the
  // owner staring at an empty page 4 of a 2-page list.
  const changeFilter = (next: AuditFilter) => {
    setFilter(next);
    setPage(1);
  };

  if (!guardReady) {
    return <AppLoadingScreen title={t("auditLoading")} />;
  }

  return (
    <AppShell>
      <main className="animate-fade-in flex w-full min-w-0 flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="flex items-center gap-3 font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            <ScrollText className="size-8 shrink-0 text-primary" aria-hidden />
            {t("auditPageTitle")}
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            {t("auditPageIntro")}
          </p>
        </header>

        {/* Said on the page, not only in a code comment: the log lives in the
            same file as the data it describes, and the role it stamps is a
            browser value. An owner who is about to lean on it in an argument
            about wages deserves to know that before he does. */}
        <section className="flex w-full min-w-0 items-start gap-3 rounded-xl border border-border bg-warning/10 p-4">
          <ShieldAlert className="mt-0.5 size-6 shrink-0 text-warning" aria-hidden />
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="font-heading text-base font-semibold text-foreground">
              {t("auditWarningTitle")}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("auditWarningBody")}
            </p>
          </div>
        </section>

        <AuditFilters
          filter={filter}
          onChange={changeFilter}
          onClear={() => changeFilter(EMPTY_FILTER)}
          roles={roles}
        />

        {state === "loading" ? (
          <p className="py-12 text-center text-base text-muted-foreground">
            {t("auditLoading")}
          </p>
        ) : state === "failed" ? (
          <section className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
            <TriangleAlert className="size-10 shrink-0 text-destructive" aria-hidden />
            <h2 className="font-heading text-lg font-semibold text-foreground">
              {t("auditErrorTitle")}
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              {t("auditErrorBody")}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setState("loading");
                void load();
              }}
              className="h-11"
            >
              {t("auditRetry")}
            </Button>
          </section>
        ) : matching.length === 0 ? (
          <section className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
            {isFilterActive(filter) ? (
              <>
                <SearchX className="size-10 shrink-0 text-muted-foreground" aria-hidden />
                <h2 className="font-heading text-lg font-semibold text-foreground">
                  {t("auditNoMatchTitle")}
                </h2>
                <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                  {t("auditNoMatchBody")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => changeFilter(EMPTY_FILTER)}
                  className="h-11"
                >
                  {t("auditFilterClear")}
                </Button>
              </>
            ) : (
              <>
                <ScrollText className="size-10 shrink-0 text-muted-foreground" aria-hidden />
                <h2 className="font-heading text-lg font-semibold text-foreground">
                  {t("auditEmptyTitle")}
                </h2>
                <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                  {t("auditEmptyBody")}
                </p>
              </>
            )}
          </section>
        ) : (
          <section className="flex w-full min-w-0 flex-col gap-4">
            <ul className="w-full min-w-0 list-none rounded-xl border border-border bg-card">
              {view.rows.map((entry) => (
                <AuditEntryRow key={entry.id} entry={entry} />
              ))}
            </ul>

            <nav
              aria-label={t("auditPageOf", {
                page: view.page,
                pages: view.pageCount,
              })}
              className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between"
            >
              <p className="text-sm text-muted-foreground">
                {t("auditShowing", {
                  first: view.firstIndex,
                  last: view.lastIndex,
                  total: view.total,
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPage(view.page - 1)}
                  disabled={view.page <= 1}
                  className="h-11 gap-1"
                >
                  <ChevronLeft className="size-5 shrink-0" aria-hidden />
                  {t("auditPrev")}
                </Button>
                <span className="min-w-0 px-1 text-sm text-muted-foreground">
                  {t("auditPageOf", {
                    page: view.page,
                    pages: view.pageCount,
                  })}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPage(view.page + 1)}
                  disabled={view.page >= view.pageCount}
                  className="h-11 gap-1"
                >
                  {t("auditNext")}
                  <ChevronRight className="size-5 shrink-0" aria-hidden />
                </Button>
              </div>
            </nav>
          </section>
        )}

        {state === "ready" ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AuditExportCard entries={matching} />
            <AuditRetentionCard entries={entries} onPruned={() => void load()} />
          </div>
        ) : null}
      </main>
    </AppShell>
  );
}
