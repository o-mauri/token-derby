import { horseFaceSvg } from '../../horse-face.js';

export function renderLogin(root: HTMLElement): void {
  root.innerHTML = `
    <section class="org-login">
      <h1>${horseFaceSvg()} Derbymarket</h1>
      <p>To see the board, open it from the CLI:</p>
      <pre class="cmd">token-derby derbymarket</pre>
      <p class="muted">That command opens this page already signed in. This link
      expires quickly, so run it fresh if your session has ended.</p>
    </section>
  `;
}
