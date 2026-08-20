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
});

const sidebar = () => renderSidebar(root, {
  orgs: [], selected: null, ownerOrgs: new Set(),
  onSelect: () => {}, onCreate: () => {}, onJoin: () => {}, onLinkGoogle: () => {}, onLogout: () => {},
});

describe('org-manager auth styles', () => {
  it('defines an --error token instead of leaving errors on a literal hex', () => {
    expect(css).toMatch(/--error:\s*#[0-9a-f]{3,8};/i);
  });

  it('paints the login error in the error colour, not the muted paragraph colour', () => {
    renderLogin(root, { authError: 'expired' });
    const error = root.querySelector('.org-login-error')!;
    const hint = root.querySelector('.muted')!;
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
    expect(cta.display).toBe('inline-block');
    expect(cta.fontWeight).toBe('bold');
    expect(cta.backgroundColor).not.toBe('');
    // Text on the accent fill, not the page text colour on a transparent link.
    expect(cta.color).not.toBe(getComputedStyle(document.body).color);
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
    for (const cls of ['google-signin', 'org-link-google', 'org-login-error', 'org-auth-error']) {
      for (const block of blocksFor(cls)) {
        expect(block, cls).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      }
    }
  });
});
