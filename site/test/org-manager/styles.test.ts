import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { renderLogin } from '../../src/org-manager/render/login.js';
import { renderSidebar } from '../../src/org-manager/render/sidebar.js';

// happy-dom's URL resolves relative paths against document.location, so the
// stylesheet is located from this file's own directory instead.
const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../../public/styles.css'), 'utf8');

// Declaration blocks of every rule whose selector list mentions this class.
function blocksFor(cls: string): string[] {
  const selector = new RegExp(`\\.${cls}(?![\\w-])`);
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => selector.test(m[1]!))
    .map((m) => m[2]!);
}

let root: HTMLElement;

beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
});

beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  delete document.documentElement.dataset.theme;
});

const sidebar = () => renderSidebar(root, {
  orgs: [], selected: null, ownerOrgs: new Set(), linkedEmail: null,
  onSelect: () => {}, onCreate: () => {}, onJoin: () => {}, onLinkGoogle: () => {}, onLogout: () => {},
});

describe('org-manager auth styles', () => {
  it('defines an --error token instead of leaving errors on a literal hex', () => {
    expect(css).toMatch(/--error:\s*#[0-9a-f]{3,8};/i);
  });

  it('paints the login error in the error colour, not the muted paragraph colour', () => {
    renderLogin(root, { authError: 'expired' });
    const error = root.querySelector('.org-login-error')!;
    const hint = root.querySelector('.org-login-lane-sub')!;
    // `.org-login p` is more specific than a bare `.org-login-error`, so this is
    // the assertion that catches the banner reading as a hint.
    expect(getComputedStyle(error).color).toBe('#ff6b6b');
    expect(getComputedStyle(error).color).not.toBe(getComputedStyle(hint).color);
    expect(getComputedStyle(error).borderTopStyle).toBe('solid');
  });

  it('paints the signed-in banner the same way', () => {
    root.innerHTML = '<p class="org-auth-error">nope</p>';
    const banner = root.querySelector('.org-auth-error')!;
    expect(getComputedStyle(banner).color).toBe('#ff6b6b');
    expect(getComputedStyle(banner).borderTopStyle).toBe('solid');
  });

  it('renders .google-signin as a filled button, not an inherited link', () => {
    renderLogin(root);
    const cta = getComputedStyle(root.querySelector('.google-signin')!);
    expect(cta.textDecoration).toBe('none');
    expect(cta.display).toBe('inline-flex');
    expect(cta.backgroundColor).not.toBe('');
    // Text on the button's own fill, not the page text colour on a transparent link.
    expect(cta.color).not.toBe(getComputedStyle(document.body).color);
  });

  it('builds .google-signin to Google\'s exact compliant spec', () => {
    renderLogin(root);
    const cta = getComputedStyle(root.querySelector('.google-signin')!);
    expect(cta.backgroundColor).toBe('#FFFFFF');
    expect(cta.color).toBe('#1F1F1F');
    expect(cta.borderTopColor).toBe('#747775');
    expect(cta.height).toBe('40px');
    expect(cta.borderRadius).toBe('4px');
    expect(cta.fontWeight).toBe('500');
  });

  it('immunises the Google button against the site-wide pixel font', () => {
    renderLogin(root);
    const cta = getComputedStyle(root.querySelector('.google-signin')!);
    const page = getComputedStyle(document.body);
    // The real leak: without an explicit override the button would inherit
    // html/body's --pixel-font, same as every other element on the page.
    expect(cta.fontFamily).not.toBe(page.fontFamily);
    expect(cta.fontFamily).toMatch(/Roboto/);
  });

  // happy-dom does not reliably recompute style for :root[data-theme="…"]
  // rules (including via :is()) when the attribute changes after the
  // stylesheet is attached — confirmed with a minimal repro outside this
  // suite, and the reason theme.test.ts already verifies themed rules by
  // reading the CSS text rather than by toggling data-theme and reading
  // getComputedStyle. Real theme-invariance is verified by browser screenshot
  // (see the artifact); this test guards the source instead: no phosphor or
  // matrix rule may target the Google button at all.
  it('keeps every phosphor/matrix rule away from the Google button', () => {
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => m[1]!);
    const themedRulesTouchingButton = rules.filter(
      (selector) => /data-theme="(phosphor|matrix)"/.test(selector) && /google-signin/.test(selector),
    );
    expect(themedRulesTouchingButton).toEqual([]);
  });

  it('gives .org-link-google the same treatment as the other sidebar actions', () => {
    sidebar();
    const link = getComputedStyle(root.querySelector('.org-link-google')!);
    const create = getComputedStyle(root.querySelector('.org-create')!);
    for (const prop of ['backgroundColor', 'color', 'fontWeight', 'borderRadius', 'width'] as const) {
      expect(link[prop], prop).toBe(create[prop]);
    }
    expect(link.backgroundColor).not.toBe('');
  });

  it('uses theme tokens rather than literal colours in the new rules', () => {
    for (const cls of ['org-link-google', 'org-login-error', 'org-auth-error']) {
      for (const block of blocksFor(cls)) {
        expect(block, cls).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      }
    }
  });

  // .google-signin is the one deliberate exception: Google's compliant button
  // must look identical in every theme, so its colours are literal by design,
  // not an oversight the token check above should catch.
  it('keeps .google-signin literal-coloured on purpose', () => {
    const blocks = blocksFor('google-signin');
    expect(blocks.some((b) => /#[0-9a-f]{3,8}\b/i.test(b))).toBe(true);
  });
});
