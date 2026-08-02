import { getAll, get, put, remove, STORES } from "@/lib/db/adapter";
import { type SundayCategoryRule } from "@/lib/utils/attendanceStats";
import { normalizeSundayRule, type SundayRule } from "@/lib/utils/sundayRule";

const STORE = STORES.SUNDAY_CATEGORIES;

/**
 * A named pay rule an employee can be assigned to.
 *
 * `rule` is the current, fully configurable form. The `mode` / `requiredPresent`
 * / `earnedSundays` / `everyPresentDays` / `earnedPerStep` fields are what
 * installs written by older builds carry instead; they are still read (see
 * {@link resolveSundayCategoryRule}) and are left untouched on rows that have
 * them, so a downgrade does not lose anyone's rule.
 */
export interface SundayCategory {
  id: string;
  name: string;
  rule?: SundayRule;
  /** @deprecated legacy shape — read for migration, never written for new rows. */
  mode?: "threshold" | "step";
  /** @deprecated legacy shape */
  requiredPresent?: number;
  /** @deprecated legacy shape */
  earnedSundays?: number;
  /** @deprecated legacy shape */
  everyPresentDays?: number;
  /** @deprecated legacy shape */
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
 * Turn a stored Sunday category into the rule the payroll engine consumes.
 *
 * A row saved by the current build carries `rule` and is used directly. A row
 * from an older install carries only the legacy `mode` fields and is migrated
 * on read into the equivalent general rule — same cycle length, same caps, same
 * numbers, so nobody's pay moves when a factory updates.
 *
 * The default rule is substituted only when a field is genuinely **unset**. A
 * field explicitly configured as `0` is honoured, so a category can express
 * "this group earns no Sundays" — see `configuredNonNegative` in
 * `lib/utils/sundayRule.ts`.
 */
export function resolveSundayCategoryRule(
  category?: Partial<SundayCategory> | null,
): SundayCategoryRule {
  if (!category) return normalizeSundayRule(null);
  if (category.rule) return normalizeSundayRule(category.rule);
  return normalizeSundayRule(category);
}
