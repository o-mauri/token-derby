import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseRoute } from '../src/route.js';
import { renderCliApprove } from '../src/render/cli-approve.js';
import * as api from '../src/org-manager/api.js';
import { ApiError } from '../src/org-manager/api.js';
import { setSession } from '../src/org-manager/session.js';

const XSS_LABEL = '<img src=x onerror=alert(1)>evil-device';

function submitCode(root: HTMLElement, code: string): void {
  const input = root.querySelector<HTMLInputElement>('input[name="user_code"]')!;
  input.value = code;
  root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

describe('parseRoute /cli', () => {
  it('maps "/cli" to the cli route', () => {
    expect(parseRoute('/cli')).toEqual({ type: 'cli' });
  });

  it('strips a trailing slash', () => {
    expect(parseRoute('/cli/')).toEqual({ type: 'cli' });
  });
});

describe('main.ts wiring for /cli', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    history.replaceState(null, '', '/cli');
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    history.replaceState(null, '', '/');
  });

  // main.ts is an if/else chain with a generic `else` that renders "Page not
  // found" for any route it doesn't explicitly branch on. A missing `cli`
  // branch fails silently at runtime rather than at compile time, so this has
  // to go through main.ts's real route() dispatch, not call renderCliApprove
  // directly.
  it('renders the cli page instead of falling through to the not-found branch', async () => {
    await import('../src/main.js');
    const app = document.querySelector('#app')!;
    expect(app.querySelector('.cli-approve, .org-login')).not.toBeNull();
    expect(app.textContent).not.toMatch(/page not found/i);
  });
});

describe('renderCliApprove: signed out', () => {
  let root: HTMLElement;
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    localStorage.clear();
    root = document.createElement('div');
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    vi.restoreAllMocks();
  });

  it('renders the Phase 1 login screen', () => {
    cleanup = renderCliApprove(root);
    expect(root.querySelector('.org-login')).not.toBeNull();
    expect(root.textContent).toMatch(/sign in with google/i);
  });

  it('tells the visitor to come back to this page after signing in, since the callback does not return here', () => {
    cleanup = renderCliApprove(root);
    // The literal sentence, not a loose match — this is the copy that stands
    // in for the redirect Phase 1's callback does not provide.
    expect(root.textContent).toContain('After signing in, come back to this page to approve your device.');
  });
});

describe('renderCliApprove: signed in', () => {
  let root: HTMLElement;
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    localStorage.clear();
    setSession('tok');
    root = document.createElement('div');
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    vi.restoreAllMocks();
  });

  it('states the phishing warning verbatim — the one control this page has for an unauthenticated /start caller', () => {
    cleanup = renderCliApprove(root);
    // The exact sentence, not a loose /terminal/i match — this line is the
    // security control, and a vague matcher would pass against almost any copy.
    expect(root.querySelector('.cli-approve-warning')?.textContent)
      .toBe('Only enter a code that your own terminal just displayed.');
  });

  it('rejects a malformed code locally, without spending a preview call', () => {
    const spy = vi.spyOn(api, 'previewCliApprove');
    cleanup = renderCliApprove(root);
    submitCode(root, 'AB');
    expect(spy).not.toHaveBeenCalled();
    expect(root.querySelector('.org-login-error')?.textContent).toMatch(/6-character/);
  });

  it('does not preview on keystrokes — only on explicit submit, even once the code is a complete 6 characters', () => {
    const spy = vi.spyOn(api, 'previewCliApprove').mockResolvedValue({ label: 'x' });
    cleanup = renderCliApprove(root);
    // Re-query the input each time: a re-render on an invalid intermediate
    // value replaces the DOM node, and a real browser always fires 'input' on
    // whatever node is currently live, not a stale reference.
    // The last keystroke completes a valid code — the case that would spend a
    // preview call per keystroke if this fired on 'input' instead of 'submit'.
    for (const partial of ['A', 'AB', 'AB3', 'AB3D', 'AB3D9', 'AB3D92']) {
      const input = root.querySelector<HTMLInputElement>('input[name="user_code"]')!;
      input.value = partial;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('previews a submitted code (normalised) and shows the returned label', async () => {
    const spy = vi.spyOn(api, 'previewCliApprove').mockResolvedValue({ label: "Omar's Laptop" });
    cleanup = renderCliApprove(root);
    submitCode(root, 'ab3-d92');

    await vi.waitFor(() => expect(root.querySelector('.cli-approve-label')).not.toBeNull());
    expect(spy).toHaveBeenCalledWith('AB3D92');
    expect(root.querySelector('.cli-approve-label')!.textContent).toContain("Omar's Laptop");
  });

  it('escapes an attacker-controlled label instead of rendering it as live markup', async () => {
    vi.spyOn(api, 'previewCliApprove').mockResolvedValue({ label: XSS_LABEL });
    cleanup = renderCliApprove(root);
    submitCode(root, 'AB3D92');

    await vi.waitFor(() => expect(root.querySelector('.cli-approve-label')).not.toBeNull());
    expect(root.querySelector('.cli-approve-label img')).toBeNull();
    expect(root.innerHTML).not.toContain('<img src=x');
    expect(root.querySelector('.cli-approve-label')!.textContent).toContain(XSS_LABEL);
  });

  it('presents the label as an attributed quote from the requesting device, not as page copy', async () => {
    // A label crafted to read like our own UI — the exact case the brief
    // warns escaping alone would not stop.
    vi.spyOn(api, 'previewCliApprove').mockResolvedValue({ label: 'Verified device, safe to approve' });
    cleanup = renderCliApprove(root);
    submitCode(root, 'AB3D92');

    await vi.waitFor(() => expect(root.querySelector('.cli-approve-label')).not.toBeNull());
    const block = root.querySelector('.cli-approve-label-block')!;
    expect(block.querySelector('.label')!.textContent).toMatch(/calling itself/i);
    expect(block.querySelector('blockquote.cli-approve-label')).not.toBeNull();
  });

  it('calls the real approve endpoint only after a second, explicit approve action', async () => {
    vi.spyOn(api, 'previewCliApprove').mockResolvedValue({ label: 'CI box' });
    const approveSpy = vi.spyOn(api, 'approveCliDevice').mockResolvedValue({ label: 'CI box' });
    cleanup = renderCliApprove(root);
    submitCode(root, 'AB3D92');

    await vi.waitFor(() => expect(root.querySelector('[data-action="approve"]')).not.toBeNull());
    expect(approveSpy).not.toHaveBeenCalled();

    root.querySelector<HTMLButtonElement>('[data-action="approve"]')!.click();

    await vi.waitFor(() => expect(approveSpy).toHaveBeenCalledWith('AB3D92'));
    await vi.waitFor(() => expect(root.textContent).toMatch(/approved/i));
  });

  it('shows a distinct message for CLI_AUTH_NOT_FOUND', async () => {
    vi.spyOn(api, 'previewCliApprove').mockRejectedValue(new ApiError('CLI_AUTH_NOT_FOUND', 'server message', 404));
    cleanup = renderCliApprove(root);
    submitCode(root, 'AB3D92');

    await vi.waitFor(() => expect(root.querySelector('.org-login-error')).not.toBeNull());
    expect(root.querySelector('.org-login-error')!.textContent).toMatch(/not found|expired/i);
  });

  it('shows a distinct message for CLI_AUTH_WRONG_ACCOUNT', async () => {
    vi.spyOn(api, 'previewCliApprove').mockRejectedValue(new ApiError('CLI_AUTH_WRONG_ACCOUNT', 'server message', 403));
    cleanup = renderCliApprove(root);
    submitCode(root, 'AB3D92');

    await vi.waitFor(() => expect(root.querySelector('.org-login-error')).not.toBeNull());
    expect(root.querySelector('.org-login-error')!.textContent).toMatch(/different account/i);
  });

  it('shows a distinct message for RATE_LIMITED', async () => {
    vi.spyOn(api, 'previewCliApprove').mockRejectedValue(new ApiError('RATE_LIMITED', 'server message', 429));
    cleanup = renderCliApprove(root);
    submitCode(root, 'AB3D92');

    await vi.waitFor(() => expect(root.querySelector('.org-login-error')).not.toBeNull());
    expect(root.querySelector('.org-login-error')!.textContent).toMatch(/too many attempts/i);
  });

  it('the three error messages are all distinct from each other', async () => {
    const codes = ['CLI_AUTH_NOT_FOUND', 'CLI_AUTH_WRONG_ACCOUNT', 'RATE_LIMITED'] as const;
    const messages: string[] = [];
    for (const code of codes) {
      const r = document.createElement('div');
      vi.spyOn(api, 'previewCliApprove').mockRejectedValue(new ApiError(code, 'server message', 400));
      const dispose = renderCliApprove(r);
      submitCode(r, 'AB3D92');
      await vi.waitFor(() => expect(r.querySelector('.org-login-error')).not.toBeNull());
      messages.push(r.querySelector('.org-login-error')!.textContent!);
      dispose();
      vi.restoreAllMocks();
    }
    expect(new Set(messages).size).toBe(3);
  });
});
