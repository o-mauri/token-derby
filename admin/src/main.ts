import { getToken, setToken, clearToken } from './auth.js';
import { login, fetchUsers, fetchOrganisations } from './api.js';
import { renderLogin } from './render/login.js';
import { renderDashboard } from './render/dashboard.js';

export function boot(root: HTMLElement): void {
  const showLogin = () => {
    renderLogin(root, {
      login: (u, p) => login(u, p),
      onSuccess: (token) => { setToken(token); showDashboard(); },
    });
  };

  const showDashboard = () => {
    renderDashboard(root, {
      fetchUsers: () => fetchUsers(),
      fetchOrganisations: () => fetchOrganisations(),
      onSignOut: () => { clearToken(); showLogin(); },
      onUnauthorized: () => { clearToken(); showLogin(); },
    });
  };

  if (getToken()) showDashboard();
  else showLogin();
}

// Auto-boot in the browser (skipped in tests that import { boot } directly).
const appEl = typeof document !== 'undefined' ? document.querySelector<HTMLElement>('#app') : null;
if (appEl && !(globalThis as any).__ADMIN_NO_AUTOBOOT__) {
  boot(appEl);
}
