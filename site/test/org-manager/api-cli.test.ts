import { describe, it, expect, beforeEach, vi } from 'vitest';
import { previewCliApprove, approveCliDevice, listDevices, deleteDevice } from '../../src/org-manager/api.js';
import { setSession } from '../../src/org-manager/session.js';

// Every /cli page test mocks these two at the module boundary, so nothing else
// in the suite ever inspects the body that actually goes over the wire. This
// file is the only place `preview: true` is pinned.
function recordingFetch(body: unknown = { label: 'study-desktop' }) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(body),
  });
}

function sentBody(f: ReturnType<typeof recordingFetch>): any {
  return JSON.parse(String((f.mock.calls[0]?.[1] as RequestInit).body));
}

describe('previewCliApprove / approveCliDevice request bodies', () => {
  beforeEach(() => {
    localStorage.clear();
    setSession('web-session-token');
  });

  it('sends preview: true so a look-up never mints a credential', async () => {
    const f = recordingFetch();
    await previewCliApprove('AB3D92', f as any);

    expect(f.mock.calls[0]?.[0]).toBe('/api/auth/cli/approve');
    expect(sentBody(f)).toEqual({ user_code: 'AB3D92', preview: true });
  });

  it('sends no preview flag on the real approval', async () => {
    const f = recordingFetch();
    await approveCliDevice('AB3D92', f as any);

    expect(f.mock.calls[0]?.[0]).toBe('/api/auth/cli/approve');
    expect(sentBody(f)).toEqual({ user_code: 'AB3D92' });
    // Spelled out separately: the server treats a missing flag and an explicit
    // `preview: false` as the same request, so `toEqual` alone would still pass
    // if the two helpers were merged behind a defaulted parameter.
    expect('preview' in sentBody(f)).toBe(false);
  });

  it('differs from the approve call ONLY in the preview flag', async () => {
    const previewFetch = recordingFetch();
    const approveFetch = recordingFetch();
    await previewCliApprove('AB3D92', previewFetch as any);
    await approveCliDevice('AB3D92', approveFetch as any);

    const [previewUrl, previewInit] = previewFetch.mock.calls[0] as [string, RequestInit];
    const [approveUrl, approveInit] = approveFetch.mock.calls[0] as [string, RequestInit];

    expect(previewUrl).toBe(approveUrl);
    expect(previewInit.method).toBe('POST');
    expect(approveInit.method).toBe('POST');

    const { preview, ...previewRest } = sentBody(previewFetch);
    expect(preview).toBe(true);
    expect(previewRest).toEqual(sentBody(approveFetch));
  });

  it('carries the web session as a bearer token on both', async () => {
    for (const call of [previewCliApprove, approveCliDevice]) {
      const f = recordingFetch();
      await call('AB3D92', f as any);
      const init = f.mock.calls[0]?.[1] as RequestInit;
      expect((init.headers as Record<string, string>).authorization).toBe('Bearer web-session-token');
      expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    }
  });

  it('refuses to call the endpoint at all when there is no session', async () => {
    localStorage.clear();
    const f = recordingFetch();
    await expect(previewCliApprove('AB3D92', f as any)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(approveCliDevice('AB3D92', f as any)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('device list and revoke requests', () => {
  beforeEach(() => {
    localStorage.clear();
    setSession('web-session-token');
  });

  it('GETs /api/devices with no body', async () => {
    const f = recordingFetch({ devices: [], has_legacy_credential: false });
    await listDevices(f as any);

    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/devices');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('DELETEs the device by id, URL-encoded', async () => {
    const f = recordingFetch({ ok: true });
    await deleteDevice('a/b id', f as any);

    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/devices/a%2Fb%20id');
    expect(init.method).toBe('DELETE');
  });
});
