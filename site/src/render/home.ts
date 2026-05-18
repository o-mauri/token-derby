import { horseFaceSvg } from '../horse-face.js';

export function renderHome(root: HTMLElement): void {
  root.innerHTML = '';
  const section = root.ownerDocument.createElement('section');
  section.className = 'home';
  section.innerHTML = `
    <h1>${horseFaceSvg()} TOKEN DERBY <span class="horse-face-flip">${horseFaceSvg()}</span></h1>
    <p>Enter a race code to watch.</p>
    <form id="race-form" autocomplete="off">
      <input id="race-code" name="code" placeholder="ABC123" maxlength="6" pattern="[A-Za-z0-9]{6}" required>
      <button type="submit">Watch</button>
    </form>
    <p class="home-divider">— or visit your organisation —</p>
    <form id="org-form" autocomplete="off">
      <input id="org-name" name="org" placeholder="myteam" maxlength="12" pattern="[A-Za-z0-9]{1,12}" required>
      <button type="submit">Go</button>
    </form>
    <div class="install-line terminal" role="note" aria-label="Install command">
      <span class="terminal-prompt">$</span>
      <span class="terminal-cmd">npm i -g @mauricode/token-derby</span>
      <span class="terminal-cursor" aria-hidden="true">&#9608;</span>
    </div>
  `;
  root.appendChild(section);

  const raceForm = section.querySelector<HTMLFormElement>('#race-form')!;
  const raceInput = section.querySelector<HTMLInputElement>('#race-code')!;
  raceForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = raceInput.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      raceInput.setCustomValidity('Race codes are exactly 6 letters/digits.');
      raceInput.reportValidity();
      return;
    }
    window.location.assign(`/race/${code}`);
  });
  raceInput.addEventListener('input', () => raceInput.setCustomValidity(''));

  const orgForm = section.querySelector<HTMLFormElement>('#org-form')!;
  const orgInput = section.querySelector<HTMLInputElement>('#org-name')!;
  orgForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = orgInput.value.trim();
    if (!/^[A-Za-z0-9]{1,12}$/.test(name)) {
      orgInput.setCustomValidity('Org names are 1–12 letters/digits.');
      orgInput.reportValidity();
      return;
    }
    window.location.assign(`/org/${name}`);
  });
  orgInput.addEventListener('input', () => orgInput.setCustomValidity(''));

  raceInput.focus();
}
