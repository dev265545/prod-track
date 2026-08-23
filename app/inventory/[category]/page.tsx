import { INVENTORY_CATEGORIES } from "@/lib/services/inventoryService";
import { CategoryPageClient } from "./CategoryPageClient";

/** Required for static export (Tauri build) — pre-renders all known category routes. */
export function generateStaticParams() {
  return INVENTORY_CATEGORIES.map((c) => ({ category: c.value }));
}

export default async function InventoryCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  return <CategoryPageClient category={category} />;
}
