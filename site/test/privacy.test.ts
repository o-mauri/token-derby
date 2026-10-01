import { describe, it, expect, beforeEach } from 'vitest';
import { renderPrivacy } from '../src/render/privacy.js';

describe('renderPrivacy', () => {
  let root: HTMLElement;
  beforeEach(() => { root = document.createElement('div'); });

  it('renders a privacy heading', () => {
    renderPrivacy(root);
    expect(root.querySelector('h1')?.textContent ?? '').toMatch(/privacy/i);
  });

  it('names the four sections Google looks for', () => {
    renderPrivacy(root);
    const headings = Array.from(root.querySelectorAll('h3')).map((h) => h.textContent?.trim());
    expect(headings).toEqual(['What is stored', 'What is not stored', 'Sharing', 'Deletion']);
  });

  it('states each specific thing that is stored', () => {
    renderPrivacy(root);
    const text = (root.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toMatch(/Your display name/i);
    expect(text).toMatch(/email address and Google account id/i);
    expect(text).toMatch(/Token counts, race results and horse customisations/i);
  });

  it('commits to what is not stored and not shared', () => {
    renderPrivacy(root);
    const text = (root.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toMatch(/contents of your prompts, code or conversations/i);
    expect(text).toMatch(/Payment details\. Nothing here is paid for/i);
    expect(text).toMatch(/Nothing is sold or shared with third parties/i);
    expect(text).toMatch(/your account and its data will be removed/i);
  });

  it('offers a way back home', () => {
    renderPrivacy(root);
    expect(root.querySelector('a[href="/"]')).not.toBeNull();
  });
});
