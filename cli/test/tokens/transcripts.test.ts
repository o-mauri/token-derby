import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { sumTokens } from '../../src/tokens/transcripts.js';

const dirs: string[] = [];
async function tmpProjects(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'td-tx-'));
  dirs.push(d);
  process.env.TOKEN_DERBY_CLAUDE_DIR = d;
  return d;
}
afterEach(async () => {
  delete process.env.TOKEN_DERBY_CLAUDE_DIR;
  for (const d of dirs.splice(0)) await fs.rm(d, { recursive: true, force: true });
});

function line(output: number, input = 0, cacheCreate = 0): string {
  return JSON.stringify({ message: { usage: { output_tokens: output, input_tokens: input, cache_creation_input_tokens: cacheCreate } } });
}

describe('sumTokens (fail-loud)', () => {
  it('sums output and input across project jsonl files', async () => {
    const root = await tmpProjects();
    const proj = path.join(root, 'proj1');
    await fs.mkdir(proj, { recursive: true });
    await fs.writeFile(path.join(proj, 'a.jsonl'), line(100, 5, 20) + '\n' + line(50) + '\n');
    const t = await sumTokens();
    expect(t.output).toBe(150);
    expect(t.input).toBe(25);
  });

  it('throws when the projects directory is missing (not 0)', async () => {
    process.env.TOKEN_DERBY_CLAUDE_DIR = path.join(os.tmpdir(), 'td-does-not-exist-' + Math.random());
    await expect(sumTokens()).rejects.toThrow();
  });

  it('throws when a transcript file cannot be read (not a partial sum)', async () => {
    const root = await tmpProjects();
    const proj = path.join(root, 'proj1');
    await fs.mkdir(proj, { recursive: true });
    // A directory named like a .jsonl file makes readFile fail with EISDIR.
    await fs.mkdir(path.join(proj, 'broken.jsonl'));
    await expect(sumTokens()).rejects.toThrow();
  });
});
