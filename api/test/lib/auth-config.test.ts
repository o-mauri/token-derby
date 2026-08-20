import { describe, it, expect, beforeEach } from 'vitest';
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

beforeEach(() => __resetAuthConfigCacheForTests());

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
});
