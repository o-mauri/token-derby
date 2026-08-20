import { esc } from '../../esc.js';

const MESSAGES: Record<string, string> = {
  email_already_linked: 'That Google account is already linked to a different jockey.',
  expired: 'That sign-in link expired. Please try again.',
  sso_failed: 'Google sign-in did not complete. Please try again.',
};

export function renderLogin(root: HTMLElement, opts: { authError?: string | null } = {}): void {
  const code = opts.authError ?? null;
  const error = code
    ? `<p class="org-login-error">${esc(MESSAGES[code] ?? MESSAGES.sso_failed!)}</p>`
    : '';

  root.innerHTML = `
    <section class="org-login">
      <h1>🏇 Token Derby — Org Manager</h1>
      ${error}
      <p><a class="google-signin" href="/api/auth/google/start" data-action="google-signin">Sign in with Google</a></p>
      <p class="muted">Already racing with the CLI? Run <code>token-derby web</code> and link your
      Google account from there — signing in with Google directly will create a
      <strong>new jockey</strong>.</p>
    </section>
  `;
}
