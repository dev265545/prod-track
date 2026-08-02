import { getByIndex, get, put, STORES } from "@/lib/db/adapter";
import { AUDIT_ACTIONS, diffEntity, record as auditRecord } from "./auditService";
import { employeeName } from "./auditNames";

const STORE = STORES.ADVANCE_DEDUCTIONS;

function deductionId(employeeId: string, periodFrom: string): string {
  return `ded_${employeeId}_${periodFrom}`;
}

export async function getDeductionsByEmployee(
  employeeId: string
): Promise<Record<string, unknown>[]> {
  return getByIndex(STORE, "by_employee", employeeId, employeeId);
}

export async function getDeductionForPeriod(
  employeeId: string,
  periodFrom: string,
  periodTo: string
): Promise<Record<string, unknown> | null> {
  const all = await getDeductionsByEmployee(employeeId);
  return (
    all.find(
      (d) => d.periodFrom === periodFrom && d.periodTo === periodTo
    ) ?? null
  );
}

export async function saveDeduction({
  employeeId,
  periodFrom,
  periodTo,
  amount,
}: {
  employeeId: string;
  periodFrom: string;
  periodTo: string;
  amount: number;
}): Promise<Record<string, unknown>> {
  const id = deductionId(employeeId, periodFrom);
  const before = await get(STORE, id);
  const record: Record<string, unknown> = {
    id,
    employeeId,
    periodFrom,
    periodTo,
    amount: Number(amount) || 0,
  };
  await put(STORE, record);
  void logDeduction(before, record);
  return record;
}

async function logDeduction(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): Promise<void> {
  const who = await employeeName(after.employeeId as string);
  const amount = after.amount as number;
  // Zero is how the UI cancels a deduction, so it reads as a clear, not a set.
  const cleared = amount === 0;
  void auditRecord(
    cleared ? AUDIT_ACTIONS.deductionClear : AUDIT_ACTIONS.deductionSet,
    "advance_deductions",
    after.id as string,
    cleared
      ? `Advance deduction for ${who} for ${after.periodFrom} to ${after.periodTo} was removed`
      : `Advance deduction of ${amount} was set for ${who} for ${after.periodFrom} to ${after.periodTo}`,
    diffEntity(before, after, ["amount", "periodFrom", "periodTo"]),
  );
}
