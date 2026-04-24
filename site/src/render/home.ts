export function renderHome(root: HTMLElement): void {
  root.innerHTML = '';
  const section = root.ownerDocument.createElement('section');
  section.className = 'home';
  section.innerHTML = `
    <h1>🏇 TOKEN DERBY</h1>
    <p>Enter a race code to watch.</p>
    <form id="race-form" autocomplete="off">
      <input id="race-code" name="code" placeholder="ABC123" maxlength="6" pattern="[A-Za-z0-9]{6}" required>
      <button type="submit">Watch</button>
    </form>
    <p>Don't have a code? Create one with <code>token-derby create</code>.</p>
  `;
  root.appendChild(section);

  const form = section.querySelector<HTMLFormElement>('#race-form')!;
  const input = section.querySelector<HTMLInputElement>('#race-code')!;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = input.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      input.setCustomValidity('Race codes are exactly 6 letters/digits.');
      input.reportValidity();
      return;
    }
    window.location.assign(`/race/${code}`);
  });
  input.addEventListener('input', () => input.setCustomValidity(''));
  input.focus();
}
