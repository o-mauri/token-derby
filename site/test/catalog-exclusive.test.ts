import { describe, it, expect, vi, afterEach } from 'vitest';
import { HATS } from '@token-derby/shared';
import { renderCatalog } from '../src/render/catalog.js';

afterEach(() => { vi.restoreAllMocks(); });

function renderWith(hats: typeof HATS): string {
  const spy = vi.spyOn(HATS, 'filter');
  spy.mockImplementation((fn: any) => hats.filter(fn));
  const root = document.createElement('div');
  renderCatalog(root);
  return root.innerHTML;
}

describe('catalog exclusive badge', () => {
  it('marks a non-rollable hat as exclusive', () => {
    const one = HATS.find(h => h.rarity === 'common')!;
    const html = renderWith([{ ...one, rollable: false }] as typeof HATS);
    expect(html).toContain('hat-exclusive');
    expect(html).toContain('EXCLUSIVE');
  });

  it('does not mark a rollable hat', () => {
    const one = HATS.find(h => h.rarity === 'common')!;
    const html = renderWith([{ ...one, rollable: true }] as typeof HATS);
    expect(html).not.toContain('hat-exclusive');
  });
});

describe('the real catalog', () => {
  it('badges the Contributor Cap as exclusive', () => {
    const root = document.createElement('div');
    renderCatalog(root);
    const html = root.innerHTML;
    expect(html).toContain('Contributor Cap');
    expect(html).toContain('hat-exclusive');
  });
});
