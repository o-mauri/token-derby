import { describe, it, expect, vi } from 'vitest';
import { loadAdminConfig, __resetAdminConfigCache } from '../../src/lib/admin-config.js';

function fakeSsm(values: Record<string, string>) {
  return {
    send: vi.fn(async (cmd: any) => {
      const name = cmd.input.Name as string;
      if (!(name in values)) throw new Error(`ParameterNotFound: ${name}`);
      return { Parameter: { Value: values[name] } };
    }),
  } as any;
}

describe('loadAdminConfig', () => {
  it('reads the three params and caches the result', async () => {
    __resetAdminConfigCache();
    const ssm = fakeSsm({
      '/token-derby/admin/username': 'omar',
      '/token-derby/admin/password-hash': 'salt:hash',
      '/token-derby/admin/session-secret': 'sekret',
    });
    const cfg = await loadAdminConfig(ssm);
    expect(cfg).toEqual({ username: 'omar', passwordHash: 'salt:hash', sessionSecret: 'sekret' });
    // second call is served from cache — no further SSM sends
    const cfg2 = await loadAdminConfig(ssm);
    expect(cfg2).toBe(cfg);
    expect(ssm.send).toHaveBeenCalledTimes(3);
  });

  it('throws when a parameter is missing', async () => {
    __resetAdminConfigCache();
    const ssm = fakeSsm({
      '/token-derby/admin/username': 'omar',
      // password-hash + session-secret intentionally absent
    });
    await expect(loadAdminConfig(ssm)).rejects.toThrow();
  });

  it('throws when a parameter value is empty', async () => {
    __resetAdminConfigCache();
    const ssm = fakeSsm({
      '/token-derby/admin/username': 'omar',
      '/token-derby/admin/password-hash': '',
      '/token-derby/admin/session-secret': 'sekret',
    });
    await expect(loadAdminConfig(ssm)).rejects.toThrow(/empty/);
  });
});
