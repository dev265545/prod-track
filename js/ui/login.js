/**
 * ProdTrack Lite - Login screen
 * Shown until user enters correct app password. Session expires after 5 hours.
 */

import { login } from '../auth.js';

/**
 * @param {HTMLElement} container
 * @param {() => void} onSuccess - called after successful login
 */
export function renderLogin(container, onSuccess) {
  container.innerHTML = `
    <div class="min-h-[60vh] flex items-center justify-center p-6">
      <div class="w-full max-w-sm bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl shadow-lg p-8">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">ProdTrack Lite</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">Enter password to continue</p>
        <form id="loginForm" class="space-y-4">
          <div>
            <label for="loginPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
            <input type="password" id="loginPassword" autocomplete="current-password" required
              class="w-full rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white dark:bg-white/5 text-gray-900 dark:text-gray-100 px-4 py-3 focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              placeholder="Password">
          </div>
          <p id="loginError" class="text-sm text-red-600 dark:text-red-400 hidden"></p>
          <button type="submit" id="loginSubmit" class="w-full rounded-xl bg-violet-600 hover:bg-violet-700 text-white py-3 font-medium focus:ring-2 focus:ring-violet-500 focus:ring-offset-2">Log in</button>
        </form>
      </div>
    </div>
  `;

  const form = container.querySelector('#loginForm');
  const passwordInput = container.querySelector('#loginPassword');
  const errorEl = container.querySelector('#loginError');
  const submitBtn = container.querySelector('#loginSubmit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = passwordInput.value.trim();
    errorEl.classList.add('hidden');
    submitBtn.disabled = true;
    try {
      const ok = await login(password);
      if (ok) {
        onSuccess();
      } else {
        errorEl.textContent = 'Incorrect password.';
        errorEl.classList.remove('hidden');
        passwordInput.focus();
      }
    } catch (err) {
      errorEl.textContent = err?.message || 'Login failed.';
      errorEl.classList.remove('hidden');
    }
    submitBtn.disabled = false;
  });

  passwordInput.focus();
}
