import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The one page-title scale. Every screen's `<h1>` uses it; three different
 * sizes across the app was the drift this replaces. Exported so the few
 * headers that cannot use `PageHeader` (an employee's name, a stock
 * category) still render at the same size.
 */
export const PAGE_TITLE_CLASS =
  "font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl";

/**
 * The page header every screen starts with: title, one-line intro, and the
 * screen's primary action.
 *
 * **Where the primary action lives.** It used to live in four places
 * depending on the screen — header-right, beside the title, full-width
 * mid-page, or inside a form — so an operator had to find it again on every
 * screen. The rule this component enforces:
 *
 * - The primary action for a *screen* sits in `action`: right-aligned from
 *   `sm` up, full-width and stacked directly under the intro below `sm`.
 * - An action that operates on the fields or rows *around* it — a form's
 *   submit, a bulk edit over a list, a gate on a notice — stays where it is
 *   and the header carries a link to it instead. Hoisting those would put a
 *   write above the controls that scope it, in reading order and in tab
 *   order both.
 *
 * **Tab order.** `action` is rendered after the title and intro and before
 * anything the page puts below the header, so a keyboard user reads the
 * screen's name and purpose before reaching its button, and the button never
 * jumps ahead of a control it depends on.
 *
 * **Thumb reach.** Below `sm` the action is a full-width target pinned to the
 * top of the page, above the fold and above any scrolling content. That is
 * deliberate: a full-width button placed mid-list is exactly where a thumb
 * lands after a flick-scroll, and it is why the roster's bulk button is not
 * allowed in this slot.
 *
 * **Width.** Everything is `min-w-0` inside a wrapping flex row, so a long
 * title or a wide toolbar wraps instead of widening the page. No horizontal
 * page scroll from 320px up.
 */
export function PageHeader({
  title,
  intro,
  action,
  className,
}: {
  title: React.ReactNode;
  /** One line saying what the screen is for. Omitted only where the page
   *  itself is the explanation (the login screen). */
  intro?: React.ReactNode;
  /**
   * The screen's primary action, or the small group of controls that scope
   * it. Leave it out when the screen genuinely has no single primary action
   * — an arbitrary promotion is worse than an empty slot.
   */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex min-w-0 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className={PAGE_TITLE_CLASS}>{title}</h1>
        {intro ? (
          <p className="max-w-prose min-w-0 text-sm text-muted-foreground">
            {intro}
          </p>
        ) : null}
      </div>
      {action ? (
        // Below `sm` every direct child goes full width and stacks; from `sm`
        // up they sit in a wrapping right-aligned row. `items-end` so a
        // labelled select lines up with a bare button beside it.
        <div className="flex w-full min-w-0 flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-end sm:justify-end">
          {action}
        </div>
      ) : null}
    </header>
  );
}
