import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { sumCodexTokens, sumCodexByConversation } from '../../src/tokens/codex.js';

const dirs: string[] = [];
async function tmpCodex(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'td-cdx-'));
  dirs.push(d);
  process.env.TOKEN_DERBY_CODEX_DIR = d;
  return d;
}
afterEach(async () => {
  delete process.env.TOKEN_DERBY_CODEX_DIR;
  for (const d of dirs.splice(0)) await fs.rm(d, { recursive: true, force: true });
});

function tokenCountEvent(input: number, cached: number, output: number): string {
  return JSON.stringify({
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: input, cached_input_tokens: cached,
          output_tokens: output, reasoning_output_tokens: 0,
          total_tokens: input + output,
        },
      },
    },
  });
}

async function writeRollout(root: string, rel: string, lines: string[]): Promise<void> {
  const dir = path.join(root, path.dirname(rel));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(root, rel), lines.join('\n') + '\n');
}

describe('sumCodexTokens', () => {
  it('throws when the codex dir does not exist (fail-loud for a missing primary)', async () => {
    process.env.TOKEN_DERBY_CODEX_DIR = path.join(os.tmpdir(), 'td-cdx-missing-' + Math.random());
    await expect(sumCodexTokens()).rejects.toThrow();
  });

  it('returns zero when the codex dir exists but has no sessions yet', async () => {
    await tmpCodex(); // creates the root dir, no rollout files
    expect(await sumCodexTokens()).toEqual({ input: 0, output: 0 });
  });

  it('uses the LAST cumulative token_count per session (no summing of events)', async () => {
    const root = await tmpCodex();
    await writeRollout(root, 'sessions/2026/06/23/rollout-a.jsonl', [
      tokenCountEvent(100, 40, 30),    // earlier cumulative snapshot
      tokenCountEvent(500, 200, 150),  // final cumulative snapshot → use this
    ]);
    // input = 500 - 200 = 300 ; output = 150
    expect(await sumCodexTokens()).toEqual({ input: 300, output: 150 });
  });

  it('sums the final snapshot across multiple session files, incl. archived', async () => {
    const root = await tmpCodex();
    await writeRollout(root, 'sessions/2026/06/23/rollout-a.jsonl', [tokenCountEvent(300, 100, 80)]);
    await writeRollout(root, 'archived_sessions/2026/06/22/rollout-b.jsonl', [tokenCountEvent(200, 50, 20)]);
    // input = (300-100) + (200-50) = 350 ; output = 80 + 20 = 100
    expect(await sumCodexTokens()).toEqual({ input: 350, output: 100 });
  });

  it('contributes 0 for a session with no token_count event, and tolerates corrupt lines', async () => {
    const root = await tmpCodex();
    await writeRollout(root, 'sessions/2026/06/23/rollout-empty.jsonl', ['{"payload":{"type":"message"}}', 'not json']);
    await writeRollout(root, 'sessions/2026/06/23/rollout-real.jsonl', [tokenCountEvent(10, 0, 5)]);
    expect(await sumCodexTokens()).toEqual({ input: 10, output: 5 });
  });

  it('never returns negative fresh input when cached exceeds input', async () => {
    const root = await tmpCodex();
    await writeRollout(root, 'sessions/2026/06/23/rollout-c.jsonl', [tokenCountEvent(50, 80, 12)]);
    expect(await sumCodexTokens()).toEqual({ input: 0, output: 12 });
  });
});

describe('sumCodexByConversation', () => {
  it('keys each rollout file as its own conversation (last token_count per file)', async () => {
    const root = await tmpCodex();
    await writeRollout(root, 'sessions/2026/06/23/rollout-a.jsonl', [tokenCountEvent(100, 40, 30), tokenCountEvent(500, 200, 150)]);
    await writeRollout(root, 'archived_sessions/2026/06/22/rollout-b.jsonl', [tokenCountEvent(200, 50, 20)]);
    const map = await sumCodexByConversation();
    expect(map.size).toBe(2);
    const vals = [...map.values()];
    // a: input 500-200=300 out 150 ; b: input 200-50=150 out 20
    expect(vals).toEqual(expect.arrayContaining([{ input: 300, output: 150 }, { input: 150, output: 20 }]));
  });

  it('sumCodexTokens equals the sum of the by-conversation map', async () => {
    const root = await tmpCodex();
    await writeRollout(root, 'sessions/2026/06/23/rollout-a.jsonl', [tokenCountEvent(300, 100, 80)]);
    await writeRollout(root, 'sessions/2026/06/23/rollout-b.jsonl', [tokenCountEvent(10, 0, 5)]);
    const total = await sumCodexTokens();
    const map = await sumCodexByConversation();
    let input = 0, output = 0;
    for (const t of map.values()) { input += t.input; output += t.output; }
    expect({ input, output }).toEqual(total);
  });

  it('throws when the codex dir does not exist (fail-loud)', async () => {
    process.env.TOKEN_DERBY_CODEX_DIR = path.join(os.tmpdir(), 'td-cdx-missing-' + Math.random());
    await expect(sumCodexByConversation()).rejects.toThrow();
  });
});
