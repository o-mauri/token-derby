import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Real electron isn't available under vitest (see identity.test.ts) — stub
// just enough of `app` that services/api.ts's setConfig can call
// setLoginItemSettings for real and we can spy on it.
const setLoginItemSettings = vi.fn();
vi.mock('electron', () => ({
  app: {
    setLoginItemSettings,
    getVersion: () => '0.0.0-test',
  },
  shell: { openExternal: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
}));

const { resolveApiBase, DEFAULT_CONFIG, loadConfig, saveConfig } = await import('../electron/config.js');
const { apiService } = await import('../electron/services/api.js');

describe('config', () => {
  it('prefers override, else env default', () => {
    expect(resolveApiBase({ ...DEFAULT_CONFIG, env: 'staging', apiBaseOverride: null }))
      .toBe('https://token-derby-staging.mauricode.co.uk/api');
    expect(resolveApiBase({ ...DEFAULT_CONFIG, env: 'prod', apiBaseOverride: 'http://localhost:3000/api' }))
      .toBe('http://localhost:3000/api');
  });

  it('resolves prod default when no override is set', () => {
    expect(resolveApiBase({ ...DEFAULT_CONFIG, env: 'prod', apiBaseOverride: null }))
      .toBe('https://token-derby.mauricode.co.uk/api');
  });

  it('defaults to prod', () => {
    expect(DEFAULT_CONFIG.env).toBe('prod');
  });

  describe('saveConfig / loadConfig round-trip', () => {
    let tmp: string;

    beforeEach(async () => {
      tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-desktop-config-'));
      process.env.TOKEN_DERBY_DESKTOP_HOME = tmp;
    });

    afterEach(async () => {
      delete process.env.TOKEN_DERBY_DESKTOP_HOME;
      await fs.rm(tmp, { recursive: true, force: true });
    });

    it('persists launchAtLogin: true to disk and reads it back', () => {
      saveConfig({ launchAtLogin: true });
      expect(loadConfig().launchAtLogin).toBe(true);
    });

    it('merges a patch onto whatever was already persisted', () => {
      saveConfig({ env: 'prod' });
      saveConfig({ launchAtLogin: true });
      const cfg = loadConfig();
      expect(cfg.env).toBe('prod');
      expect(cfg.launchAtLogin).toBe(true);
    });
  });

  describe('apiService.setConfig applies the login item in the main process', () => {
    let tmp: string;

    beforeEach(async () => {
      tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-desktop-config-svc-'));
      process.env.TOKEN_DERBY_DESKTOP_HOME = tmp;
      setLoginItemSettings.mockClear();
    });

    afterEach(async () => {
      delete process.env.TOKEN_DERBY_DESKTOP_HOME;
      await fs.rm(tmp, { recursive: true, force: true });
    });

    it('calls app.setLoginItemSettings({ openAtLogin: true }) when launchAtLogin is set true', async () => {
      const result = await apiService.setConfig({ launchAtLogin: true });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.launchAtLogin).toBe(true);
      expect(setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true });
    });

    it('calls app.setLoginItemSettings({ openAtLogin: false }) when launchAtLogin is set false', async () => {
      await apiService.setConfig({ launchAtLogin: true });
      setLoginItemSettings.mockClear();
      await apiService.setConfig({ launchAtLogin: false });
      expect(setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: false });
    });

    it('does not touch the login item when the patch omits launchAtLogin', async () => {
      await apiService.setConfig({ env: 'prod' });
      expect(setLoginItemSettings).not.toHaveBeenCalled();
    });
  });
});
