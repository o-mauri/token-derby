import { esc } from '../../esc.js';
import { horseFaceSvg } from '../../horse-face.js';
import { googleMarkSvg } from '../../google-mark.js';

export const MESSAGES: Record<string, string> = {
  email_already_linked: 'That Google account is already linked to a different jockey.',
  expired: 'That sign-in link expired. Please try again.',
  sso_failed: 'Google sign-in did not complete. Please try again.',
};

/** Shared by the signed-out login screen and the signed-in shell, so an unknown
 *  code reads the same in both places. */
export function authErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? MESSAGES.sso_failed!;
}

/** Two explicit paths, given equal weight: a new visitor signing in with Google
 *  and an existing CLI racer who must not run `token-derby init` here — that
 *  would create a second jockey with no way to merge it back. */
export function renderLogin(root: HTMLElement, opts: { authError?: string | null } = {}): void {
  const message = authErrorMessage(opts.authError);
  const error = message ? `<p class="org-login-error">${esc(message)}</p>` : '';

  root.innerHTML = `
    <section class="org-login">
      <h1>${horseFaceSvg()} TOKEN DERBY</h1>
      <p class="org-login-subtitle">Org Manager</p>
      ${error}
      <div class="org-login-lanes">
        <div class="org-login-lane">
          <p class="home-divider">New here</p>
          <p><a class="google-signin" href="/api/auth/google/start" data-action="google-signin">${googleMarkSvg()}<span class="google-signin-label">Sign in with Google</span></a></p>
          <p class="org-login-lane-sub">Creates your jockey. Racing from the CLI arrives in a later release &mdash; don't run <code>token-derby init</code>, it would make a second jockey.</p>
        </div>
        <div class="org-login-lane">
          <p class="home-divider">Already racing</p>
          <div class="install-line terminal" role="note" aria-label="Sign in from the CLI">
            <span class="terminal-prompt">$</span>
            <span class="terminal-cmd">token-derby web</span>
            <span class="terminal-cursor" aria-hidden="true">&#9608;</span>
          </div>
          <p class="org-login-lane-sub">Signs you in from your terminal. Link Google afterwards to keep your horses and XP.</p>
        </div>
      </div>
    </section>
  `;
}
