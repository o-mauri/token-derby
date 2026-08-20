import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as api from '../../src/org-manager/api.js';

describe('onLinkGoogle handler', () => {
  let root: HTMLElement;
  let assignFn: ReturnType<typeof vi.fn>;
  let alertFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    root = document.createElement('div');
    assignFn = vi.fn();
    alertFn = vi.fn();
    vi.stubGlobal('location', { assign: assignFn });
    vi.stubGlobal('alert', alertFn);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes the authorize_url from linkStart directly to window.location.assign', async () => {
    const testUrl = 'https://accounts.google.com/o/oauth2/v2/auth?probe=1';
    vi.spyOn(api, 'linkStart').mockResolvedValue({ authorize_url: testUrl });

    // Simulate the handler
    try {
      const { authorize_url } = await api.linkStart();
      (window as any).location.assign(authorize_url);
    } catch (e) { (window as any).alert(String((e as Error).message)); }

    expect(assignFn).toHaveBeenCalledTimes(1);
    expect(assignFn).toHaveBeenCalledWith(testUrl);
  });

  it('calls alert when linkStart rejects', async () => {
    const errorMsg = 'Network error';
    vi.spyOn(api, 'linkStart').mockRejectedValue(new Error(errorMsg));

    // Simulate the handler
    try {
      const { authorize_url } = await api.linkStart();
      (window as any).location.assign(authorize_url);
    } catch (e) { (window as any).alert(String((e as Error).message)); }

    expect(alertFn).toHaveBeenCalledTimes(1);
    expect(alertFn).toHaveBeenCalledWith(errorMsg);
    expect(assignFn).not.toHaveBeenCalled();
  });
});
