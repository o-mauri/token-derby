import { parseRoute } from './route.js';
import { renderHome } from './render/home.js';
import { renderRace } from './render/race.js';
import { renderOrg } from './render/org.js';
import { buildLegendaryKeyframes } from './hat-svg.js';

// Inject legendary hat keyframes once at startup
const hatStyle = document.createElement('style');
hatStyle.textContent = buildLegendaryKeyframes();
document.head.appendChild(hatStyle);

let activeCleanup: (() => void) | null = null;

function route() {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) return;

  if (activeCleanup) { activeCleanup(); activeCleanup = null; }

  const r = parseRoute(window.location.pathname);
  if (r.type === 'home') {
    renderHome(root);
  } else if (r.type === 'race') {
    activeCleanup = renderRace(root, r.joinCode);
  } else if (r.type === 'org') {
    activeCleanup = renderOrg(root, r.orgName);
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
