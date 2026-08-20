import { describe, it, expect, beforeEach } from 'vitest';
import { renderPrivacy } from '../src/render/privacy.js';

describe('renderPrivacy', () => {
  let root: HTMLElement;
  beforeEach(() => { root = document.createElement('div'); });

  it('renders a privacy heading', () => {
    renderPrivacy(root);
    expect(root.querySelector('h1')?.textContent ?? '').toMatch(/privacy/i);
  });

  it('states what is collected, which is what Google requires it to say', () => {
    renderPrivacy(root);
    const text = root.textContent ?? '';
    expect(text).toMatch(/email/i);
    expect(text).toMatch(/name/i);
  });

  it('offers a way back home', () => {
    renderPrivacy(root);
    expect(root.querySelector('a[href="/"]')).not.toBeNull();
  });
});
