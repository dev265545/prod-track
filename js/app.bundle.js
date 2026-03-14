/**
 * ProdTrack Lite – single bundle (no ES modules), works offline via file://
 */
(function () {
  'use strict';

  var PT = window.PT = {};

  // ---- Schema ----
  var DB_NAME = 'prodtrack-db';
  var DB_VERSION = 1;
  var STORES = {
    ITEMS: 'items',
    EMPLOYEES: 'employees',
    PRODUCTIONS: 'productions',
    ADVANCES: 'advances',
  };

  function createSchema(db) {
    if (!db.objectStoreNames.contains(STORES.ITEMS)) {
      db.createObjectStore(STORES.ITEMS, { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains(STORES.EMPLOYEES)) {
      db.createObjectStore(STORES.EMPLOYEES, { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains(STORES.PRODUCTIONS)) {
      var prodStore = db.createObjectStore(STORES.PRODUCTIONS, { keyPath: 'id' });
      prodStore.createIndex('by_date', 'date', { unique: false });
      prodStore.createIndex('by_employee', 'employeeId', { unique: false });
      prodStore.createIndex('by_item', 'itemId', { unique: false });
      prodStore.createIndex('employee_date', ['employeeId', 'date'], { unique: false });
    }
    if (!db.objectStoreNames.contains(STORES.ADVANCES)) {
      var advStore = db.createObjectStore(STORES.ADVANCES, { keyPath: 'id' });
      advStore.createIndex('by_employee', 'employeeId', { unique: false });
      advStore.createIndex('by_date', 'date', { unique: false });
    }
  }

  // ---- IndexedDB ----
  var dbInstance = null;

  function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = function () { reject(request.error); };
      request.onsuccess = function () {
        dbInstance = request.result;
        resolve(dbInstance);
      };
      request.onupgradeneeded = function (e) {
        createSchema(e.target.result);
      };
    });
  }

  function getStore(db, storeName, mode) {
    mode = mode || 'readonly';
    var tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  function getAll(storeName) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var store = getStore(db, storeName);
        var request = store.getAll();
        request.onsuccess = function () { resolve(request.result || []); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function get(storeName, id) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var store = getStore(db, storeName);
        var request = store.get(id);
        request.onsuccess = function () { resolve(request.result != null ? request.result : null); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function put(storeName, record) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var store = getStore(db, storeName, 'readwrite');
        var request = store.put(record);
        request.onsuccess = function () { resolve(); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function remove(storeName, id) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var store = getStore(db, storeName, 'readwrite');
        var request = store.delete(id);
        request.onsuccess = function () { resolve(); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function deleteWhere(storeName, predicate) {
    return getAll(storeName).then(function (rows) {
      var toDelete = rows.filter(predicate);
      if (toDelete.length === 0) return Promise.resolve(0);
      return Promise.all(toDelete.map(function (r) { return remove(storeName, r.id); })).then(function () {
        return toDelete.length;
      });
    });
  }

  PT.db = { openDB: openDB, getAll: getAll, get: get, put: put, remove: remove, deleteWhere: deleteWhere, STORES: STORES };

  // ---- Date utils ----
  var PERIOD_START_DAY = 16;
  var PERIOD_END_DAY = 15;

  function toISODate(d) {
    var date = d instanceof Date ? d : new Date(d);
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function today() {
    return toISODate(new Date());
  }

  function getPeriodForDate(date) {
    var d = typeof date === 'string' ? new Date(date + 'T12:00:00') : new Date(date);
    var y = d.getFullYear();
    var m = d.getMonth();
    var day = d.getDate();
    var fromYear, fromMonth, toYear, toMonth;
    if (day >= PERIOD_START_DAY) {
      fromMonth = m; fromYear = y;
      toMonth = m + 1; toYear = m === 11 ? y + 1 : y;
    } else {
      fromMonth = m - 1; fromYear = m === 0 ? y - 1 : y;
      toMonth = m; toYear = y;
    }
    var fromDate = new Date(fromYear, fromMonth, PERIOD_START_DAY);
    var toDate = new Date(toYear, toMonth, PERIOD_END_DAY);
    var from = toISODate(fromDate);
    var to = toISODate(toDate);
    var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var label = from + ' – ' + to + ' (' + monthNames[toMonth] + ' ' + toYear + ')';
    return { from: from, to: to, label: label, year: toYear, month: toMonth };
  }

  function getPeriods(count) {
    count = count || 24;
    var now = new Date();
    var periods = [];
    for (var i = count - 1; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 30);
      periods.push(getPeriodForDate(d));
    }
    var seen = {};
    return periods.filter(function (p) {
      var key = p.from + '|' + p.to;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  PT.date = { toISODate: toISODate, today: today, getPeriodForDate: getPeriodForDate, getPeriods: getPeriods };

  // ---- Formatter ----
  var CURRENCY = '₹';
  var LOCALE = 'en-IN';

  function currency(value) {
    if (value == null || Number.isNaN(Number(value))) return CURRENCY + ' 0';
    return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'INR', maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(Number(value));
  }

  function number(n) {
    if (n == null || Number.isNaN(Number(n))) return '0';
    return new Intl.NumberFormat(LOCALE).format(Number(n));
  }

  function dateDisplay(isoDate) {
    if (!isoDate) return '—';
    var d = new Date(isoDate + 'T12:00:00');
    return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  PT.fmt = { currency: currency, number: number, dateDisplay: dateDisplay };

  // ---- Services ----
  var S = STORES;

  var itemService = {
    getItems: function () { return getAll(S.ITEMS); },
    getItem: function (id) { return get(S.ITEMS, id); },
    saveItem: function (item) {
      if (!item.id) item.id = 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      return put(S.ITEMS, item).then(function () { return item; });
    },
    deleteItem: function (id) { return remove(S.ITEMS, id); },
  };

  var employeeService = {
    getEmployees: function (activeOnly) {
      return getAll(S.EMPLOYEES).then(function (list) {
        return activeOnly ? list.filter(function (e) { return e.isActive !== false; }) : list;
      });
    },
    getEmployee: function (id) { return get(S.EMPLOYEES, id); },
    saveEmployee: function (emp) {
      if (!emp.id) emp.id = 'emp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      if (emp.isActive === undefined) emp.isActive = true;
      return put(S.EMPLOYEES, emp).then(function () { return emp; });
    },
    deleteEmployee: function (id) { return remove(S.EMPLOYEES, id); },
  };

  var productionService = {
    getProductionsByDate: function (date) {
      return getAll(S.PRODUCTIONS).then(function (all) { return all.filter(function (p) { return p.date === date; }); });
    },
    getProductionsByEmployee: function (employeeId, fromDate, toDate) {
      return getAll(S.PRODUCTIONS).then(function (all) {
        return all.filter(function (p) {
          return p.employeeId === employeeId && p.date >= fromDate && p.date <= toDate;
        });
      });
    },
    getProductionsInRange: function (fromDate, toDate) {
      return getAll(S.PRODUCTIONS).then(function (all) {
        return all.filter(function (p) { return p.date >= fromDate && p.date <= toDate; });
      });
    },
    getDailyAggregated: function (date) {
      return productionService.getProductionsByDate(date).then(function (list) {
        var result = {};
        list.forEach(function (p) {
          result[p.itemId] = (result[p.itemId] || 0) + (p.quantity || 0);
        });
        return result;
      });
    },
    saveProduction: function (prod) {
      if (!prod.id) prod.id = 'prod_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      return put(S.PRODUCTIONS, prod).then(function () { return prod; });
    },
    deleteProduction: function (id) { return remove(S.PRODUCTIONS, id); },
    deleteProductionsBefore: function (beforeDate) {
      return deleteWhere(S.PRODUCTIONS, function (p) { return p.date < beforeDate; });
    },
  };

  var advanceService = {
    getAdvancesByEmployee: function (employeeId, fromDate, toDate) {
      return getAll(S.ADVANCES).then(function (all) {
        return all.filter(function (a) {
          return a.employeeId === employeeId && a.date >= fromDate && a.date <= toDate;
        });
      });
    },
    saveAdvance: function (adv) {
      if (!adv.id) adv.id = 'adv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      if (!adv.date) adv.date = new Date().toISOString().slice(0, 10);
      return put(S.ADVANCES, adv).then(function () { return adv; });
    },
    deleteAdvance: function (id) { return remove(S.ADVANCES, id); },
    deleteAdvancesBefore: function (beforeDate) {
      return deleteWhere(S.ADVANCES, function (a) { return a.date < beforeDate; });
    },
  };

  function calculateSalary(employeeId, fromDate, toDate) {
    return Promise.all([
      productionService.getProductionsByEmployee(employeeId, fromDate, toDate),
      advanceService.getAdvancesByEmployee(employeeId, fromDate, toDate),
      itemService.getItems(),
    ]).then(function (res) {
      var productions = res[0];
      var advances = res[1];
      var items = res[2];
      var itemMap = {};
      items.forEach(function (i) { itemMap[i.id] = i; });
      var gross = 0;
      var productionRows = productions.map(function (p) {
        var item = itemMap[p.itemId];
        var rate = item ? (item.rate || 0) : 0;
        var qty = p.quantity || 0;
        var value = qty * rate;
        gross += value;
        return { date: p.date, itemName: item ? item.name : p.itemId, quantity: qty, rate: rate, value: value };
      });
      var totalAdvance = advances.reduce(function (sum, a) { return sum + (a.amount || 0); }, 0);
      var advanceRows = advances.map(function (a) { return { date: a.date, amount: a.amount || 0 }; });
      return {
        gross: gross,
        advance: totalAdvance,
        final: gross - totalAdvance,
        productions: productionRows,
        advances: advanceRows,
      };
    });
  }

  function calculateSalaryForPeriod(employeeId, dateInPeriod) {
    var period = getPeriodForDate(dateInPeriod);
    return calculateSalary(employeeId, period.from, period.to);
  }

  var printStyles = 'body{margin:0;font-family:system-ui,sans-serif;font-size:14px;color:#0a0a0a;background:#fff;padding:24px}.mb-4{margin-bottom:16px}.mb-6{margin-bottom:24px}.text-2xl{font-size:1.5rem;font-weight:700}.text-sm{font-size:0.875rem}.text-lg{font-size:1.125rem}.text-gray-600{color:#52525b}.border{border:1px solid #e4e4e7}.border-t-2{border-top:2px solid #e4e4e7}.border-collapse{collapse:collapse}.w-full{width:100%}.table{width:100%;font-size:0.875rem}.table th,.table td{padding:8px;text-align:left;border:1px solid #e4e4e7}.table th{background:#f4f4f5;font-weight:600}.text-right{text-align:right}.pt-2{padding-top:8px}.pt-4{padding-top:16px}.no-print{display:none!important}@media print{body*{visibility:hidden}#printArea,#printArea *{visibility:visible}#printArea{position:absolute;left:0;top:0;width:100%}}';

  function getPrintableSalaryHtml(employeeId, fromDate, toDate) {
    return Promise.all([
      employeeService.getEmployee(employeeId),
      calculateSalary(employeeId, fromDate, toDate),
    ]).then(function (res) {
      var employee = res[0];
      var salary = res[1];
      var name = employee ? employee.name : 'Unknown';
      var rows = salary.productions.map(function (r) {
        return '<tr><td class="border" style="padding:6px 8px">' + dateDisplay(r.date) + '</td><td class="border" style="padding:6px 8px">' + r.itemName + '</td><td class="border text-right" style="padding:6px 8px">' + number(r.quantity) + '</td><td class="border text-right" style="padding:6px 8px">' + currency(r.rate) + '</td><td class="border text-right" style="padding:6px 8px">' + currency(r.value) + '</td></tr>';
      }).join('');
      var advanceRows = salary.advances.map(function (a) {
        return '<tr><td class="border" style="padding:6px 8px">' + dateDisplay(a.date) + '</td><td class="border text-right" colspan="3" style="padding:6px 8px">' + currency(a.amount) + '</td></tr>';
      }).join('');
      var html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Salary - ' + name + '</title><style>' + printStyles + '</style></head><body id="printArea"><div style="max-width:42rem;margin:0 auto"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px"><div><h1 class="text-2xl">ProdTrack Lite</h1><p class="text-sm text-gray-600">Salary Sheet</p></div><div class="text-sm text-right"><p><strong>Period:</strong> ' + dateDisplay(fromDate) + ' – ' + dateDisplay(toDate) + '</p></div></div><div class="mb-4"><p class="text-lg"><strong>Employee:</strong> ' + name + '</p></div><h2 class="text-sm" style="font-weight:600;text-transform:uppercase;color:#52525b;margin-bottom:8px">Production</h2><table class="table w-full border-collapse mb-6"><thead><tr class="border"><th class="border" style="padding:8px">Date</th><th class="border" style="padding:8px">Item</th><th class="border text-right" style="padding:8px">Qty</th><th class="border text-right" style="padding:8px">Rate</th><th class="border text-right" style="padding:8px">Value</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5" class="border" style="padding:8px;color:#71717a">No production in this period.</td></tr>') + '</tbody></table><h2 class="text-sm" style="font-weight:600;text-transform:uppercase;color:#52525b;margin-bottom:8px">Advances</h2><table class="table w-full border-collapse mb-6"><thead><tr class="border"><th class="border" style="padding:8px">Date</th><th class="border text-right" colspan="3" style="padding:8px">Amount</th></tr></thead><tbody>' + (advanceRows || '<tr><td colspan="4" class="border" style="padding:8px;color:#71717a">No advances.</td></tr>') + '</tbody></table><div class="border-t-2 pt-4" style="border-color:#e4e4e7"><p class="text-sm"><strong>Gross (Production):</strong> ' + currency(salary.gross) + '</p><p class="text-sm"><strong>Advance Deducted:</strong> ' + currency(salary.advance) + '</p><p class="text-lg font-bold pt-2" style="font-weight:700;padding-top:8px">Net Pay: ' + currency(salary.final) + '</p></div></div></body></html>';
      return { html: html, employeeName: name, salary: salary };
    });
  }

  var salaryService = {
    calculateSalary: calculateSalary,
    calculateSalaryForPeriod: calculateSalaryForPeriod,
    getPrintableSalaryHtml: getPrintableSalaryHtml,
  };

  PT.services = {
    items: itemService,
    employees: employeeService,
    production: productionService,
    advance: advanceService,
    salary: salaryService,
  };

  // ---- UI: Dashboard ----
  var dashboardNavigate = function () {};

  function renderDashboard(container) {
    var date = today();
    container.innerHTML = '<div class="space-y-6"><div class="flex flex-wrap items-center justify-between gap-4"><h1 class="text-2xl font-bold text-gray-900">Dashboard</h1><div class="flex items-center gap-2"><label class="text-sm text-gray-600">Date</label><input type="date" id="dashboardDate" value="' + date + '" class="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"></div></div><div class="grid grid-cols-1 md:grid-cols-3 gap-4"><div class="bg-white shadow-md rounded-2xl p-6"><h2 class="text-sm font-medium text-gray-500 uppercase tracking-wide">Production today</h2><p id="totalToday" class="text-2xl font-bold text-gray-900 mt-1">—</p></div><div class="bg-white shadow-md rounded-2xl p-6"><h2 class="text-sm font-medium text-gray-500 uppercase tracking-wide">Value today</h2><p id="valueToday" class="text-2xl font-bold text-gray-900 mt-1">—</p></div><div class="bg-white shadow-md rounded-2xl p-6"><h2 class="text-sm font-medium text-gray-500 uppercase tracking-wide">Active employees</h2><p id="activeEmployees" class="text-2xl font-bold text-gray-900 mt-1">—</p></div></div><div class="bg-white shadow-md rounded-2xl p-6"><h2 class="text-xl font-semibold mb-4">Daily production by item</h2><table class="w-full text-sm"><thead><tr class="border-b border-gray-200"><th class="text-left py-2 font-medium">Item</th><th class="text-right py-2 font-medium">Quantity</th><th class="text-right py-2 font-medium">Value</th></tr></thead><tbody id="dailyTable"></tbody></table><p id="dailyEmpty" class="text-gray-500 text-sm py-4 hidden">No production for this date.</p></div><div class="bg-white shadow-md rounded-2xl p-6"><h2 class="text-xl font-semibold mb-4">Quick add production</h2><form id="quickAddForm" class="flex flex-wrap gap-3 items-end"><div><label class="block text-xs font-medium text-gray-500 mb-1">Employee</label><select id="quickEmp" class="rounded-lg border border-gray-300 px-3 py-2 text-sm w-40 focus:ring-2 focus:ring-blue-500"></select></div><div><label class="block text-xs font-medium text-gray-500 mb-1">Item</label><select id="quickItem" class="rounded-lg border border-gray-300 px-3 py-2 text-sm w-48 focus:ring-2 focus:ring-blue-500"></select></div><div><label class="block text-xs font-medium text-gray-500 mb-1">Qty</label><input type="number" id="quickQty" min="1" value="1" class="rounded-lg border border-gray-300 px-3 py-2 text-sm w-20 focus:ring-2 focus:ring-blue-500"></div><div><label class="block text-xs font-medium text-gray-500 mb-1">Date</label><input type="date" id="quickDate" class="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" value="' + date + '"></div><button type="submit" class="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">Add</button></form></div><div id="getStarted" class="bg-white shadow-md rounded-2xl p-6 border border-gray-200 text-center text-gray-500 text-sm"><p class="mb-2">No employees or items yet.</p><p>Add <strong>Items</strong> and <strong>Employees</strong> in <a href="#/settings" class="text-blue-600 hover:underline">Settings</a> to get started.</p></div><div class="bg-white shadow-md rounded-2xl p-6"><h2 class="text-xl font-semibold mb-4">Salary summary (current period)</h2><p class="text-sm text-gray-500 mb-3" id="periodLabel">—</p><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-gray-200"><th class="text-left py-2 font-medium">Employee</th><th class="text-right py-2 font-medium">Gross</th><th class="text-right py-2 font-medium">Advance</th><th class="text-right py-2 font-medium">Net</th><th class="text-right py-2 font-medium"></th></tr></thead><tbody id="salaryTable"></tbody></table></div></div></div>';

    var dashboardDateEl = container.querySelector('#dashboardDate');
    dashboardDateEl.addEventListener('change', function () { refreshDashboard(container, dashboardDateEl.value); });

    container.querySelector('#quickAddForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var empId = container.querySelector('#quickEmp').value;
      var itemId = container.querySelector('#quickItem').value;
      var qty = parseInt(container.querySelector('#quickQty').value, 10) || 1;
      var d = container.querySelector('#quickDate').value;
      if (!empId || !itemId) return;
      productionService.saveProduction({ employeeId: empId, itemId: itemId, date: d, quantity: qty }).then(function () {
        container.querySelector('#quickQty').value = 1;
        refreshDashboard(container, dashboardDateEl.value);
      });
    });

    loadDropdowns(container);
    refreshDashboard(container, date);
  }

  function loadDropdowns(container) {
    Promise.all([employeeService.getEmployees(true), itemService.getItems()]).then(function (res) {
      var employees = res[0], items = res[1];
      var empSelect = container.querySelector('#quickEmp');
      var itemSelect = container.querySelector('#quickItem');
      empSelect.innerHTML = '<option value="">Select employee…</option>' + employees.map(function (e) { return '<option value="' + e.id + '">' + e.name + '</option>'; }).join('');
      itemSelect.innerHTML = '<option value="">Select item…</option>' + items.map(function (i) { return '<option value="' + i.id + '">' + i.name + '</option>'; }).join('');
    });
  }

  function refreshDashboard(container, date) {
    Promise.all([
      productionService.getDailyAggregated(date),
      itemService.getItems(),
      employeeService.getEmployees(true),
      getPeriodForDate(date),
    ]).then(function (res) {
      var aggregated = res[0], items = res[1], employees = res[2], period = res[3];
      var itemMap = {};
      items.forEach(function (i) { itemMap[i.id] = i; });
      var totalQty = 0, totalValue = 0, rows = [];
      for (var itemId in aggregated) {
        var qty = aggregated[itemId];
        var item = itemMap[itemId];
        var rate = item ? (item.rate || 0) : 0;
        var value = qty * rate;
        totalQty += qty;
        totalValue += value;
        rows.push({ name: item ? item.name : itemId, qty: qty, value: value });
      }
      container.querySelector('#totalToday').textContent = number(totalQty);
      container.querySelector('#valueToday').textContent = currency(totalValue);
      container.querySelector('#activeEmployees').textContent = String(employees.length);
      var getStarted = container.querySelector('#getStarted');
      if (getStarted) getStarted.classList.toggle('hidden', employees.length > 0 && items.length > 0);
      var tbody = container.querySelector('#dailyTable');
      var dailyEmpty = container.querySelector('#dailyEmpty');
      if (rows.length === 0) {
        tbody.innerHTML = '';
        dailyEmpty.classList.remove('hidden');
      } else {
        dailyEmpty.classList.add('hidden');
        tbody.innerHTML = rows.map(function (r) {
          return '<tr class="border-b border-gray-100"><td class="py-2">' + r.name + '</td><td class="text-right py-2">' + number(r.qty) + '</td><td class="text-right py-2">' + currency(r.value) + '</td></tr>';
        }).join('');
      }
      container.querySelector('#periodLabel').textContent = period.label;
      var salaryTable = container.querySelector('#salaryTable');
      Promise.all(employees.map(function (e) {
        return calculateSalaryForPeriod(e.id, date).then(function (s) { return { e: e, salary: s }; });
      })).then(function (salaryRows) {
        salaryTable.innerHTML = salaryRows.map(function (r) {
          return '<tr class="border-b border-gray-100"><td class="py-2">' + r.e.name + '</td><td class="text-right py-2">' + currency(r.salary.gross) + '</td><td class="text-right py-2">' + currency(r.salary.advance) + '</td><td class="text-right py-2 font-medium">' + currency(r.salary.final) + '</td><td class="text-right py-2"><button type="button" data-emp-id="' + r.e.id + '" class="text-blue-600 hover:underline text-sm">View</button></td></tr>';
        }).join('');
        salaryTable.querySelectorAll('[data-emp-id]').forEach(function (btn) {
          btn.addEventListener('click', function () { dashboardNavigate('/employee/' + btn.getAttribute('data-emp-id')); });
        });
      });
    });
  }

  PT.ui = { renderDashboard: renderDashboard, setDashboardNavigate: function (fn) { dashboardNavigate = fn; } };

  // ---- UI: Employee page ----
  var employeeNavigate = function () {};

  function renderEmployeePage(container, employeeId) {
    employeeService.getEmployee(employeeId).then(function (employee) {
      if (!employee) {
        container.innerHTML = '<p class="text-gray-500">Employee not found.</p>';
        return;
      }
      var period = getPeriodForDate(today());
      var periods = getPeriods(24);
      container.innerHTML = '<div class="space-y-6"><div class="flex flex-wrap items-center justify-between gap-4"><div><button type="button" id="backToDashboard" class="text-sm text-blue-600 hover:underline mb-1">← Dashboard</button><h1 class="text-2xl font-bold text-gray-900">' + employee.name + '</h1></div></div><div class="bg-white shadow-md rounded-2xl p-6"><h2 class="text-xl font-semibold mb-4">Salary (16th–15th period)</h2><div class="flex flex-wrap gap-4 items-end mb-4"><div><label class="block text-xs font-medium text-gray-500 mb-1">Period</label><select id="periodSelect" class="rounded-lg border border-gray-300 px-3 py-2 text-sm min-w-[220px] focus:ring-2 focus:ring-blue-500">' + periods.map(function (p) { return '<option value="' + p.from + '|' + p.to + '"' + (p.from === period.from ? ' selected' : '') + '>' + p.label + '</option>'; }).join('') + '</select></div><button type="button" id="printSalary" class="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700">Print salary sheet</button></div><div id="salaryPreview" class="grid grid-cols-3 gap-4 text-sm"><p><span class="text-gray-500">Gross:</span> <span id="previewGross">—</span></p><p><span class="text-gray-500">Advance:</span> <span id="previewAdvance">—</span></p><p><span class="text-gray-500 font-medium">Net:</span> <span id="previewFinal" class="font-bold">—</span></p></div></div><div class="bg-white shadow-md rounded-2xl p-6"><h2 class="text-xl font-semibold mb-4">Add production</h2><form id="addProductionForm" class="flex flex-wrap gap-3 items-end"><div><label class="block text-xs font-medium text-gray-500 mb-1">Item</label><select id="prodItem" class="rounded-lg border border-gray-300 px-3 py-2 text-sm w-48 focus:ring-2 focus:ring-blue-500"></select></div><div><label class="block text-xs font-medium text-gray-500 mb-1">Qty</label><input type="number" id="prodQty" min="1" value="1" class="rounded-lg border border-gray-300 px-3 py-2 text-sm w-20 focus:ring-2 focus:ring-blue-500"></div><div><label class="block text-xs font-medium text-gray-500 mb-1">Date</label><input type="date" id="prodDate" class="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" value="' + today() + '"></div><button type="submit" class="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700">Add</button></form></div><div class="bg-white shadow-md rounded-2xl p-6"><h2 class="text-xl font-semibold mb-4">Add advance</h2><form id="addAdvanceForm" class="flex flex-wrap gap-3 items-end"><div><label class="block text-xs font-medium text-gray-500 mb-1">Amount (₹)</label><input type="number" id="advAmount" min="0" step="1" class="rounded-lg border border-gray-300 px-3 py-2 text-sm w-28 focus:ring-2 focus:ring-blue-500"></div><div><label class="block text-xs font-medium text-gray-500 mb-1">Date</label><input type="date" id="advDate" class="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" value="' + today() + '"></div><button type="submit" class="rounded-lg bg-amber-600 text-white px-4 py-2 text-sm font-medium hover:bg-amber-700">Add advance</button></form></div><div class="bg-white shadow-md rounded-2xl p-6"><h2 class="text-xl font-semibold mb-4">Production in period</h2><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-gray-200"><th class="text-left py-2 font-medium">Date</th><th class="text-left py-2 font-medium">Item</th><th class="text-right py-2 font-medium">Qty</th><th class="text-right py-2 font-medium">Value</th><th class="w-10"></th></tr></thead><tbody id="productionTable"></tbody></table></div></div><div class="bg-white shadow-md rounded-2xl p-6"><h2 class="text-xl font-semibold mb-4">Advances in period</h2><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-gray-200"><th class="text-left py-2 font-medium">Date</th><th class="text-right py-2 font-medium">Amount</th><th class="w-10"></th></tr></thead><tbody id="advancesTable"></tbody></table></div></div></div>';

      container.querySelector('#backToDashboard').addEventListener('click', function () { employeeNavigate('/'); });
      var periodSelect = container.querySelector('#periodSelect');
      function refreshPeriod() {
        var parts = periodSelect.value.split('|');
        var from = parts[0], to = parts[1];
        refreshSalaryPreview(container, employeeId, from, to);
        refreshProductionTable(container, employeeId, from, to);
        refreshAdvancesTable(container, employeeId, from, to);
      }
      periodSelect.addEventListener('change', refreshPeriod);
      container.querySelector('#printSalary').addEventListener('click', function () {
        var parts = periodSelect.value.split('|');
        getPrintableSalaryHtml(employeeId, parts[0], parts[1]).then(function (r) {
          var win = window.open('', '_blank', 'width=800,height=600');
          win.document.write(r.html);
          win.document.close();
          win.focus();
          setTimeout(function () { win.print(); }, 300);
        });
      });
      itemService.getItems().then(function (items) {
        container.querySelector('#prodItem').innerHTML = '<option value="">Select item…</option>' + items.map(function (i) { return '<option value="' + i.id + '">' + i.name + '</option>'; }).join('');
      });
      container.querySelector('#addProductionForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var itemId = container.querySelector('#prodItem').value;
        var qty = parseInt(container.querySelector('#prodQty').value, 10) || 1;
        var date = container.querySelector('#prodDate').value;
        if (!itemId) return;
        productionService.saveProduction({ employeeId: employeeId, itemId: itemId, date: date, quantity: qty }).then(function () {
          container.querySelector('#prodQty').value = 1;
          refreshPeriod();
        });
      });
      container.querySelector('#addAdvanceForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var amount = parseFloat(container.querySelector('#advAmount').value) || 0;
        var date = container.querySelector('#advDate').value;
        if (amount <= 0) return;
        advanceService.saveAdvance({ employeeId: employeeId, amount: amount, date: date }).then(function () {
          container.querySelector('#advAmount').value = '';
          refreshPeriod();
        });
      });
      refreshPeriod();
    });
  }

  function refreshSalaryPreview(container, employeeId, from, to) {
    calculateSalary(employeeId, from, to).then(function (salary) {
      container.querySelector('#previewGross').textContent = currency(salary.gross);
      container.querySelector('#previewAdvance').textContent = currency(salary.advance);
      container.querySelector('#previewFinal').textContent = currency(salary.final);
    });
  }

  function refreshProductionTable(container, employeeId, from, to) {
    Promise.all([productionService.getProductionsByEmployee(employeeId, from, to), itemService.getItems()]).then(function (res) {
      var productions = res[0], items = res[1];
      var itemMap = {};
      items.forEach(function (i) { itemMap[i.id] = i; });
      var tbody = container.querySelector('#productionTable');
      tbody.innerHTML = productions.sort(function (a, b) { return a.date.localeCompare(b.date); }).map(function (p) {
        var item = itemMap[p.itemId];
        var rate = item ? (item.rate || 0) : 0;
        var value = (p.quantity || 0) * rate;
        return '<tr class="border-b border-gray-100" data-prod-id="' + p.id + '"><td class="py-2">' + dateDisplay(p.date) + '</td><td class="py-2">' + (item ? item.name : p.itemId) + '</td><td class="text-right py-2">' + number(p.quantity) + '</td><td class="text-right py-2">' + currency(value) + '</td><td class="py-2"><button type="button" class="delete-prod text-red-600 hover:underline text-xs">Delete</button></td></tr>';
      }).join('');
      tbody.querySelectorAll('.delete-prod').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var row = btn.closest('tr');
          var id = row.getAttribute('data-prod-id');
          if (id && confirm('Delete this production entry?')) {
            productionService.deleteProduction(id).then(function () {
              row.remove();
              var parts = container.querySelector('#periodSelect').value.split('|');
              refreshSalaryPreview(container, employeeId, parts[0], parts[1]);
            });
          }
        });
      });
    });
  }

  function refreshAdvancesTable(container, employeeId, from, to) {
    advanceService.getAdvancesByEmployee(employeeId, from, to).then(function (advances) {
      var tbody = container.querySelector('#advancesTable');
      tbody.innerHTML = advances.sort(function (a, b) { return a.date.localeCompare(b.date); }).map(function (a) {
        return '<tr class="border-b border-gray-100" data-adv-id="' + a.id + '"><td class="py-2">' + dateDisplay(a.date) + '</td><td class="text-right py-2">' + currency(a.amount) + '</td><td class="py-2"><button type="button" class="delete-adv text-red-600 hover:underline text-xs">Delete</button></td></tr>';
      }).join('');
      tbody.querySelectorAll('.delete-adv').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var row = btn.closest('tr');
          var id = row.getAttribute('data-adv-id');
          if (id && confirm('Delete this advance?')) {
            advanceService.deleteAdvance(id).then(function () {
              row.remove();
              var parts = container.querySelector('#periodSelect').value.split('|');
              refreshSalaryPreview(container, employeeId, parts[0], parts[1]);
            });
          }
        });
      });
    });
  }

  PT.ui.renderEmployeePage = renderEmployeePage;
  PT.ui.setEmployeeNavigate = function (fn) { employeeNavigate = fn; };

  // ---- UI: Reports ----
  function renderReports(container) {
    var period = getPeriodForDate(today());
    var periods = getPeriods(24);
    container.innerHTML = '<div class="space-y-6"><div class="flex flex-wrap items-center justify-between gap-4"><h1 class="text-2xl font-bold text-gray-900">Aggregated production</h1><div class="flex items-center gap-2"><label class="text-sm text-gray-600">Period</label><select id="reportsPeriod" class="rounded-lg border border-gray-300 px-3 py-2 text-sm min-w-[220px] focus:ring-2 focus:ring-blue-500">' + periods.map(function (p) { return '<option value="' + p.from + '|' + p.to + '"' + (p.from === period.from ? ' selected' : '') + '>' + p.label + '</option>'; }).join('') + '</select></div></div><div class="bg-white shadow-md rounded-2xl p-6"><p class="text-sm text-gray-500 mb-4">Total production by date and item (all employees).</p><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-gray-200"><th class="text-left py-2 font-medium">Date</th><th class="text-left py-2 font-medium">Item</th><th class="text-right py-2 font-medium">Total qty</th><th class="text-right py-2 font-medium">Total value</th></tr></thead><tbody id="aggregatedTable"></tbody></table></div><p id="aggregatedEmpty" class="text-gray-500 text-sm py-4 hidden">No production in this period.</p></div></div>';

    container.querySelector('#reportsPeriod').addEventListener('change', function () {
      refreshAggregated(container, container.querySelector('#reportsPeriod').value);
    });
    refreshAggregated(container, container.querySelector('#reportsPeriod').value);
  }

  function refreshAggregated(container, periodValue) {
    var parts = periodValue.split('|');
    var from = parts[0], to = parts[1];
    Promise.all([productionService.getProductionsInRange(from, to), itemService.getItems()]).then(function (res) {
      var productions = res[0], items = res[1];
      var itemMap = {};
      items.forEach(function (i) { itemMap[i.id] = i; });
      var byDateItem = {};
      productions.forEach(function (p) {
        var key = p.date + '|' + p.itemId;
        if (!byDateItem[key]) byDateItem[key] = { date: p.date, itemId: p.itemId, qty: 0 };
        byDateItem[key].qty += p.quantity || 0;
      });
      var rows = Object.keys(byDateItem).map(function (k) {
        var r = byDateItem[k];
        var item = itemMap[r.itemId];
        return { date: r.date, itemName: item ? item.name : r.itemId, qty: r.qty, value: r.qty * (item ? (item.rate || 0) : 0) };
      }).sort(function (a, b) { return a.date.localeCompare(b.date) || a.itemName.localeCompare(b.itemName); });
      var tbody = container.querySelector('#aggregatedTable');
      var emptyEl = container.querySelector('#aggregatedEmpty');
      if (rows.length === 0) {
        tbody.innerHTML = '';
        emptyEl.classList.remove('hidden');
      } else {
        emptyEl.classList.add('hidden');
        tbody.innerHTML = rows.map(function (r) {
          return '<tr class="border-b border-gray-100"><td class="py-2">' + r.date + '</td><td class="py-2">' + r.itemName + '</td><td class="text-right py-2">' + number(r.qty) + '</td><td class="text-right py-2">' + currency(r.value) + '</td></tr>';
        }).join('');
      }
    });
  }

  PT.ui.renderReports = renderReports;

  // ---- UI: Settings ----
  var settingsNavigate = function () {};

  function renderSettings(container) {
    container.innerHTML = '<div class="space-y-8"><div><button type="button" id="backFromSettings" class="text-sm text-blue-600 hover:underline mb-1">← Dashboard</button><h1 class="text-2xl font-bold text-gray-900">Settings &amp; data</h1></div><div class="bg-white shadow-md rounded-2xl p-6"><h2 class="text-xl font-semibold mb-4 text-red-700">Delete historical data</h2><p class="text-sm text-gray-600 mb-4">Permanently remove all productions and advances before the selected date. This cannot be undone.</p><div class="flex flex-wrap gap-3 items-end"><div><label class="block text-xs font-medium text-gray-500 mb-1">Delete data before (exclusive)</label><input type="date" id="historyBeforeDate" class="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-red-500"></div><button type="button" id="deleteHistoryBtn" class="rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2">Delete historical data</button></div><p id="deleteHistoryResult" class="mt-3 text-sm hidden"></p></div><div class="bg-white shadow-md rounded-2xl p-6"><h2 class="text-xl font-semibold mb-4">Items</h2><div class="overflow-x-auto mb-4"><table class="w-full text-sm"><thead><tr class="border-b border-gray-200"><th class="text-left py-2 font-medium">Name</th><th class="text-right py-2 font-medium">Rate (₹)</th><th class="w-20"></th></tr></thead><tbody id="itemsTable"></tbody></table></div><form id="addItemForm" class="flex flex-wrap gap-3 items-end"><div><label class="block text-xs font-medium text-gray-500 mb-1">Name</label><input type="text" id="itemName" placeholder="e.g. RD CONT - 1000PCS" class="rounded-lg border border-gray-300 px-3 py-2 text-sm w-56 focus:ring-2 focus:ring-blue-500" required></div><div><label class="block text-xs font-medium text-gray-500 mb-1">Rate (₹)</label><input type="number" id="itemRate" min="0" step="0.01" value="0" class="rounded-lg border border-gray-300 px-3 py-2 text-sm w-24 focus:ring-2 focus:ring-blue-500"></div><button type="submit" class="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700">Add item</button></form></div><div class="bg-white shadow-md rounded-2xl p-6"><h2 class="text-xl font-semibold mb-4">Employees</h2><div class="overflow-x-auto mb-4"><table class="w-full text-sm"><thead><tr class="border-b border-gray-200"><th class="text-left py-2 font-medium">Name</th><th class="text-left py-2 font-medium">Status</th><th class="w-20"></th></tr></thead><tbody id="employeesTable"></tbody></table></div><form id="addEmployeeForm" class="flex flex-wrap gap-3 items-end"><div><label class="block text-xs font-medium text-gray-500 mb-1">Name</label><input type="text" id="employeeName" placeholder="Employee name" class="rounded-lg border border-gray-300 px-3 py-2 text-sm w-48 focus:ring-2 focus:ring-blue-500" required></div><button type="submit" class="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700">Add employee</button></form></div></div>';

    container.querySelector('#backFromSettings').addEventListener('click', function () { settingsNavigate('/'); });
    var beforeDate = container.querySelector('#historyBeforeDate');
    var deleteBtn = container.querySelector('#deleteHistoryBtn');
    var resultEl = container.querySelector('#deleteHistoryResult');
    deleteBtn.addEventListener('click', function () {
      var before = beforeDate.value;
      if (!before) {
        resultEl.textContent = 'Please select a date.';
        resultEl.classList.remove('hidden');
        resultEl.classList.add('text-warning');
        return;
      }
      if (!confirm('Permanently delete all productions and advances before ' + before + '? This cannot be undone.')) return;
      deleteBtn.disabled = true;
      Promise.all([productionService.deleteProductionsBefore(before), advanceService.deleteAdvancesBefore(before)]).then(function (res) {
        resultEl.textContent = 'Deleted ' + res[0] + ' production(s) and ' + res[1] + ' advance(s).';
        resultEl.classList.remove('text-warning');
        resultEl.classList.add('text-success');
        resultEl.classList.remove('hidden');
        deleteBtn.disabled = false;
      }).catch(function (e) {
        resultEl.textContent = 'Error: ' + e.message;
        resultEl.classList.add('text-destructive');
        resultEl.classList.remove('text-success');
        resultEl.classList.remove('hidden');
        deleteBtn.disabled = false;
      });
    });

    function refreshItems() {
      itemService.getItems().then(function (items) {
        var tbody = container.querySelector('#itemsTable');
        tbody.innerHTML = items.map(function (i) {
          return '<tr class="border-b border-gray-100"><td class="py-2">' + i.name + '</td><td class="text-right py-2">' + (i.rate != null ? i.rate : 0) + '</td><td class="py-2"><button type="button" class="delete-item text-red-600 hover:underline text-xs" data-id="' + i.id + '">Delete</button></td></tr>';
        }).join('');
        tbody.querySelectorAll('.delete-item').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (confirm('Delete this item? Productions using it will keep the item id but show as unknown.')) {
              itemService.deleteItem(btn.getAttribute('data-id')).then(refreshItems);
            }
          });
        });
      });
    }
    container.querySelector('#addItemForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = container.querySelector('#itemName').value.trim();
      var rate = parseFloat(container.querySelector('#itemRate').value) || 0;
      if (!name) return;
      itemService.saveItem({ name: name, rate: rate }).then(function () {
        container.querySelector('#itemName').value = '';
        container.querySelector('#itemRate').value = '0';
        refreshItems();
      });
    });

    function refreshEmployees() {
      employeeService.getEmployees(false).then(function (employees) {
        var tbody = container.querySelector('#employeesTable');
        tbody.innerHTML = employees.map(function (e) {
          return '<tr class="border-b border-gray-100"><td class="py-2">' + e.name + '</td><td class="py-2">' + (e.isActive !== false ? 'Active' : 'Inactive') + '</td><td class="py-2"><button type="button" class="delete-emp text-red-600 hover:underline text-xs" data-id="' + e.id + '">Delete</button></td></tr>';
        }).join('');
        tbody.querySelectorAll('.delete-emp').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (confirm('Delete this employee? Their productions and advances will remain but show as unknown.')) {
              employeeService.deleteEmployee(btn.getAttribute('data-id')).then(refreshEmployees);
            }
          });
        });
      });
    }
    container.querySelector('#addEmployeeForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = container.querySelector('#employeeName').value.trim();
      if (!name) return;
      employeeService.saveEmployee({ name: name }).then(function () {
        container.querySelector('#employeeName').value = '';
        refreshEmployees();
      });
    });
    refreshItems();
    refreshEmployees();
  }

  PT.ui.renderSettings = renderSettings;
  PT.ui.setSettingsNavigate = function (fn) { settingsNavigate = fn; };

  // ---- App router ----
  var ROUTES = { '': 'dashboard', '/': 'dashboard', '/reports': 'reports', '/settings': 'settings' };

  function getRoute() {
    var hash = window.location.hash.slice(1) || '/';
    var path = hash.charAt(0) === '/' ? hash : '/' + hash;
    if (path.indexOf('/employee/') === 0) return { name: 'employee', id: path.replace('/employee/', '') };
    return { name: ROUTES[path] || 'dashboard', id: null };
  }

  var main = document.getElementById('app');
  if (!main) return;

  function navigate(path) {
    if (path.charAt(0) === '#') path = path.slice(1);
    if (path.charAt(0) !== '/') path = '/' + path;
    window.location.hash = path;
  }

  PT.ui.setDashboardNavigate(navigate);
  PT.ui.setEmployeeNavigate(navigate);
  PT.ui.setSettingsNavigate(navigate);

  function render() {
    var route = getRoute();
    main.innerHTML = '';
    if (route.name === 'dashboard') { renderDashboard(main); return; }
    if (route.name === 'employee') { renderEmployeePage(main, route.id); return; }
    if (route.name === 'reports') { renderReports(main); return; }
    if (route.name === 'settings') { renderSettings(main); return; }
    renderDashboard(main);
  }

  window.addEventListener('hashchange', render);

  openDB().then(render).catch(function (e) {
    console.error(e);
    main.innerHTML = '<p class="p-4 text-red-600">Failed to load app: ' + e.message + '</p>';
  });
})();
