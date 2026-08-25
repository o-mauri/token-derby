import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { joinOrganisation } from '../../src/org-manager/api.js';
import * as api from '../../src/org-manager/api.js';
import { renderOrgManager } from '../../src/org-manager/index.js';
import { setSession, setUid } from '../../src/org-manager/session.js';

const goTo = (url: string) => history.replaceState(null, '', url);

function recordingFetch(body: unknown = { org_id: 'o1', org_name: 'Acme' }) {
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

describe('joinOrganisation request body', () => {
  beforeEach(() => {
    localStorage.clear();
    setSession('web-session-token');
  });

  it('sends the token when one is given', async () => {
    const f = recordingFetch();
    await joinOrganisation('td_join_abc', f as any);
    expect(f.mock.calls[0]?.[0]).toBe('/api/organisations/join');
    expect(sentBody(f)).toEqual({ join_token: 'td_join_abc' });
  });

  // The server refuses a supplied-but-blank token with BAD_REQUEST, so the
  // domain route is only reachable if the field is absent altogether.
  it('omits join_token entirely when no token is given', async () => {
    const f = recordingFetch();
    await joinOrganisation(undefined, f as any);
    expect(sentBody(f)).toEqual({});
    expect('join_token' in sentBody(f)).toBe(false);
  });
});

describe('the sidebar Join control', () => {
  let root: HTMLElement;
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    goTo('/org-manager');
    setSession('tok');
    setUid('owner-1');
    vi.spyOn(api, 'listOrganisations').mockResolvedValue({ organisations: [] });
  });

  afterEach(() => {
    dispose?.();
    dispose = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    goTo('/');
  });

  async function clickJoin(promptValue: string | null) {
    vi.stubGlobal('prompt', vi.fn(() => promptValue));
    const joinSpy = vi.spyOn(api, 'joinOrganisation').mockResolvedValue({ org_id: 'o1', org_name: 'Acme' });
    dispose = renderOrgManager(root);
    await vi.waitFor(() => expect(root.querySelector('.org-join')).not.toBeNull());
    (root.querySelector('.org-join') as HTMLElement).click();
    return joinSpy;
  }

  it('passes a typed token straight through', async () => {
    const joinSpy = await clickJoin('  td_join_abc  ');
    await vi.waitFor(() => expect(joinSpy).toHaveBeenCalledWith('td_join_abc'));
  });

  // The whole point of the domain route: an owner with a Google-linked address
  // and no token has to be able to attempt a join at all.
  it('attempts a tokenless join when the field is left blank', async () => {
    const joinSpy = await clickJoin('');
    await vi.waitFor(() => expect(joinSpy).toHaveBeenCalledWith(undefined));
  });

  it('attempts nothing when the prompt is dismissed', async () => {
    const joinSpy = await clickJoin(null);
    expect(joinSpy).not.toHaveBeenCalled();
  });
});
