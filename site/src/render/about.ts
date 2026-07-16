import { horseFaceSvg } from '../horse-face.js';
import { esc } from '../esc.js';
import { CHANGELOG } from '../changelog.js';
import { SITE_VERSION, CLI_VERSION } from '../version.js';

export function renderAbout(root: HTMLElement): void {
  root.innerHTML = '';
  const section = root.ownerDocument.createElement('section');
  section.className = 'about';

  const entries = CHANGELOG.map((e) => `
    <div class="about-entry">
      <div class="about-row">
        <span class="about-tag ${e.component}">${e.component === 'cli' ? 'CLI' : 'SITE'}</span>
        <span class="about-ver">v${esc(e.version)}</span>
        <span class="about-date">${esc(e.date)}</span>
      </div>
      <ul class="about-changes">
        ${e.changes.map((c) => `<li>${esc(c)}</li>`).join('')}
      </ul>
    </div>
  `).join('');

  section.innerHTML = `
    <h1>${horseFaceSvg()} TOKEN DERBY — About</h1>
    <p class="about-current">Current · Site <b>v${esc(SITE_VERSION)}</b> · CLI <b>v${esc(CLI_VERSION)}</b></p>
    <div class="about-timeline">${entries}</div>
    <p><a class="about-home" href="/">← home</a></p>
  `;
  root.appendChild(section);
}
