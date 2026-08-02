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
import {
  AUDIT_SCAN_LIMIT,
  listAuditRoles,
  queryAuditEntries,
  type AuditQueryResult,
} from "@/lib/services/auditService";
import {
  EMPTY_FILTER,
  isFilterActive,
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
 * Scale: the `audit_log` store is indexed on `timestamp`, and every read on
 * this screen goes through that index. Opening the viewer, or turning to page
 * 40, deserialises the 50 rows it is about to show and counts the rest with a
 * key walk — not the whole log. Category, role and free text cannot be served
 * by a timestamp index, so those searches scan the newest
 * {@link AUDIT_SCAN_LIMIT} entries of the chosen date range and the result says
 * `truncated`. When it does, the page says so out loud: a filtered audit search
 * that silently shows a subset looks like proof that something never happened.
 *
 * Every read is async, so both are guarded: a filter changed while a page is in
 * flight must not paint the older result, and a new filter resets to page 1.
 */
export default function AuditPage() {
  const { ready: guardReady } = useAuthGuard({ requireAdmin: true });
  const { t } = useLanguage();

  const [view, setView] = React.useState<AuditQueryResult | null>(null);
  const [roles, setRoles] = React.useState<string[]>([]);
  const [state, setState] = React.useState<LoadState>("loading");
  const [filter, setFilter] = React.useState<AuditFilter>(EMPTY_FILTER);
  const [page, setPage] = React.useState(1);
  /** Bumped by retry and by a prune, to re-run the reads without new inputs. */
  const [reloadKey, setReloadKey] = React.useState(0);

  // Every setState lives inside the async callback, never in the effect body:
  // a synchronous setState in an effect costs an extra render pass and is a
  // lint error in this repo. The initial state is already "loading", and the
  // retry button flips it back from its own event handler.
  React.useEffect(() => {
    if (!guardReady) return;
    let cancelled = false;
    void queryAuditEntries(filter, page)
      .then((result) => {
        // A filter or page the owner has already left must not paint.
        if (cancelled) return;
        setView(result);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("[audit] failed to load the activity log", error);
        setView(null);
        setState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [guardReady, filter, page, reloadKey]);

  // The role dropdown does not depend on the filter, so it is read once rather
  // than on every keystroke.
  React.useEffect(() => {
    if (!guardReady) return;
    let cancelled = false;
    void listAuditRoles()
      .then((found) => {
        if (cancelled) return;
        setRoles(found);
      })
      .catch(() => {
        // A failed role read is a poorer dropdown, not a broken page; the
        // entry query below reports the real failure.
        if (cancelled) return;
        setRoles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [guardReady, reloadKey]);

  const reload = React.useCallback(() => setReloadKey((k) => k + 1), []);

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
        {/* Surface token plus a warning border, not `bg-warning/10`. The
            house rule is semantic surfaces rather than alpha modifiers; the
            tint here also carried the panel's whole meaning, and a border
            says "warning" to somebody who cannot see the wash. */}
        <section className="flex w-full min-w-0 items-start gap-3 rounded-xl border border-warning bg-surface-2 p-4">
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
                reload();
              }}
              className="h-11"
            >
              {t("auditRetry")}
            </Button>
          </section>
        ) : !view || view.total === 0 ? (
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
            {/* Said on screen, never only in the console: this search looked
                at a window, so "no more results" is not the same as "nothing
                more happened". */}
            {view.truncated ? (
              <p
                role="status"
                className="flex items-start gap-2 rounded-lg border border-warning bg-surface-2 p-3 text-sm leading-relaxed text-foreground"
              >
                <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
                {t("auditPgTruncated", { count: AUDIT_SCAN_LIMIT })}
              </p>
            ) : null}

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
              {/* Live: typing in the filter box changes this count with no
                  focus moving to it, so it is otherwise silent. */}
              <p className="text-sm text-muted-foreground" aria-live="polite">
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
            <AuditExportCard filter={filter} disabled={(view?.total ?? 0) === 0} />
            <AuditRetentionCard onPruned={reload} />
          </div>
        ) : null}
      </main>
    </AppShell>
  );
}
