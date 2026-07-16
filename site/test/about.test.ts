import { describe, it, expect, beforeEach } from 'vitest';
import { renderAbout } from '../src/render/about.js';
import { CHANGELOG } from '../src/changelog.js';

describe('renderAbout', () => {
  let root: HTMLElement;
  beforeEach(() => { root = document.createElement('div'); });

  it('renders the About header', () => {
    renderAbout(root);
    const h1 = root.querySelector('h1')?.textContent ?? '';
    expect(h1).toContain('TOKEN DERBY');
    expect(h1).toContain('About');
  });

  it('shows current site + cli version badges (dev fallback under vitest)', () => {
    renderAbout(root);
    const cur = root.querySelector('.about-current')?.textContent ?? '';
    expect(cur).toContain('Site');
    expect(cur).toContain('CLI');
    expect(cur).toContain('dev');
  });

  it('renders one timeline entry per changelog item', () => {
    renderAbout(root);
    expect(root.querySelectorAll('.about-entry').length).toBe(CHANGELOG.length);
  });

  it('tags each entry SITE or CLI and lists its changes', () => {
    renderAbout(root);
    const first = root.querySelector('.about-entry')!;
    expect(['SITE', 'CLI']).toContain(first.querySelector('.about-tag')?.textContent);
    expect(first.querySelectorAll('.about-changes li').length).toBeGreaterThan(0);
  });
});
