// Standalone preview of the not-found pages. Loaded by /preview-not-found.html.
// ?page=race or ?page=org stubs the API to 404; with neither, main.ts's own
// unknown-route page renders, since /preview-not-found is not a site route.
import { renderOrg } from './render/org.js';
import { renderRace } from './render/race.js';
import { initTheme } from './theme.js';

const page = new URLSearchParams(location.search).get('page');
const code = page === 'race' ? 'RACE_NOT_FOUND' : 'ORG_NOT_FOUND';
window.fetch = async () => new Response(JSON.stringify({ code, message: 'not found' }), {
  status: 404,
  headers: { 'content-type': 'application/json' },
});

const root = document.querySelector<HTMLElement>('#app')!;
if (page === 'race') {
  document.body.classList.add('tv');
  initTheme();
  renderRace(root, 'ABC123');
} else if (page === 'org') {
  document.body.classList.add('tv');
  initTheme();
  renderOrg(root, 'stackwon');
} else {
  void import('./main.js');
}
