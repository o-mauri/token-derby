import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { selectedEnv, setSelectedEnv, configFile, ENV_NAMES } from '../../src/env/env.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-env-'));
  process.env.TOKEN_DERBY_BASE = tmp;
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_BASE;
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('env pointer', () => {
  it('ENV_NAMES lists prod and staging', () => {
    expect([...ENV_NAMES]).toEqual(['prod', 'staging']);
  });

  it('configFile lives under <base>/.token-derby/config.json', () => {
    expect(configFile()).toBe(path.join(tmp, '.token-derby', 'config.json'));
  });

  it('selectedEnv defaults to prod when no pointer file exists', () => {
    expect(selectedEnv()).toBe('prod');
  });

  it('setSelectedEnv then selectedEnv round-trips staging', () => {
    setSelectedEnv('staging');
    expect(selectedEnv()).toBe('staging');
  });

  it('setSelectedEnv then selectedEnv round-trips prod', () => {
    setSelectedEnv('prod');
    expect(selectedEnv()).toBe('prod');
  });

  it('selectedEnv returns prod on corrupt JSON', async () => {
    await fs.mkdir(path.join(tmp, '.token-derby'), { recursive: true });
    await fs.writeFile(configFile(), '{not-json', 'utf8');
    expect(selectedEnv()).toBe('prod');
  });

  it('selectedEnv returns prod on unknown env value', async () => {
    await fs.mkdir(path.join(tmp, '.token-derby'), { recursive: true });
    await fs.writeFile(configFile(), JSON.stringify({ env: 'wibble' }), 'utf8');
    expect(selectedEnv()).toBe('prod');
  });
});
