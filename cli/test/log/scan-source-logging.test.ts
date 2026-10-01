import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SourceRootMissing } from '../../src/tokens/source-root.js';

const codexConvs = vi.fn();
const geminiConvs = vi.fn();

vi.mock('../../src/tokens/harnesses/engine.js', () => ({
  count: (h: { id: string }) => {
    if (h.id === 'codex-cli') return codexConvs();
    if (h.id === 'gemini-cli') return geminiConvs();
    return Promise.resolve({ byFamily: new Map(), notices: [] });
  },
}));

const { readAllSources, isStall } = await import('../../src/tokens/race-tokens.js');
const { _resetLoggerForTests } = await import('../../src/log/logger.js');
const { logFile } = await import('../../src/paths.js');

let home: string | undefined;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'td-srclog-'));
  process.env.TOKEN_DERBY_HOME = home;
  _resetLoggerForTests();
  codexConvs.mockReset();
  geminiConvs.mockReset();
  codexConvs.mockResolvedValue({ byFamily: new Map(), notices: [] });
  geminiConvs.mockResolvedValue({ byFamily: new Map(), notices: [] });
});

afterEach(async () => {
  if (home) { await fs.rm(home, { recursive: true, force: true }); home = undefined; }
  delete process.env.TOKEN_DERBY_HOME;
  _resetLoggerForTests();
});

function readLog(): string {
  return fsSync.existsSync(logFile()) ? fsSync.readFileSync(logFile(), 'utf8') : '';
}

describe('source read failures', () => {
  it('records a real read error, and skips that source rather than scoring it zero', async () => {
    codexConvs.mockRejectedValue(new Error('EACCES: permission denied'));

    const reading = await readAllSources();

    // The beat still goes out — one broken tool must not freeze the race.
    expect(isStall(reading)).toBe(false);
    expect((reading as any).degraded).toEqual([
      { harness: 'codex-cli', label: 'Codex CLI', message: 'EACCES: permission denied' },
    ]);
    const text = readLog();
    expect(text).toContain('scan.source.err');
    expect(text).toContain('"harness":"codex-cli"');
    expect(text).toContain('EACCES');
  });

  it('logs every failing source, not just the first', async () => {
    codexConvs.mockRejectedValue(new Error('codex broke'));
    geminiConvs.mockRejectedValue(new Error('gemini broke'));

    const reading = await readAllSources();

    expect((reading as any).degraded).toHaveLength(2);
    const text = readLog();
    expect(text).toContain('"harness":"codex-cli"');
    expect(text).toContain('"harness":"gemini-cli"');
  });

  it('stays quiet when a source is simply not installed', async () => {
    // Most machines have only one of the three tools. A line per missing source
    // per beat would bury the failures that matter.
    codexConvs.mockRejectedValue(new SourceRootMissing('/home/me/.codex'));

    const reading = await readAllSources();

    expect(isStall(reading)).toBe(false); // an uninstalled tool is not a failure
    expect(readLog()).not.toContain('scan.source.err');
  });
});
