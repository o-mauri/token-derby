import { esc } from '../esc.js';
import { horseFaceSvg } from '../horse-face.js';
import { getSession, readCodeFromHash, adoptExchangedUser } from '../org-manager/session.js';
import { exchangeCode, linkStart, ApiError } from '../org-manager/api.js';

/** Shown when there is neither a grant in the fragment nor an existing
 *  session — someone navigated here directly, or reloaded after the fragment
 *  was already scrubbed. Naming the CLI command is the whole point: this page
 *  has nothing to offer on its own, and must not fall back to a Google
 *  sign-in button, which would create a second jockey. */
const EXPLAIN_MESSAGE = 'This page connects your Google account to your existing jockey. Run `token-derby link` in your terminal to get a fresh link here.';

const CONNECTING_MESSAGE = 'Connecting your Google account…';

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong. Try again.';
}

type State =
  | { step: 'connecting' }
  | { step: 'error'; message: string }
  | { step: 'explain' };

function render(state: State): string {
  const header = `<h1>${horseFaceSvg()} TOKEN DERBY — Link Google</h1>`;

  if (state.step === 'explain') {
    return `
      <section class="link-google">
        ${header}
        <p class="link-google-explain">${esc(EXPLAIN_MESSAGE)}</p>
      </section>
    `;
  }

  if (state.step === 'error') {
    return `
      <section class="link-google">
        ${header}
        <p class="org-login-error">${esc(state.message)}</p>
      </section>
    `;
  }

  return `
    <section class="link-google">
      ${header}
      <p class="link-google-status">${esc(CONNECTING_MESSAGE)}</p>
    </section>
  `;
}

export function renderLinkGoogle(root: HTMLElement): () => void {
  let disposed = false;

  const draw = (state: State) => {
    if (disposed) return;
    root.innerHTML = render(state);
  };

  const boot = async () => {
    const code = readCodeFromHash();

    if (code) {
      draw({ step: 'connecting' });
      try {
        const res = await exchangeCode(code);
        adoptExchangedUser(res.user);
      } catch (e) {
        draw({ step: 'error', message: errorMessage(e) });
        return;
      }
    } else if (!getSession()) {
      draw({ step: 'explain' });
      return;
    } else {
      draw({ step: 'connecting' });
    }

    try {
      const { authorize_url } = await linkStart();
      if (disposed) return;
      window.location.assign(authorize_url);
    } catch (e) {
      if (disposed) return;
      draw({ step: 'error', message: errorMessage(e) });
    }
  };

  void boot();

  return () => { disposed = true; };
}
