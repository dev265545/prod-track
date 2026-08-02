import { getAll, get, put, remove, STORES } from "@/lib/db/adapter";
import {
  DEFAULT_SUNDAY_CATEGORY_RULE,
  type SundayCategoryRule,
} from "@/lib/utils/attendanceStats";

const STORE = STORES.SUNDAY_CATEGORIES;

export interface SundayCategory {
  id: string;
  name: string;
  mode: "threshold" | "step";
  requiredPresent?: number;
  earnedSundays?: number;
  everyPresentDays?: number;
  earnedPerStep?: number;
  createdAt?: string;
}

export async function getSundayCategories(): Promise<SundayCategory[]> {
  const rows = await getAll(STORE);
  return (rows as unknown as SundayCategory[]).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export async function getSundayCategory(id: string): Promise<SundayCategory | null> {
  return (await get(STORE, id)) as SundayCategory | null;
}

export async function saveSundayCategory(
  category: Omit<SundayCategory, "id"> & { id?: string },
): Promise<SundayCategory> {
  const out: SundayCategory = {
    ...category,
    id:
      category.id ??
      `sun_cat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    createdAt: category.createdAt ?? new Date().toISOString().slice(0, 10),
  };
  await put(STORE, out as unknown as Record<string, unknown>);
  return out;
}

export async function deleteSundayCategory(id: string): Promise<void> {
  await remove(STORE, id);
}

/**
 * A configured non-negative number, or `null` when the field is genuinely unset
 * (undefined / null / empty / non-numeric). An explicit `0` is a *configuration*,
 * not an absence — see resolveSundayCategoryRule.
 */
function configuredNonNegative(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, n);
}

/**
 * Turn a stored Sunday category into the rule the payroll engine consumes.
 *
 * The default rule is substituted only when a field is genuinely **unset**.
 * A field explicitly configured as `0` is honoured, so a category can express
 * "this group earns no Sundays" (`earnedSundays: 0` / `earnedPerStep: 0`) —
 * previously that was silently replaced by the default and quietly paid people.
 * `everyPresentDays: 0` is the one exception: it is not a rule but a division by
 * zero, so it still falls back to the default.
 */
export function resolveSundayCategoryRule(
  category?: Pick<
    SundayCategory,
    "mode" | "requiredPresent" | "earnedSundays" | "everyPresentDays" | "earnedPerStep"
  > | null,
): SundayCategoryRule {
  if (!category) return DEFAULT_SUNDAY_CATEGORY_RULE;

  if (category.mode === "threshold") {
    const requiredPresent = configuredNonNegative(category.requiredPresent);
    const earnedSundays = configuredNonNegative(category.earnedSundays);
    if (requiredPresent === null || earnedSundays === null) {
      return DEFAULT_SUNDAY_CATEGORY_RULE;
    }
    return { mode: "threshold", requiredPresent, earnedSundays };
  }

  const everyPresentDays = configuredNonNegative(category.everyPresentDays);
  const earnedPerStep = configuredNonNegative(category.earnedPerStep);
  if (!everyPresentDays || earnedPerStep === null) {
    return DEFAULT_SUNDAY_CATEGORY_RULE;
  }
  return { mode: "step", everyPresentDays, earnedPerStep };
}
