import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { sumGeminiTokens } from '../../src/tokens/gemini.js';

const dirs: string[] = [];
async function tmpGemini(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'td-gem-'));
  dirs.push(d);
  process.env.TOKEN_DERBY_GEMINI_DIR = d;
  return d;
}
afterEach(async () => {
  delete process.env.TOKEN_DERBY_GEMINI_DIR;
  for (const d of dirs.splice(0)) await fs.rm(d, { recursive: true, force: true });
});

async function writeSession(root: string, projectHash: string, file: string, messages: object[]): Promise<void> {
  const dir = path.join(root, projectHash, 'chats');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, file), JSON.stringify({ sessionId: 'x', messages }));
}

describe('sumGeminiTokens', () => {
  it('returns zero when the gemini dir does not exist', async () => {
    process.env.TOKEN_DERBY_GEMINI_DIR = path.join(os.tmpdir(), 'td-gem-missing-' + Math.random());
    expect(await sumGeminiTokens()).toEqual({ input: 0, output: 0 });
  });

  it('sums fresh input and output (output includes thoughts, excludes cached)', async () => {
    const root = await tmpGemini();
    await writeSession(root, 'projA', 's1.json', [
      { type: 'user', content: 'hi' },
      { type: 'gemini', model: 'gemini-3-flash-preview', tokens: { input: 100, output: 20, cached: 999, thoughts: 5, tool: 0, total: 1124 } },
      { type: 'gemini', model: 'gemini-3-flash-preview', tokens: { input: 10, output: 2, cached: 0, thoughts: 1 } },
    ]);
    // input = 100 + 10 = 110 (cached excluded); output = (20+5) + (2+1) = 28
    expect(await sumGeminiTokens()).toEqual({ input: 110, output: 28 });
  });

  it('sums across multiple project dirs and session files', async () => {
    const root = await tmpGemini();
    await writeSession(root, 'projA', 's1.json', [{ type: 'gemini', tokens: { input: 100, output: 10 } }]);
    await writeSession(root, 'projA', 's2.json', [{ type: 'gemini', tokens: { input: 50, output: 5 } }]);
    await writeSession(root, 'projB', 's1.json', [{ type: 'gemini', tokens: { input: 25, output: 1 } }]);
    expect(await sumGeminiTokens()).toEqual({ input: 175, output: 16 });
  });

  it('ignores messages without a tokens object, and tolerates corrupt files', async () => {
    const root = await tmpGemini();
    await writeSession(root, 'projA', 'good.json', [
      { type: 'gemini', tokens: { input: 7, output: 3 } },
      { type: 'user', content: 'no tokens' },
    ]);
    await fs.writeFile(path.join(root, 'projA', 'chats', 'bad.json'), 'not json');
    expect(await sumGeminiTokens()).toEqual({ input: 7, output: 3 });
  });

  it('ignores project dirs without a chats/ subdir', async () => {
    const root = await tmpGemini();
    await fs.mkdir(path.join(root, 'loose'), { recursive: true });
    await writeSession(root, 'projA', 's.json', [{ type: 'gemini', tokens: { input: 9, output: 1 } }]);
    expect(await sumGeminiTokens()).toEqual({ input: 9, output: 1 });
  });
});
