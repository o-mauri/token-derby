// Standalone preview of the loading state, frozen: every API call stays pending.
// Loaded by /preview-loader.html. ?page=race shows the race view, otherwise the org page.
import { renderOrg } from './render/org.js';
import { renderRace } from './render/race.js';
import { initTheme } from './theme.js';

window.fetch = () => new Promise<Response>(() => {});

document.body.classList.add('tv');
initTheme();

const root = document.querySelector<HTMLElement>('#app')!;
if (new URLSearchParams(location.search).get('page') === 'race') {
  renderRace(root, 'PRVTST', { showGraphs: true });
} else {
  renderOrg(root, 'preview');
}
