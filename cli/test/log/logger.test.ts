import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { logInfo, logWarn, logError, _resetLoggerForTests } from '../../src/log/logger.js';
import { logFile, logDir } from '../../src/paths.js';

let home: string | undefined;

afterEach(async () => {
  if (home) { await fs.rm(home, { recursive: true, force: true }); home = undefined; }
  delete process.env.TOKEN_DERBY_HOME;
  _resetLoggerForTests();
});

async function tmpHome(): Promise<void> {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'td-log-'));
  process.env.TOKEN_DERBY_HOME = home;
  _resetLoggerForTests();
}

function readLog(): string {
  return fsSync.readFileSync(logFile(), 'utf8');
}

describe('logger writes', () => {
  it('appends a line naming the event and its fields', async () => {
    await tmpHome();

    logInfo('beat.send.ok', { seq: 42, ms: 310 });

    const line = readLog().trimEnd();
    expect(line).toContain('INFO');
    expect(line).toContain('beat.send.ok');
    expect(line).toContain('"seq":42');
    expect(line).toContain('"ms":310');
  });
});

describe('logger redaction', () => {
  it('never writes the value of a credential-shaped field', async () => {
    await tmpHome();

    logInfo('cmd.start', {
      secret_token: 'SECRET_ABC',
      heartbeat_token: 'HB_XYZ',
      authorization: 'Bearer NOPE',
      join_code: 'ABCDEF',
    });

    const line = readLog();
    expect(line).not.toContain('SECRET_ABC');
    expect(line).not.toContain('HB_XYZ');
    expect(line).not.toContain('NOPE');
    expect(line).toContain('[redacted]');
    expect(line).toContain('ABCDEF');
  });
});

/** Writes `count` entries of ~100KB each, enough to cross the 2MB roll threshold. */
function writeBulk(count: number): void {
  const blob = 'x'.repeat(100_000);
  for (let i = 0; i < count; i++) logInfo('bulk', { i, blob });
}

describe('logger rotation', () => {
  it('rolls the current log to .1 once it passes the size limit', async () => {
    await tmpHome();

    writeBulk(25); // ~2.5MB

    expect(fsSync.existsSync(`${logFile()}.1`)).toBe(true);
    expect(fsSync.statSync(logFile()).size).toBeLessThan(2_000_000);
  });

  it('keeps at most 5 files, dropping the oldest roll', async () => {
    await tmpHome();

    writeBulk(150); // ~15MB — more than 5 files' worth

    expect(fsSync.existsSync(`${logFile()}.4`)).toBe(true);
    expect(fsSync.existsSync(`${logFile()}.5`)).toBe(false);
    const total = fsSync.readdirSync(logDir()).length;
    expect(total).toBe(5);
  });
});

describe('logger levels', () => {
  it('records the level it was called at', async () => {
    await tmpHome();

    logWarn('scan.stall', { reason: 'slow' });
    logError('cmd.crash', { message: 'boom' });

    const text = readLog();
    expect(text).toContain('WARN  scan.stall');
    expect(text).toContain('ERROR cmd.crash');
  });
});

describe('logger safety', () => {
  it('swallows a write failure rather than throwing into the caller', async () => {
    await tmpHome();
    // A regular file where the log directory should be: mkdir and append both fail.
    fsSync.writeFileSync(path.join(home!, 'logs'), 'not a directory', 'utf8');

    expect(() => logInfo('cmd.start', { cmd: 'join' })).not.toThrow();
  });
});
