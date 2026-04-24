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

export function resolveSundayCategoryRule(
  category?: Pick<
    SundayCategory,
    "mode" | "requiredPresent" | "earnedSundays" | "everyPresentDays" | "earnedPerStep"
  > | null,
): SundayCategoryRule {
  if (!category) return DEFAULT_SUNDAY_CATEGORY_RULE;

  if (category.mode === "threshold") {
    const requiredPresent = Math.max(0, Number(category.requiredPresent ?? 0));
    const earnedSundays = Math.max(0, Number(category.earnedSundays ?? 0));
    if (!requiredPresent || !earnedSundays) return DEFAULT_SUNDAY_CATEGORY_RULE;
    return { mode: "threshold", requiredPresent, earnedSundays };
  }

  const everyPresentDays = Math.max(0, Number(category.everyPresentDays ?? 0));
  const earnedPerStep = Math.max(0, Number(category.earnedPerStep ?? 0));
  if (!everyPresentDays || !earnedPerStep) return DEFAULT_SUNDAY_CATEGORY_RULE;
  return { mode: "step", everyPresentDays, earnedPerStep };
}
