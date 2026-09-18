import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SourceRootMissing } from '../../src/tokens/source-root.js';

const codexConvs = vi.fn();
const geminiConvs = vi.fn();

vi.mock('../../src/tokens/transcripts.js', () => ({
  sumTokensByConversation: vi.fn(async () => new Map()),
}));
vi.mock('../../src/tokens/codex.js', () => ({
  sumCodexByConversation: (...a: unknown[]) => codexConvs(...a),
}));
vi.mock('../../src/tokens/gemini.js', () => ({
  sumGeminiByConversation: (...a: unknown[]) => geminiConvs(...a),
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
  codexConvs.mockResolvedValue(new Map());
  geminiConvs.mockResolvedValue(new Map());
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
  it('records a real read error, and stalls rather than scoring a silent zero', async () => {
    codexConvs.mockRejectedValue(new Error('EACCES: permission denied'));

    const reading = await readAllSources();

    expect(isStall(reading)).toBe(true); // every model counts, so none may fail quietly
    const text = readLog();
    expect(text).toContain('scan.source.err');
    expect(text).toContain('"source":"codex"');
    expect(text).toContain('EACCES');
  });

  it('logs every failing source, not just the one that names the stall', async () => {
    codexConvs.mockRejectedValue(new Error('codex broke'));
    geminiConvs.mockRejectedValue(new Error('gemini broke'));

    const reading = await readAllSources();

    expect(isStall(reading)).toBe(true);
    const text = readLog();
    expect(text).toContain('"source":"codex"');
    expect(text).toContain('"source":"gemini"');
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
