import { describe, it, expect, afterEach, vi } from 'vitest';
import { createV2Toggle, mountFloatingV2Toggle } from '../src/render/v2-toggle.js';
import { renderOrg } from '../src/render/org.js';

describe('V2 switch', () => {
  afterEach(() => { document.cookie = 'td_site=; Path=/; Max-Age=0'; document.body.innerHTML = ''; vi.restoreAllMocks(); });

  it('is an off switch labelled V2 that opts in when pressed', () => {
    const go = vi.fn();
    const el = createV2Toggle(document, go);
    expect(el.getAttribute('role')).toBe('switch');
    expect(el.getAttribute('aria-checked')).toBe('false');
    expect(el.textContent).toContain('V2');
    el.click();
    expect(go).toHaveBeenCalledWith('/');
    expect(document.cookie).toContain('td_site=v2');
  });

  it('floats one switch on pages without a header, and removes it on others', () => {
    mountFloatingV2Toggle(document, true);
    mountFloatingV2Toggle(document, true);
    expect(document.querySelectorAll('.v2-toggle-floating')).toHaveLength(1);
    mountFloatingV2Toggle(document, false);
    expect(document.querySelector('.v2-toggle-floating')).toBeNull();
  });

  it('sits in the org header', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    const root = document.createElement('div');
    document.body.appendChild(root);
    const cleanup = renderOrg(root, 'acme');
    expect(root.querySelector('.org-header .meta .v2-toggle')).not.toBeNull();
    cleanup();
  });
});
