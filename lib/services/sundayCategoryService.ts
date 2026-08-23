import { getAll, get, put, remove, STORES } from "@/lib/db/adapter";
import { type SundayCategoryRule } from "@/lib/utils/attendanceStats";
import {
  DEFAULT_SUNDAY_RULE,
  EARNS_NO_EXTRA_DAYS_RULE,
  normalizeSundayRule,
  type SundayRule,
} from "@/lib/utils/sundayRule";
import type { AppSettings } from "./appSettingsService";
import { AUDIT_ACTIONS, diffEntity, record as auditRecord } from "./auditService";
import { nameOnRow } from "./auditNames";

const STORE = STORES.SUNDAY_CATEGORIES;

/**
 * Rule shape included on purpose: a change here silently moves what every
 * employee on this category is paid, so it is exactly what a later question
 * about a pay difference needs to see. Legacy fields are listed too, so a
 * change on an un-migrated row is not invisible.
 */
const SUNDAY_CATEGORY_AUDIT_FIELDS = [
  "name",
  "rule",
  "mode",
  "requiredPresent",
  "earnedSundays",
  "everyPresentDays",
  "earnedPerStep",
] as const;

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
  const before = category.id
    ? ((await get(STORE, category.id)) as Record<string, unknown> | null)
    : null;
  const out: SundayCategory = {
    ...category,
    id:
      category.id ??
      `sun_cat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    createdAt: category.createdAt ?? new Date().toISOString().slice(0, 10),
  };
  await put(STORE, out as unknown as Record<string, unknown>);
  void auditRecord(
    before
      ? AUDIT_ACTIONS.sundayCategoryUpdate
      : AUDIT_ACTIONS.sundayCategoryCreate,
    "sunday_categories",
    out.id,
    before
      ? `Sunday rule ${out.name} was changed, which affects the pay of everyone on it`
      : `Sunday rule ${out.name} was created`,
    diffEntity(
      before,
      out as unknown as Record<string, unknown>,
      SUNDAY_CATEGORY_AUDIT_FIELDS,
    ),
  );
  return out;
}

export async function deleteSundayCategory(id: string): Promise<void> {
  const before = (await get(STORE, id)) as Record<string, unknown> | null;
  await remove(STORE, id);
  void auditRecord(
    AUDIT_ACTIONS.sundayCategoryDelete,
    "sunday_categories",
    id,
    `Sunday rule ${nameOnRow(before, "with no name")} was deleted`,
    diffEntity(before, null, SUNDAY_CATEGORY_AUDIT_FIELDS),
  );
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
  unassignedRule: SundayCategoryRule = DEFAULT_SUNDAY_RULE,
): SundayCategoryRule {
  // No category at all is the case this whole `unassignedRule` parameter
  // exists for. It defaults to the built-in rule, so a caller that has not
  // been taught about the setting yet behaves exactly as it always did.
  if (!category) return normalizeSundayRule(unassignedRule);
  if (category.rule) return normalizeSundayRule(category.rule);
  return normalizeSundayRule(category);
}

/**
 * What a worker with no Sunday rule of their own is paid by, and which answer
 * that is, so a screen can say it out loud instead of leaving it silent.
 *
 * `source` is deliberately returned alongside the rule: the People screen has
 * to name the rule these workers fall on, and re-deriving it from settings at
 * the call site is how the screen and the wage drift apart.
 *
 * A rule that names a category which has since been deleted falls back to the
 * built-in rule — the same money everyone was already being paid — and reports
 * itself as `"asBefore"` so the screen says what is really happening rather
 * than naming a rule that no longer exists.
 */
export function resolveUnassignedSundayRule(
  settings: Pick<
    AppSettings,
    "noCategorySundayRule" | "noCategorySundayCategoryId"
  >,
  categories: readonly SundayCategory[] = [],
): {
  rule: SundayCategoryRule;
  source: "asBefore" | "nothing" | "category";
  categoryName: string;
} {
  if (settings.noCategorySundayRule === "nothing") {
    return { rule: EARNS_NO_EXTRA_DAYS_RULE, source: "nothing", categoryName: "" };
  }
  if (settings.noCategorySundayRule === "category") {
    const named = categories.find(
      (c) => c.id === settings.noCategorySundayCategoryId,
    );
    if (named) {
      return {
        rule: resolveSundayCategoryRule(named),
        source: "category",
        categoryName: named.name,
      };
    }
  }
  return { rule: DEFAULT_SUNDAY_RULE, source: "asBefore", categoryName: "" };
}
