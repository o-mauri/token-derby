import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { sumGeminiTokens, sumGeminiByConversation } from '../src/gemini.js';

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

async function writeJson(root: string, projectHash: string, file: string, messages: object[]): Promise<void> {
  const dir = path.join(root, projectHash, 'chats');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, file), JSON.stringify({ sessionId: 'x', messages }));
}

describe('sumGeminiTokens', () => {
  it('throws when the gemini dir does not exist (fail-loud for a missing primary)', async () => {
    process.env.TOKEN_DERBY_GEMINI_DIR = path.join(os.tmpdir(), 'td-gem-missing-' + Math.random());
    await expect(sumGeminiTokens()).rejects.toThrow();
  });

  it('returns zero when the gemini dir exists but has no chats yet', async () => {
    await tmpGemini(); // creates the root dir, no project/chats
    expect(await sumGeminiTokens()).toEqual({ input: 0, output: 0 });
  });

  it('fresh input subtracts cached; output already includes thoughts (not re-added)', async () => {
    const root = await tmpGemini();
    await writeJson(root, 'projA', 's1.json', [
      { type: 'user', content: 'hi' },
      { type: 'gemini', tokens: { input: 100, output: 25, cached: 60, thoughts: 5, tool: 0, total: 130 } },
      { type: 'gemini', tokens: { input: 10, output: 2, cached: 0, thoughts: 1, tool: 0, total: 13 } },
    ]);
    // input = (100-60) + (10-0) = 50 ; output = 25 + 2 = 27 (thoughts NOT added)
    expect(await sumGeminiTokens()).toEqual({ input: 50, output: 27 });
  });

  it('reads JSONL sessions (one record per line)', async () => {
    const root = await tmpGemini();
    const dir = path.join(root, 'projB', 'chats');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 's.jsonl'),
      JSON.stringify({ type: 'session_metadata', sessionId: 'x' }) + '\n' +
      JSON.stringify({ type: 'gemini', tokens: { input: 30, output: 9, cached: 10 } }) + '\n');
    // input = 30-10 = 20 ; output = 9
    expect(await sumGeminiTokens()).toEqual({ input: 20, output: 9 });
  });

  it('ignores messages without tokens, tolerates corrupt files, skips dirs without chats/', async () => {
    const root = await tmpGemini();
    await writeJson(root, 'projA', 'good.json', [{ type: 'gemini', tokens: { input: 7, output: 3, cached: 0 } }]);
    await fs.writeFile(path.join(root, 'projA', 'chats', 'bad.json'), 'not json');
    await fs.mkdir(path.join(root, 'loose'), { recursive: true });
    expect(await sumGeminiTokens()).toEqual({ input: 7, output: 3 });
  });
});

describe('sumGeminiByConversation', () => {
  it('keys each chat file as its own conversation', async () => {
    const root = await tmpGemini();
    await writeJson(root, 'projA', 's1.json', [{ type: 'gemini', tokens: { input: 100, output: 10, cached: 60 } }]);
    await writeJson(root, 'projA', 's2.json', [{ type: 'gemini', tokens: { input: 50, output: 5, cached: 0 } }]);
    const map = await sumGeminiByConversation();
    expect(map.size).toBe(2);
    const vals = [...map.values()];
    // s1: input 100-60=40 out 10 ; s2: input 50 out 5
    expect(vals).toEqual(expect.arrayContaining([{ input: 40, output: 10 }, { input: 50, output: 5 }]));
  });

  it('sumGeminiTokens equals the sum of the by-conversation map', async () => {
    const root = await tmpGemini();
    await writeJson(root, 'projA', 's1.json', [{ type: 'gemini', tokens: { input: 7, output: 3, cached: 0 } }]);
    await writeJson(root, 'projB', 's1.json', [{ type: 'gemini', tokens: { input: 30, output: 9, cached: 10 } }]);
    const total = await sumGeminiTokens();
    const map = await sumGeminiByConversation();
    let input = 0, output = 0;
    for (const t of map.values()) { input += t.input; output += t.output; }
    expect({ input, output }).toEqual(total);
  });

  it('throws when the gemini dir does not exist (fail-loud)', async () => {
    process.env.TOKEN_DERBY_GEMINI_DIR = path.join(os.tmpdir(), 'td-gem-missing-' + Math.random());
    await expect(sumGeminiByConversation()).rejects.toThrow();
  });
});
