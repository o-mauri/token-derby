import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { envCommand } from '../../src/commands/env.js';
import { selectedEnv } from '../../src/env/env.js';

let tmp: string;
let logs: string[];
let errs: string[];
let origLog: typeof console.log;
let origErr: typeof console.error;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-envcmd-'));
  process.env.TOKEN_DERBY_BASE = tmp;
  delete process.env.TOKEN_DERBY_HOME;
  delete process.env.TOKEN_DERBY_API_BASE;
  logs = []; errs = [];
  origLog = console.log; origErr = console.error;
  console.log = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };
  console.error = (...a: unknown[]) => { errs.push(a.map(String).join(' ')); };
});

afterEach(async () => {
  console.log = origLog; console.error = origErr;
  delete process.env.TOKEN_DERBY_BASE;
  delete process.env.TOKEN_DERBY_HOME;
  delete process.env.TOKEN_DERBY_API_BASE;
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('env command', () => {
  it('with no arg prints the current env (default prod) and its resolved base/dir', () => {
    const code = envCommand();
    expect(code).toBe(0);
    const out = logs.join('\n');
    expect(out).toContain('prod');
    expect(out).toContain('https://token-derby.mauricode.co.uk/api');
  });

  it('switches to staging and persists the selection', () => {
    const code = envCommand('staging');
    expect(code).toBe(0);
    expect(selectedEnv()).toBe('staging');
    expect(logs.join('\n')).toContain('token-derby-staging.mauricode.co.uk/api');
  });

  it('switches back to prod', () => {
    envCommand('staging');
    const code = envCommand('prod');
    expect(code).toBe(0);
    expect(selectedEnv()).toBe('prod');
  });

  it('rejects an unknown env with exit code 2 and lists valid values', () => {
    const code = envCommand('production');
    expect(code).toBe(2);
    expect(errs.join('\n')).toContain('prod');
    expect(errs.join('\n')).toContain('staging');
  });
});
