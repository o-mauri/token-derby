import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { logsCommand } from '../../src/commands/logs.js';
import { logFile, logDir } from '../../src/paths.js';

let tmp: string;
let out: string[];

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-logscmd-'));
  process.env.TOKEN_DERBY_HOME = tmp;
  out = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { out.push(a.join(' ')); });
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { out.push(a.join(' ')); });
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_HOME;
  await fs.rm(tmp, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function seed(lines: string[]): void {
  fsSync.mkdirSync(logDir(), { recursive: true });
  fsSync.writeFileSync(logFile(), lines.map(l => `${l}\n`).join(''), 'utf8');
}

describe('logs command', () => {
  it('prints the path of the log file', async () => {
    seed(['line one']);

    const code = await logsCommand([]);

    expect(code).toBe(0);
    expect(out.join('\n')).toContain(logFile());
  });

  it('prints the last n lines with --tail', async () => {
    seed(Array.from({ length: 100 }, (_, i) => `entry-${i}`));

    const code = await logsCommand(['--tail', '3']);

    expect(code).toBe(0);
    const text = out.join('\n');
    expect(text).toContain('entry-99');
    expect(text).toContain('entry-97');
    expect(text).not.toContain('entry-96');
  });

  it('defaults --tail to the last 50 lines', async () => {
    seed(Array.from({ length: 100 }, (_, i) => `entry-${i}`));

    await logsCommand(['--tail']);

    const text = out.join('\n');
    expect(text).toContain('entry-50');
    expect(text).not.toContain('entry-49');
  });

  it('says so plainly when nothing has been logged yet', async () => {
    const code = await logsCommand([]);

    expect(code).toBe(0);
    expect(out.join('\n')).toContain('No log file yet');
  });
});
