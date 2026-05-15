import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { sumOutputTokens } from '../../src/tokens/transcripts.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-trans-'));
  process.env.TOKEN_DERBY_CLAUDE_DIR = tmp;
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_CLAUDE_DIR;
  delete process.env.TOKEN_DERBY_COUNT_INPUT_TOKENS;
  await fs.rm(tmp, { recursive: true, force: true });
});

async function writeJsonl(rel: string, lines: object[]): Promise<void> {
  const full = path.join(tmp, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
}

describe('sumOutputTokens', () => {
  it('returns 0 when claude dir does not exist', async () => {
    process.env.TOKEN_DERBY_CLAUDE_DIR = path.join(tmp, 'does-not-exist');
    expect(await sumOutputTokens()).toBe(0);
  });

  it('returns 0 when no jsonl files exist', async () => {
    await fs.mkdir(path.join(tmp, 'projA'));
    expect(await sumOutputTokens()).toBe(0);
  });

  it('sums message.usage.output_tokens across one file', async () => {
    await writeJsonl('projA/session1.jsonl', [
      { type: 'user', message: { content: 'hi' } },
      { type: 'assistant', message: { usage: { output_tokens: 100 } } },
      { type: 'assistant', message: { usage: { output_tokens: 250 } } },
    ]);
    expect(await sumOutputTokens()).toBe(350);
  });

  it('sums across multiple files and projects', async () => {
    await writeJsonl('projA/s1.jsonl', [
      { type: 'assistant', message: { usage: { output_tokens: 100 } } },
    ]);
    await writeJsonl('projA/s2.jsonl', [
      { type: 'assistant', message: { usage: { output_tokens: 200 } } },
    ]);
    await writeJsonl('projB/s1.jsonl', [
      { type: 'assistant', message: { usage: { output_tokens: 50 } } },
    ]);
    expect(await sumOutputTokens()).toBe(350);
  });

  it('skips lines without message.usage and sums output only by default', async () => {
    await writeJsonl('p/s.jsonl', [
      { type: 'system' },
      { type: 'assistant', message: { content: 'x' } },
      { type: 'assistant', message: { usage: { input_tokens: 100 } } },
      { type: 'assistant', message: { usage: { output_tokens: 42 } } },
    ]);
    expect(await sumOutputTokens()).toBe(42);
  });

  it('includes input tokens when TOKEN_DERBY_COUNT_INPUT_TOKENS is set', async () => {
    process.env.TOKEN_DERBY_COUNT_INPUT_TOKENS = '1';
    await writeJsonl('p/s.jsonl', [
      { type: 'assistant', message: { usage: { input_tokens: 100, cache_creation_input_tokens: 5, cache_read_input_tokens: 3 } } },
      { type: 'assistant', message: { usage: { output_tokens: 42 } } },
    ]);
    expect(await sumOutputTokens()).toBe(150);
  });

  it('tolerates malformed JSON lines (logs nothing, continues)', async () => {
    const file = path.join(tmp, 'p/s.jsonl');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, [
      JSON.stringify({ type: 'assistant', message: { usage: { output_tokens: 10 } } }),
      'not json at all',
      JSON.stringify({ type: 'assistant', message: { usage: { output_tokens: 20 } } }),
    ].join('\n'));
    expect(await sumOutputTokens()).toBe(30);
  });

  it('skips empty lines', async () => {
    const file = path.join(tmp, 'p/s.jsonl');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '\n\n' + JSON.stringify({
      type: 'assistant', message: { usage: { output_tokens: 7 } },
    }) + '\n\n');
    expect(await sumOutputTokens()).toBe(7);
  });
});
