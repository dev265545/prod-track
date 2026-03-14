/**
 * ProdTrack Lite - Settings & data management
 * Delete historical data, manage items/employees.
 */

import { deleteProductionsBefore } from "../services/productionService.js";
import { deleteAdvancesBefore } from "../services/advanceService.js";
import { getItems, saveItem, deleteItem } from "../services/itemService.js";
import {
  getEmployees,
  saveEmployee,
  deleteEmployee,
} from "../services/employeeService.js";
import {
  exportDatabase,
  importDatabase,
  validateExportData,
  fetchAutoImportData,
  clearAllData,
  AUTO_IMPORT_PATH,
} from "../db/exportImport.js";
import {
  verifyMasterPassword,
  setAppPassword,
} from "../auth.js";

let onNavigate = () => {};

export function setSettingsNavigate(fn) {
  onNavigate = fn;
}

export function renderSettings(container) {
  const iconTrash = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>';

  container.innerHTML = `
    <div class="space-y-10">
      <div>
        <button type="button" id="backFromSettings" class="text-base text-violet-600 dark:text-violet-400 hover:underline mb-2 block">← Dashboard</button>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">Settings &amp; data</h1>
      </div>

      <div class="bg-white dark-card shadow-md rounded-2xl p-8 border border-gray-200 dark:border-white/10">
        <h2 class="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">Delete historical data</h2>
        <p class="text-base text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">Permanently remove all productions and advances before the selected date. This cannot be undone.</p>
        <div class="flex flex-wrap gap-4 items-end">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Delete data before (exclusive)</label>
            <input type="date" id="historyBeforeDate" class="rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white text-gray-900 dark:text-gray-100 px-4 py-3 text-base w-full max-w-xs focus:ring-2 focus:ring-violet-500 focus:border-violet-500">
          </div>
          <button type="button" id="deleteHistoryBtn" class="rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 text-base font-medium focus:ring-2 focus:ring-violet-500 focus:ring-offset-2">Delete historical data</button>
        </div>
        <p id="deleteHistoryResult" class="mt-4 text-base hidden"></p>
      </div>

      <div class="bg-white dark-card shadow-md rounded-2xl p-8 border border-gray-200 dark:border-white/10">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Export / Import</h2>
        <p class="text-base text-gray-500 dark:text-gray-400 mb-5">Back up your data or move it to another browser. Auto import loads from <code class="text-sm bg-gray-100 dark:bg-white/10 px-1 rounded">${AUTO_IMPORT_PATH}</code> if that file exists (e.g. in <code class="text-sm bg-gray-100 dark:bg-white/10 px-1 rounded">dist/data/</code>).</p>
        <div class="flex flex-wrap gap-3 items-center">
          <button type="button" id="exportDbBtn" class="rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 text-base font-medium focus:ring-2 focus:ring-violet-500 focus:ring-offset-2">Export database</button>
          <label class="rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white dark:bg-white/5 text-gray-900 dark:text-gray-100 px-6 py-3 text-base font-medium cursor-pointer hover:bg-gray-50 dark:hover:bg-white/10 focus-within:ring-2 focus-within:ring-violet-500 focus-within:ring-offset-2">
            Import from file
            <input type="file" id="importFileInput" accept=".json,application/json" class="sr-only">
          </label>
          <button type="button" id="autoImportBtn" class="rounded-xl border-2 border-violet-600 dark:border-violet-400 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 px-6 py-3 text-base font-medium focus:ring-2 focus:ring-violet-500 focus:ring-offset-2">Auto import</button>
        </div>
        <p id="exportImportResult" class="mt-4 text-base hidden"></p>
      </div>

      <div class="bg-white dark-card shadow-md rounded-2xl p-8 border border-gray-200 dark:border-white/10">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Security &amp; master actions</h2>
        <p class="text-base text-gray-500 dark:text-gray-400 mb-5">Change the login password (requires master password). Permanently delete all data (requires master password and double confirmation).</p>
        <div class="flex flex-wrap gap-3 items-center">
          <button type="button" id="changePasswordBtn" class="rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white dark:bg-white/5 text-gray-900 dark:text-gray-100 px-6 py-3 text-base font-medium hover:bg-gray-50 dark:hover:bg-white/10 focus:ring-2 focus:ring-violet-500 focus:ring-offset-2">Change login password</button>
          <button type="button" id="masterDeleteBtn" class="rounded-xl border-2 border-red-600 dark:border-red-500 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 px-6 py-3 text-base font-medium focus:ring-2 focus:ring-red-500 focus:ring-offset-2">Master delete all data</button>
        </div>
        <p id="securityResult" class="mt-4 text-base hidden"></p>
      </div>

      <div class="bg-white dark-card shadow-md rounded-2xl p-8 border border-gray-200 dark:border-white/10">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-5">Items</h2>
        <div class="overflow-x-auto mb-6">
          <table class="w-full text-base">
            <thead>
              <tr class="border-b-2 border-gray-200 dark:border-white/10">
                <th class="text-left py-4 pr-4 font-semibold text-gray-700 dark:text-gray-300">Name</th>
                <th class="text-right py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Rate (₹)</th>
                <th class="w-16 py-4 pl-4"></th>
              </tr>
            </thead>
            <tbody id="itemsTable"></tbody>
          </table>
        </div>
        <form id="addItemForm" class="flex flex-wrap gap-4 items-end">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name</label>
            <input type="text" id="itemName" placeholder="e.g. RD CONT - 1000PCS" class="rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white text-gray-900 dark:text-gray-100 px-4 py-3 text-base w-64 focus:ring-2 focus:ring-violet-500 focus:border-violet-500" required>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Rate (₹)</label>
            <input type="number" id="itemRate" min="0" step="0.01" value="0" class="rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white text-gray-900 dark:text-gray-100 px-4 py-3 text-base w-28 focus:ring-2 focus:ring-violet-500 focus:border-violet-500">
          </div>
          <button type="submit" class="rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 text-base font-medium focus:ring-2 focus:ring-violet-500 focus:ring-offset-2">Add item</button>
        </form>
      </div>

      <div class="bg-white dark-card shadow-md rounded-2xl p-8 border border-gray-200 dark:border-white/10">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-5">Employees</h2>
        <div class="overflow-x-auto mb-6">
          <table class="w-full text-base">
            <thead>
              <tr class="border-b-2 border-gray-200 dark:border-white/10">
                <th class="text-left py-4 pr-4 font-semibold text-gray-700 dark:text-gray-300">Name</th>
                <th class="text-left py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Status</th>
                <th class="w-16 py-4 pl-4"></th>
              </tr>
            </thead>
            <tbody id="employeesTable"></tbody>
          </table>
        </div>
        <form id="addEmployeeForm" class="flex flex-wrap gap-4 items-end">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name</label>
            <input type="text" id="employeeName" placeholder="Employee name" class="rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white text-gray-900 dark:text-gray-100 px-4 py-3 text-base w-56 focus:ring-2 focus:ring-violet-500 focus:border-violet-500" required>
          </div>
          <button type="submit" class="rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 text-base font-medium focus:ring-2 focus:ring-violet-500 focus:ring-offset-2">Add employee</button>
        </form>
      </div>
    </div>
  `;

  container
    .querySelector("#backFromSettings")
    .addEventListener("click", () => onNavigate("/"));

  const beforeDate = container.querySelector("#historyBeforeDate");
  const deleteBtn = container.querySelector("#deleteHistoryBtn");
  const resultEl = container.querySelector("#deleteHistoryResult");

  deleteBtn.addEventListener("click", async () => {
    const before = beforeDate.value;
    if (!before) {
      resultEl.textContent = "Please select a date.";
      resultEl.classList.remove("hidden");
      resultEl.classList.add("text-amber-600");
      return;
    }
    if (
      !confirm(
        `Permanently delete all productions and advances before ${before}? This cannot be undone.`,
      )
    )
      return;
    deleteBtn.disabled = true;
    try {
      const [prodCount, advCount] = await Promise.all([
        deleteProductionsBefore(before),
        deleteAdvancesBefore(before),
      ]);
      resultEl.textContent = `Deleted ${prodCount} production(s) and ${advCount} advance(s).`;
      resultEl.classList.remove("text-amber-600");
      resultEl.classList.add("text-violet-600", "dark:text-violet-400");
      resultEl.classList.remove("hidden");
    } catch (e) {
      resultEl.textContent = "Error: " + e.message;
      resultEl.classList.add("text-violet-600", "dark:text-violet-400");
      resultEl.classList.remove("hidden");
    }
    deleteBtn.disabled = false;
  });

  const exportImportResult = container.querySelector("#exportImportResult");
  function showExportImportMsg(text, isError = false) {
    exportImportResult.textContent = text;
    exportImportResult.classList.remove("hidden");
    exportImportResult.classList.toggle("text-red-600", isError);
    exportImportResult.classList.toggle("text-violet-600", !isError);
    exportImportResult.classList.toggle("dark:text-violet-400", !isError);
  }

  container.querySelector("#exportDbBtn")?.addEventListener("click", async () => {
    const btn = container.querySelector("#exportDbBtn");
    btn.disabled = true;
    try {
      const data = await exportDatabase();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `prodtrack-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      showExportImportMsg("Export downloaded.");
    } catch (e) {
      showExportImportMsg("Export failed: " + (e?.message || e), true);
    }
    btn.disabled = false;
  });

  container.querySelector("#importFileInput")?.addEventListener("change", async (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const importRes = container.querySelector("#exportImportResult");
    try {
      const raw = await file.text();
      const data = JSON.parse(raw);
      const { valid, error } = validateExportData(data);
      if (!valid) {
        showExportImportMsg("Invalid file: " + (error || "unknown"), true);
        return;
      }
      if (!confirm("Import will replace all current data. Continue?")) return;
      await importDatabase(data);
      showExportImportMsg("Import complete. Reload the page to see the data.");
      refreshItems();
      refreshEmployees();
    } catch (err) {
      showExportImportMsg("Import failed: " + (err?.message || err), true);
    }
  });

  container.querySelector("#autoImportBtn")?.addEventListener("click", async () => {
    const btn = container.querySelector("#autoImportBtn");
    btn.disabled = true;
    exportImportResult.classList.add("hidden");
    try {
      const result = await fetchAutoImportData();
      if (!result.success) {
        showExportImportMsg(result.error === "No data file found." ? `No data file found. Place your export at ${AUTO_IMPORT_PATH} (e.g. dist/data/prodtrack-export.json) and try again.` : result.error, true);
        btn.disabled = false;
        return;
      }
      const data = result.data;
      const total = Object.values(data.stores).reduce((s, arr) => s + (arr?.length ?? 0), 0);
      if (!confirm(`Found ${total} records. Import will replace current data. Continue?`)) {
        btn.disabled = false;
        return;
      }
      await importDatabase(data);
      showExportImportMsg("Auto import complete. Reload the page to see the data.");
      refreshItems();
      refreshEmployees();
    } catch (e) {
      showExportImportMsg("Auto import failed: " + (e?.message || e), true);
    }
    btn.disabled = false;
  });

  const securityResult = container.querySelector("#securityResult");
  function showSecurityMsg(text, isError = false) {
    securityResult.textContent = text;
    securityResult.classList.remove("hidden");
    securityResult.classList.toggle("text-red-600", isError);
    securityResult.classList.toggle("dark:text-red-400", isError);
    securityResult.classList.toggle("text-violet-600", !isError);
    securityResult.classList.toggle("dark:text-violet-400", !isError);
  }

  container.querySelector("#changePasswordBtn")?.addEventListener("click", async () => {
    const master = prompt("Enter master password to change login password");
    if (master === null) return;
    if (!verifyMasterPassword(master)) {
      showSecurityMsg("Incorrect master password.", true);
      return;
    }
    const new1 = prompt("Enter new login password");
    if (new1 === null) return;
    const new2 = prompt("Confirm new login password");
    if (new2 === null) return;
    if (new1 !== new2) {
      showSecurityMsg("Passwords do not match.", true);
      return;
    }
    if (!new1.trim()) {
      showSecurityMsg("Password cannot be empty.", true);
      return;
    }
    await setAppPassword(new1.trim());
    showSecurityMsg("Login password updated. Use the new password next time you log in.");
  });

  container.querySelector("#masterDeleteBtn")?.addEventListener("click", async () => {
    if (!confirm("This will permanently delete ALL data (items, employees, productions, advances, everything). This cannot be undone. Continue?")) return;
    const master = prompt("Enter master password to confirm");
    if (master === null) return;
    if (!verifyMasterPassword(master)) {
      showSecurityMsg("Incorrect master password. No data was deleted.", true);
      return;
    }
    const confirmText = prompt("Type DELETE (all caps) to confirm permanent deletion of all data.");
    if (confirmText !== "DELETE") {
      showSecurityMsg(confirmText === null ? "Cancelled." : "Confirmation text did not match. No data was deleted.", true);
      return;
    }
    try {
      await clearAllData();
      showSecurityMsg("All data has been permanently deleted. Reload the page to see an empty app.");
    } catch (e) {
      showSecurityMsg("Error: " + (e?.message || e), true);
    }
  });

  const itemsTable = container.querySelector("#itemsTable");
  const refreshItems = async () => {
    const items = await getItems();
    itemsTable.innerHTML = items
      .map(
        (i) => `
      <tr class="border-b border-gray-100 dark:border-white/10">
        <td class="py-3 pr-4 text-gray-900 dark:text-gray-100">${i.name}</td>
        <td class="text-right py-3 px-4 text-gray-900 dark:text-gray-100">${i.rate ?? 0}</td>
        <td class="py-3 pl-4"><button type="button" class="btn-icon btn-icon-delete delete-item" data-id="${i.id}" title="Delete item" aria-label="Delete item">${iconTrash}</button></td>
      </tr>
    `,
      )
      .join("");
    itemsTable.querySelectorAll(".delete-item").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (
          confirm(
            "Delete this item? Productions using it will keep the item id but show as unknown.",
          )
        ) {
          await deleteItem(btn.getAttribute("data-id"));
          refreshItems();
        }
      });
    });
  };

  container
    .querySelector("#addItemForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = container.querySelector("#itemName").value.trim();
      const rate = parseFloat(container.querySelector("#itemRate").value) || 0;
      if (!name) return;
      await saveItem({ name, rate });
      container.querySelector("#itemName").value = "";
      container.querySelector("#itemRate").value = "0";
      refreshItems();
    });

  const employeesTable = container.querySelector("#employeesTable");
  const refreshEmployees = async () => {
    const employees = await getEmployees(false);
    employeesTable.innerHTML = employees
      .map(
        (e) => `
      <tr class="border-b border-gray-100 dark:border-white/10">
        <td class="py-3 pr-4 text-gray-900 dark:text-gray-100">${e.name}</td>
        <td class="py-3 px-4 text-gray-700 dark:text-gray-300">${e.isActive !== false ? "Active" : "Inactive"}</td>
        <td class="py-3 pl-4"><button type="button" class="btn-icon btn-icon-delete delete-emp" data-id="${e.id}" title="Delete employee" aria-label="Delete employee">${iconTrash}</button></td>
      </tr>
    `,
      )
      .join("");
    employeesTable.querySelectorAll(".delete-emp").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (
          confirm(
            "Delete this employee? Their productions and advances will remain but show as unknown.",
          )
        ) {
          await deleteEmployee(btn.getAttribute("data-id"));
          refreshEmployees();
        }
      });
    });
  };

  container
    .querySelector("#addEmployeeForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = container.querySelector("#employeeName").value.trim();
      if (!name) return;
      await saveEmployee({ name });
      container.querySelector("#employeeName").value = "";
      refreshEmployees();
    });

  refreshItems();
  refreshEmployees();
}
