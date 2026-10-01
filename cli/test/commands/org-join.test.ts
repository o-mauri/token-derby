import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { saveIdentity } from '../../src/identity/identity.js';
import { _resetIdentityCacheForTests } from '../../src/api/client.js';

let tmp: string;
let logs: string[] = [];
let errors: string[] = [];
let origError: typeof console.error;
let origLog: typeof console.log;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-orgjoin-'));
  process.env.TOKEN_DERBY_HOME = tmp;
  _resetIdentityCacheForTests();
  logs = [];
  errors = [];
  origError = console.error;
  origLog = console.log;
  console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };
  console.log = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
  await saveIdentity({
    user_id: '12345678-1234-1234-1234-123456789012',
    display_name: 'Joiner',
    secret_token: 's',
    created_at: '2026-05-14T10:00:00Z',
  });
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_HOME;
  await fs.rm(tmp, { recursive: true, force: true });
  _resetIdentityCacheForTests();
  console.error = origError;
  console.log = origLog;
});

function ok(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(body),
  };
}

function failure(code: string, message: string, status = 404) {
  return {
    ok: false,
    status,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify({ code, message }),
  };
}

/** The JSON the command actually put on the wire. */
function sentBody(fetch: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = fetch.mock.calls[0]![1] as { body?: string };
  return JSON.parse(init.body ?? '{}');
}

describe('orgJoinCommand', () => {
  it('sends the token when one is given', async () => {
    const fetch = vi.fn(async () => ok({ org_id: 'o1', org_name: 'Acme' }));
    (globalThis as any).fetch = fetch;

    const { orgJoinCommand } = await import('../../src/commands/org-join.js');
    const rc = await orgJoinCommand('td_join_abc');

    expect(rc).toBe(0);
    expect(sentBody(fetch)).toEqual({ join_token: 'td_join_abc' });
    expect(logs.join('\n')).toContain('Acme');
  });

  // The domain route: the server rejects a supplied-but-blank token with
  // BAD_REQUEST, so "no token" has to mean the field is absent, not empty.
  it('omits join_token entirely when no token is given', async () => {
    const fetch = vi.fn(async () => ok({ org_id: 'o2', org_name: 'ByDomain' }));
    (globalThis as any).fetch = fetch;

    const { orgJoinCommand } = await import('../../src/commands/org-join.js');
    const rc = await orgJoinCommand(undefined);

    expect(rc).toBe(0);
    const body = sentBody(fetch);
    expect('join_token' in body).toBe(false);
    expect(logs.join('\n')).toContain('ByDomain');
  });

  it('treats a whitespace-only token as no token rather than sending it blank', async () => {
    const fetch = vi.fn(async () => ok({ org_id: 'o2', org_name: 'ByDomain' }));
    (globalThis as any).fetch = fetch;

    const { orgJoinCommand } = await import('../../src/commands/org-join.js');
    const rc = await orgJoinCommand('   ');

    expect(rc).toBe(0);
    expect('join_token' in sentBody(fetch)).toBe(false);
  });

  it('reports a server refusal of a tokenless join and exits non-zero', async () => {
    const fetch = vi.fn(async () => failure('ORG_NOT_FOUND', 'No organisation accepts members from acme.com'));
    (globalThis as any).fetch = fetch;

    const { orgJoinCommand } = await import('../../src/commands/org-join.js');
    const rc = await orgJoinCommand(undefined);

    expect(rc).toBe(1);
    expect(errors.join('\n')).toContain('acme.com');
  });
});
