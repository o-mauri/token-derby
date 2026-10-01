import { describe, it, expect, afterEach, vi } from 'vitest';
import { createNotFound } from '../src/render/not-found.js';

const opts = {
  title: 'Race not found',
  message: ['No race with code ', { strong: 'ABC123' }, '.'],
  back: { label: '← Home', href: '/' },
};

describe('createNotFound', () => {
  afterEach(() => { history.replaceState(null, '', '/'); vi.restoreAllMocks(); });

  it('renders an alert with the title and message', () => {
    const el = createNotFound(document, opts);
    expect(el.classList.contains('not-found')).toBe(true);
    expect(el.getAttribute('role')).toBe('alert');
    expect(el.querySelector('h2')?.textContent).toBe('Race not found');
    expect(el.querySelector('p')?.textContent).toBe('No race with code ABC123.');
    expect(el.querySelector('p strong')?.textContent).toBe('ABC123');
  });

  it('treats typed values as text, never markup', () => {
    const el = createNotFound(document, { ...opts, message: ['No org named ', { strong: '<img src=x>' }] });
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('p strong')?.textContent).toBe('<img src=x>');
  });

  it('shows the lost horse with its thought bubble inside the porthole', () => {
    const track = createNotFound(document, opts).querySelector('.not-found-ring > .not-found-porthole > .not-found-track')!;
    expect(track.querySelector('.not-found-horse svg.horse-sprite')).not.toBeNull();
    expect(track.querySelector('svg.not-found-bubble rect')).not.toBeNull();
  });

  it('keeps clear of the race view and loader class hooks', () => {
    const el = createNotFound(document, opts);
    expect(el.querySelector('.horse, .loader, .loader-horse')).toBeNull();
  });

  it('renders the back action as a link that navigates in-app', () => {
    const el = createNotFound(document, { ...opts, back: { label: '← Acme', href: '/org/Acme' } });
    const link = el.querySelector<HTMLAnchorElement>('a.btn')!;
    expect(link.textContent).toBe('← Acme');
    expect(link.getAttribute('href')).toBe('/org/Acme');

    const onPop = vi.fn();
    window.addEventListener('popstate', onPop);
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    window.removeEventListener('popstate', onPop);
    expect(location.pathname).toBe('/org/Acme');
    expect(onPop).toHaveBeenCalledTimes(1);
  });
});
