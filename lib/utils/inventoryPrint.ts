/**
 * ProdTrack Lite - Inventory print/PDF
 */
import { printHtml } from "./print";
import {
  INVENTORY_CATEGORIES,
  type InventoryCategory,
  type InventoryItem,
  type InventoryMovement,
} from "@/lib/services/inventoryService";

type StockRow = InventoryItem & { currentStock: number; isLow: boolean };

function categoryLabel(cat: InventoryCategory): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

function sumByType(
  movements: InventoryMovement[],
  itemId: string,
  type: "inward" | "outward"
): number {
  return movements
    .filter((m) => m.itemId === itemId && m.type === type)
    .reduce((sum, m) => sum + m.qty, 0);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function printInventory(
  rows: StockRow[],
  movements: InventoryMovement[],
  opts?: { title?: string; category?: InventoryCategory | "all" }
): Promise<void> {
  const title = opts?.title ?? "Inventory Report";
  const categoryFilter = opts?.category ?? "all";

  const filteredRows =
    categoryFilter === "all" ? rows : rows.filter((r) => r.category === categoryFilter);

  const generatedAt = new Date().toLocaleString();
  const totalItems = filteredRows.length;
  const lowCount = filteredRows.filter((r) => r.isLow).length;

  const categories = INVENTORY_CATEGORIES.filter(
    (c) => categoryFilter === "all" || c.value === categoryFilter
  );

  const sections = categories
    .map(({ value: category }) => {
      const items = filteredRows.filter((r) => r.category === category);
      if (items.length === 0) return "";

      const tableRows = items
        .map((item) => {
          const inward = sumByType(movements, item.id, "inward");
          const outward = sumByType(movements, item.id, "outward");
          return `<tr class="${item.isLow ? "low" : ""}">
            <td>${escapeHtml(item.code)}</td>
            <td>${escapeHtml(item.name)}</td>
            <td>${escapeHtml(item.unit)}</td>
            <td class="num">${item.openingStock}</td>
            <td class="num">${inward}</td>
            <td class="num">${outward}</td>
            <td class="num">${item.currentStock}</td>
            <td>${item.isLow ? "LOW" : "OK"}</td>
          </tr>`;
        })
        .join("");

      return `
        <h2>${escapeHtml(categoryLabel(category))}</h2>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Unit</th>
              <th class="num">Opening</th>
              <th class="num">Inward</th>
              <th class="num">Outward</th>
              <th class="num">Closing</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>`;
    })
    .join("");

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    font-size: 12px;
    margin: 0;
    padding: 0;
  }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .summary { margin: 0 0 16px; color: #333; font-size: 12px; }
  h2 {
    font-size: 14px;
    margin: 20px 0 6px;
    padding-bottom: 4px;
    border-bottom: 2px solid #333;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 8px;
  }
  th, td {
    border: 1px solid #ccc;
    padding: 4px 8px;
    text-align: left;
  }
  th {
    background: #f0f0f0;
  }
  td.num, th.num { text-align: right; }
  tr.low { background: #fde2e2; }
  tr.low td { font-weight: bold; color: #a11; }
  @media print {
    tr.low { background: #fde2e2 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    th { background: #f0f0f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="summary">
    Generated: ${escapeHtml(generatedAt)} &nbsp;|&nbsp;
    Total items: ${totalItems} &nbsp;|&nbsp;
    Low stock: ${lowCount}
  </div>
  ${sections}
</body>
</html>`;

  await printHtml(html);
}
