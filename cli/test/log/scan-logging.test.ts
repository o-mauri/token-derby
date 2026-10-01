import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { scanWithTimeout } from '../../src/tokens/race-tokens.js';
import { _resetLoggerForTests } from '../../src/log/logger.js';
import { logFile } from '../../src/paths.js';

let home: string | undefined;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'td-scanlog-'));
  process.env.TOKEN_DERBY_HOME = home;
  _resetLoggerForTests();
});

afterEach(async () => {
  if (home) { await fs.rm(home, { recursive: true, force: true }); home = undefined; }
  delete process.env.TOKEN_DERBY_HOME;
  _resetLoggerForTests();
});

function readLog(): string {
  return fsSync.existsSync(logFile()) ? fsSync.readFileSync(logFile(), 'utf8') : '';
}

const goodReading = { secondary: { claude: 1, codex: 0, gemini: 0 }, primaryByConv: new Map() } as any;

describe('token scan logging', () => {
  it('records a timeout together with the diagnosis shown on screen', async () => {
    await scanWithTimeout(
      () => new Promise(() => {}), // never resolves
      5,
      () => 'claude (900 MB) still scanning',
    );

    const text = readLog();
    expect(text).toContain('WARN  scan.timeout');
    expect(text).toContain('claude (900 MB) still scanning');
  });

  it('records a scan that came back as a stall', async () => {
    await scanWithTimeout(async () => ({ stall: 'history directory unreadable' }), 1_000);

    expect(readLog()).toContain('scan.stall');
    expect(readLog()).toContain('history directory unreadable');
  });

  it('stays quiet when the scan succeeds', async () => {
    await scanWithTimeout(async () => goodReading, 1_000);

    expect(readLog()).not.toContain('scan.');
  });
});

describe('token scan failure logging', () => {
  // A throw escapes scanWithTimeout and is turned into a stall reading by
  // run-race.tsx. Without a line here the log shows a healthy beat.prepare.done
  // while the racer is looking at "Token scan failed" on screen.
  it('records a scan that threw, and still lets the error through', async () => {
    const boom = new Error('EACCES: permission denied, open transcript.jsonl');

    await expect(
      scanWithTimeout(async () => { throw boom; }, 1_000),
    ).rejects.toThrow('EACCES');

    const text = readLog();
    expect(text).toContain('ERROR scan.error');
    expect(text).toContain('EACCES');
  });
});
