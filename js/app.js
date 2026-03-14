/**
 * ProdTrack Lite - App entry & hash router
 * Login required; session expires after 5 hours.
 */

import { openDB } from './db/indexeddb.js';
import { isLoggedIn, checkExpiry, logout } from './auth.js';
import { renderLogin } from './ui/login.js';
import { renderDashboard, setDashboardNavigate } from './ui/dashboard.js';
import { renderEmployeePage, setEmployeeNavigate } from './ui/employeePage.js';
import { renderReports } from './ui/reports.js';
import { renderSettings, setSettingsNavigate } from './ui/settings.js';

const ROUTES = {
  '': 'dashboard',
  '/': 'dashboard',
  '/reports': 'reports',
  '/settings': 'settings',
};

function getRoute() {
  const hash = window.location.hash.slice(1) || '/';
  const path = hash.startsWith('/') ? hash : '/' + path;
  if (path.startsWith('/employee/')) return { name: 'employee', id: path.replace('/employee/', '') };
  return { name: ROUTES[path] || 'dashboard', id: null };
}

const main = document.getElementById('app');
const appNav = document.getElementById('appNav');
if (!main) throw new Error('#app not found');

function navigate(path) {
  if (path.startsWith('#')) path = path.slice(1);
  if (!path.startsWith('/')) path = '/' + path;
  window.location.hash = path;
}

function render() {
  if (checkExpiry()) {
    showLogin();
    return;
  }
  const route = getRoute();
  main.innerHTML = '';

  if (route.name === 'dashboard') {
    renderDashboard(main);
    return;
  }
  if (route.name === 'employee') {
    renderEmployeePage(main, route.id);
    return;
  }
  if (route.name === 'reports') {
    renderReports(main);
    return;
  }
  if (route.name === 'settings') {
    renderSettings(main);
    return;
  }

  renderDashboard(main);
}

function showLogin() {
  if (appNav) appNav.style.display = 'none';
  renderLogin(main, () => {
    if (appNav) appNav.style.display = '';
    render();
    setupLogout();
  });
}

function showApp() {
  if (appNav) appNav.style.display = '';
  render();
  setupLogout();
}

function setupLogout() {
  const btn = document.getElementById('logoutBtn');
  if (btn) {
    btn.onclick = () => {
      logout();
      showLogin();
    };
  }
}

setDashboardNavigate(navigate);
setEmployeeNavigate(navigate);
setSettingsNavigate(navigate);

window.addEventListener('hashchange', render);

async function init() {
  await openDB();
  if (!isLoggedIn() || checkExpiry()) {
    showLogin();
    return;
  }
  showApp();
}

init().catch((e) => {
  console.error(e);
  main.innerHTML = '<p class="p-4 text-red-600">Failed to load app: ' + e.message + '</p>';
});
