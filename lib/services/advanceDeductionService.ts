import { getAll, put, STORES } from "@/lib/db/adapter";

const STORE = STORES.ADVANCE_DEDUCTIONS;

function deductionId(employeeId: string, periodFrom: string): string {
  return `ded_${employeeId}_${periodFrom}`;
}

export async function getDeductionsByEmployee(
  employeeId: string
): Promise<Record<string, unknown>[]> {
  const all = await getAll(STORE);
  return all.filter((d) => d.employeeId === employeeId);
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
  const record: Record<string, unknown> = {
    id,
    employeeId,
    periodFrom,
    periodTo,
    amount: Number(amount) || 0,
  };
  await put(STORE, record);
  return record;
}
