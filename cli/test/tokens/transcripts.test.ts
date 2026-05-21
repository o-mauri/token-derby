import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { sumTokens, sumTokensForRace } from '../../src/tokens/transcripts.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-trans-'));
  process.env.TOKEN_DERBY_CLAUDE_DIR = tmp;
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_CLAUDE_DIR;
  await fs.rm(tmp, { recursive: true, force: true });
});

async function writeJsonl(rel: string, lines: object[]): Promise<void> {
  const full = path.join(tmp, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
}

describe('sumTokens', () => {
  it('returns zeros when claude dir does not exist', async () => {
    process.env.TOKEN_DERBY_CLAUDE_DIR = path.join(tmp, 'does-not-exist');
    expect(await sumTokens()).toEqual({ input: 0, output: 0 });
  });

  it('returns zeros when no jsonl files exist', async () => {
    await fs.mkdir(path.join(tmp, 'projA'));
    expect(await sumTokens()).toEqual({ input: 0, output: 0 });
  });

  it('sums input_tokens + cache_creation_input_tokens into input', async () => {
    await writeJsonl('projA/s1.jsonl', [
      { type: 'assistant', message: { usage: { input_tokens: 100, cache_creation_input_tokens: 50 } } },
      { type: 'assistant', message: { usage: { output_tokens: 25 } } },
    ]);
    expect(await sumTokens()).toEqual({ input: 150, output: 25 });
  });

  it('excludes cache_read_input_tokens from input', async () => {
    await writeJsonl('projA/s1.jsonl', [
      { type: 'assistant', message: { usage: {
        input_tokens: 10, cache_creation_input_tokens: 20, cache_read_input_tokens: 9999, output_tokens: 5,
      } } },
    ]);
    expect(await sumTokens()).toEqual({ input: 30, output: 5 });
  });

  it('sums across multiple files and projects', async () => {
    await writeJsonl('projA/s1.jsonl', [
      { type: 'assistant', message: { usage: { output_tokens: 100 } } },
    ]);
    await writeJsonl('projA/s2.jsonl', [
      { type: 'assistant', message: { usage: { input_tokens: 30, output_tokens: 200 } } },
    ]);
    await writeJsonl('projB/s1.jsonl', [
      { type: 'assistant', message: { usage: { output_tokens: 50 } } },
    ]);
    expect(await sumTokens()).toEqual({ input: 30, output: 350 });
  });

  it('skips lines without message.usage', async () => {
    await writeJsonl('p/s.jsonl', [
      { type: 'system' },
      { type: 'assistant', message: { content: 'x' } },
      { type: 'assistant', message: { usage: { output_tokens: 42 } } },
    ]);
    expect(await sumTokens()).toEqual({ input: 0, output: 42 });
  });

  it('tolerates malformed JSON lines', async () => {
    const file = path.join(tmp, 'p/s.jsonl');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, [
      JSON.stringify({ type: 'assistant', message: { usage: { output_tokens: 10 } } }),
      'not json at all',
      JSON.stringify({ type: 'assistant', message: { usage: { output_tokens: 20 } } }),
    ].join('\n'));
    expect(await sumTokens()).toEqual({ input: 0, output: 30 });
  });

  it('skips empty lines', async () => {
    const file = path.join(tmp, 'p/s.jsonl');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '\n\n' + JSON.stringify({
      type: 'assistant', message: { usage: { output_tokens: 7 } },
    }) + '\n\n');
    expect(await sumTokens()).toEqual({ input: 0, output: 7 });
  });
});

describe('sumTokensForRace', () => {
  beforeEach(async () => {
    await writeJsonl('p/s.jsonl', [
      { type: 'assistant', message: { usage: {
        input_tokens: 100, cache_creation_input_tokens: 50, cache_read_input_tokens: 9999, output_tokens: 25,
      } } },
    ]);
  });

  it('returns output only when counts_input is false/undefined', async () => {
    expect(await sumTokensForRace({})).toBe(25);
    expect(await sumTokensForRace({ counts_input: false })).toBe(25);
  });

  it('returns input + output (excluding cache reads) when counts_input is true', async () => {
    expect(await sumTokensForRace({ counts_input: true })).toBe(175);
  });
});
