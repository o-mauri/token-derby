import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadAuthConfig, __resetAuthConfigCacheForTests } from '../../src/lib/auth-config.js';

function fakeSsm(values: Record<string, string>, onSend?: () => void) {
  return {
    send: async (cmd: any) => {
      onSend?.();
      const name = cmd.input.Name as string;
      if (!(name in values)) throw new Error(`unexpected parameter ${name}`);
      return { Parameter: { Value: values[name] } };
    },
  } as any;
}

const PARAMS = {
  '/token-derby/auth/google-client-id': 'client-id-123',
  '/token-derby/auth/google-client-secret': 'GOCSPX-secret',
  '/token-derby/auth/state-secret': 'a'.repeat(64),
};

const ENV_KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'AUTH_STATE_SECRET', 'DYNAMODB_ENDPOINT'] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  __resetAuthConfigCacheForTests();
  // A developer with GOOGLE_CLIENT_ID exported must not change what these test.
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('loadAuthConfig', () => {
  it('reads all three parameters', async () => {
    const cfg = await loadAuthConfig(fakeSsm(PARAMS));
    expect(cfg.clientId).toBe('client-id-123');
    expect(cfg.clientSecret).toBe('GOCSPX-secret');
    expect(cfg.stateSecret).toHaveLength(64);
  });

  it('caches after the first load', async () => {
    let calls = 0;
    const client = fakeSsm(PARAMS, () => { calls++; });
    await loadAuthConfig(client);
    const afterFirst = calls;
    await loadAuthConfig(client);
    expect(calls).toBe(afterFirst);
    expect(afterFirst).toBe(3);
  });

  it('throws when a parameter is empty rather than returning a blank secret', async () => {
    const client = fakeSsm({ ...PARAMS, '/token-derby/auth/state-secret': '' });
    await expect(loadAuthConfig(client)).rejects.toThrow(/state-secret/);
  });

  it('ignores the environment when DYNAMODB_ENDPOINT is absent, i.e. when deployed', async () => {
    process.env.GOOGLE_CLIENT_ID = 'env-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'env-secret';
    process.env.AUTH_STATE_SECRET = 'e'.repeat(64);

    let calls = 0;
    const cfg = await loadAuthConfig(fakeSsm(PARAMS, () => { calls++; }));

    expect(calls).toBe(3);
    expect(cfg.clientId).toBe('client-id-123');
    expect(cfg.clientSecret).toBe('GOCSPX-secret');
  });

  it('uses the environment only for a local run, marked by DYNAMODB_ENDPOINT', async () => {
    process.env.DYNAMODB_ENDPOINT = 'http://localhost:8000';
    process.env.GOOGLE_CLIENT_ID = 'env-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'env-secret';
    process.env.AUTH_STATE_SECRET = 'e'.repeat(64);

    let calls = 0;
    const cfg = await loadAuthConfig(fakeSsm(PARAMS, () => { calls++; }));

    expect(calls).toBe(0);
    expect(cfg.clientId).toBe('env-client-id');
  });

  it('falls back to SSM locally when the env trio is incomplete', async () => {
    process.env.DYNAMODB_ENDPOINT = 'http://localhost:8000';
    process.env.GOOGLE_CLIENT_ID = 'env-client-id';

    const cfg = await loadAuthConfig(fakeSsm(PARAMS));
    expect(cfg.clientId).toBe('client-id-123');
  });
});
