import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as api from '../../src/org-manager/api.js';
import { startGoogleLink } from '../../src/org-manager/index.js';

describe('startGoogleLink', () => {
  let assignFn: ReturnType<typeof vi.fn>;
  let alertFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
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

    await startGoogleLink();

    expect(assignFn).toHaveBeenCalledTimes(1);
    expect(assignFn).toHaveBeenCalledWith(testUrl);
  });

  it('calls alert when linkStart rejects', async () => {
    const errorMsg = 'Network error';
    vi.spyOn(api, 'linkStart').mockRejectedValue(new Error(errorMsg));

    await startGoogleLink();

    expect(alertFn).toHaveBeenCalledTimes(1);
    expect(alertFn).toHaveBeenCalledWith(errorMsg);
    expect(assignFn).not.toHaveBeenCalled();
  });
});
