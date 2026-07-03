export function renderLogin(root: HTMLElement): void {
  root.innerHTML = `
    <section class="org-login">
      <h1>🏇 Token Derby — Org Manager</h1>
      <p>To manage your organisations, sign in from the CLI:</p>
      <pre class="cmd">token-derby web</pre>
      <p class="muted">That command opens this page already signed in. This link
      expires quickly, so run it fresh if your session has ended.</p>
    </section>
  `;
}
