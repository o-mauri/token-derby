import { parseRoute } from './route.js';
import { renderHome } from './render/home.js';
import { renderRace } from './render/race.js';
import { renderOrg } from './render/org.js';
import { renderOrgLive } from './render/org-live.js';
import { renderCatalog } from './render/catalog.js';
import { renderAbout } from './render/about.js';
import { renderPrivacy } from './render/privacy.js';
import { renderOrgManager } from './org-manager/index.js';
import { initTheme } from './theme.js';

// Legendary hat keyframes are installed lazily on the first buildHatGroup
// call (see hat-svg.ts), so every entry point — main.ts, preview-race.ts,
// preview-finished.ts — gets animated legendaries automatically.

document.body.classList.add('tv'); // TV is the only mode
initTheme();

let activeCleanup: (() => void) | null = null;

function route() {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) return;

  if (activeCleanup) { activeCleanup(); activeCleanup = null; }

  const r = parseRoute(window.location.pathname);
  if (r.type === 'home') {
    renderHome(root);
  } else if (r.type === 'race') {
    activeCleanup = renderRace(root, r.joinCode, { showGraphs: true });
  } else if (r.type === 'org') {
    activeCleanup = renderOrg(root, r.orgName);
  } else if (r.type === 'org-live') {
    activeCleanup = renderOrgLive(root, r.orgName);
  } else if (r.type === 'catalog') {
    activeCleanup = renderCatalog(root);
  } else if (r.type === 'about') {
    renderAbout(root);
  } else if (r.type === 'privacy') {
    renderPrivacy(root);
  } else if (r.type === 'org-manager') {
    activeCleanup = renderOrgManager(root);
  } else {
    root.innerHTML = `
      <section class="error">
        <h2>Page not found</h2>
        <p><a href="/">Back to home</a></p>
      </section>
    `;
  }
}

window.addEventListener('popstate', route);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', route, { once: true });
} else {
  route();
}
