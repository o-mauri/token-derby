import { esc } from '../esc.js';
import { horseFaceSvg } from '../horse-face.js';
import { normaliseUserCode } from '@token-derby/shared';
import { getSession, readCodeFromHash, adoptExchangedUser } from '../org-manager/session.js';
import { previewCliApprove, approveCliDevice, exchangeCode, ApiError } from '../org-manager/api.js';
import { renderLogin } from '../org-manager/render/login.js';

// The one sentence this whole page exists to carry: there is no server-side
// check for an attacker running /start with no credentials and getting a
// victim to type the resulting code, so this copy IS the control.
const PHISHING_WARNING = 'Only enter a code that your own terminal just displayed.';

const RETURN_NOTE = 'After signing in, come back to this page to approve your device.';

const INVALID_FORMAT_MESSAGE = 'Enter the 6-character code your terminal displayed.';

const ERROR_MESSAGES: Record<string, string> = {
  CLI_AUTH_NOT_FOUND: 'That code was not found — it may have expired or already been used. Run `token-derby login` again for a new one.',
  CLI_AUTH_WRONG_ACCOUNT: 'That code is linked to a different account. Sign in as that account, or start a fresh `token-derby login`.',
  RATE_LIMITED: 'Too many attempts. Wait a moment and try again.',
};

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return ERROR_MESSAGES[e.code] ?? e.message;
  return 'Something went wrong. Try again.';
}

type State =
  | { step: 'entry'; value?: string; error?: string }
  | { step: 'previewed'; code: string; label: string; busy?: boolean; error?: string }
  | { step: 'approved'; label: string };

/** Structural, quoted attribution for attacker-controlled text: the label
 *  comes verbatim from the unauthenticated /start caller, so it is escaped
 *  AND framed as a quote from "the device", never as page copy. */
function labelBlock(label: string, tense: 'requested' | 'approved'): string {
  const verb = tense === 'requested' ? 'was requested by' : 'was approved for';
  return `
    <div class="cli-approve-label-block">
      <span class="label">This code ${verb} a device calling itself</span>
      <blockquote class="cli-approve-label">&ldquo;${esc(label)}&rdquo;</blockquote>
    </div>
  `;
}

function warningBlock(): string {
  return `
    <p class="cli-approve-warning">${esc(PHISHING_WARNING)}</p>
    <p class="cli-approve-warning-detail muted">Never type in a code from an email, a chat message, or another website — that would let whoever sent it sign in as you.</p>
  `;
}

function render(state: State): string {
  const header = `<h1>${horseFaceSvg()} TOKEN DERBY — Approve device</h1>`;

  if (state.step === 'approved') {
    return `
      <section class="cli-approve">
        ${header}
        ${warningBlock()}
        <div class="org-panel cli-approve-done">
          <p class="cli-approve-success">Device approved. You can go back to your terminal.</p>
          ${labelBlock(state.label, 'approved')}
        </div>
      </section>
    `;
  }

  const error = state.error ? `<p class="org-login-error">${esc(state.error)}</p>` : '';
  const value = state.step === 'previewed' ? state.code : (state.value ?? '');
  const label = state.step === 'previewed' ? labelBlock(state.label, 'requested') : '';
  const approveButton = state.step === 'previewed'
    ? `<button type="button" class="org-btn" data-action="approve" ${state.busy ? 'disabled' : ''}>Approve this device</button>`
    : '';

  return `
    <section class="cli-approve">
      ${header}
      ${warningBlock()}
      <form class="org-panel cli-approve-form" autocomplete="off">
        <label class="label">Code from your terminal
          <input name="user_code" maxlength="8" placeholder="AB3D92" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(value)}">
        </label>
        ${error}
        ${label}
        <div class="org-actions">
          <button type="submit" class="org-btn" data-action="lookup">Look up code</button>
          ${approveButton}
        </div>
      </form>
    </section>
  `;
}

export function renderCliApprove(root: HTMLElement): () => void {
  let disposed = false;

  const showSignInScreen = () => {
    if (disposed) return;
    // The 'cli' variant, not the default: /org-manager's copy still says CLI
    // racing is unreleased, which is false for someone who just ran `login`.
    renderLogin(root, { variant: 'cli' });
    const note = document.createElement('p');
    note.className = 'cli-approve-return-note';
    note.textContent = RETURN_NOTE;
    (root.querySelector('.org-login') ?? root).appendChild(note);
  };

  let state: State = { step: 'entry' };

  const draw = () => {
    if (disposed) return;
    root.innerHTML = render(state);
    wire();
  };

  function wire(): void {
    const form = root.querySelector<HTMLFormElement>('.cli-approve-form');
    form?.addEventListener('submit', (ev) => {
      ev.preventDefault();
      void onLookup();
    });
    root.querySelector<HTMLButtonElement>('[data-action="approve"]')
      ?.addEventListener('click', () => void onApprove());
  }

  async function onLookup(): Promise<void> {
    const raw = root.querySelector<HTMLInputElement>('input[name="user_code"]')?.value ?? '';
    const code = normaliseUserCode(raw);
    if (!code) {
      state = { step: 'entry', value: raw, error: INVALID_FORMAT_MESSAGE };
      draw();
      return;
    }
    try {
      const { label } = await previewCliApprove(code);
      state = { step: 'previewed', code, label };
    } catch (e) {
      state = { step: 'entry', value: raw, error: errorMessage(e) };
    }
    draw();
  }

  async function onApprove(): Promise<void> {
    if (state.step !== 'previewed' || disposed) return;
    const { code, label } = state;
    state = { step: 'previewed', code, label, busy: true };
    draw();
    try {
      const res = await approveCliDevice(code);
      if (disposed) return;
      state = { step: 'approved', label: res.label };
    } catch (e) {
      if (disposed) return;
      state = { step: 'previewed', code, label, error: errorMessage(e) };
    }
    draw();
  }

  const boot = async () => {
    // Arriving from `token-derby login` with a grant: exchange it for a
    // session so the browser is signed in as the same jockey, exactly as
    // org-manager/index.ts and render/link-google.ts do.
    const code = readCodeFromHash();
    if (code) {
      try {
        const res = await exchangeCode(code);
        adoptExchangedUser(res.user);
      } catch {
        // Grants are single-use and last 60 seconds, and `login` both opens the
        // URL and prints it — a second load is routine. Fall through to the
        // session check rather than discarding a session that already works.
      }
    }
    if (!getSession()) {
      showSignInScreen();
      return;
    }
    draw();
  };

  void boot();
  return () => { disposed = true; };
}
