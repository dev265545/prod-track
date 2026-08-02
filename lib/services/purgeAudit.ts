/**
 * The one audit entry for a retention purge.
 *
 * There is no purge *service* — the Settings cleanup card calls
 * `deleteProductionsBefore` and `deleteAdvancesBefore` as two separate service
 * calls, and only the card knows the cutoff the owner picked, which categories
 * he ticked, and the counts he was shown before confirming. Those two services
 * are therefore deliberately silent, and everything the log needs is assembled
 * here instead.
 *
 * Kept out of the component so it can be tested without a DOM, and so the
 * shape of the diff is stated once rather than inline in a click handler.
 */

import { AUDIT_ACTIONS, record as auditRecord } from "./auditService";

export interface PurgeOutcome {
  /** ISO date; everything strictly before it was deleted. */
  cutoff: string;
  /** Rows actually deleted. Zero when the category was not ticked. */
  workEntriesRemoved: number;
  advancesRemoved: number;
  /** What the owner ticked, which is not the same as what was found. */
  workEntriesChosen: boolean;
  advancesChosen: boolean;
}

/**
 * `summary` is passed in already rendered, in the operator's language: the
 * card holds the translator, and the log stores prose, never a message key.
 */
export function recordPurge(summary: string, outcome: PurgeOutcome): void {
  void auditRecord(
    AUDIT_ACTIONS.dataPurge,
    "database",
    null,
    summary,
    { ...outcome },
  );
}
