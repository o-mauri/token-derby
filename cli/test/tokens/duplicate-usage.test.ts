import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { sumTokens } from '../../src/tokens/transcripts.js';

const dirs: string[] = [];
async function tmpProjects(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'td-dup-'));
  dirs.push(d);
  process.env.TOKEN_DERBY_CLAUDE_DIR = d;
  return d;
}
beforeEach(async () => {
  const h = await fs.mkdtemp(path.join(os.tmpdir(), 'td-dup-home-'));
  dirs.push(h);
  process.env.TOKEN_DERBY_HOME = h;
});
afterEach(async () => {
  delete process.env.TOKEN_DERBY_CLAUDE_DIR;
  delete process.env.TOKEN_DERBY_HOME;
  for (const d of dirs.splice(0)) await fs.rm(d, { recursive: true, force: true });
});

// One API response, written by Claude Code as three transcript lines — one per
// content block. `usage` is per-REQUEST, so every line repeats it verbatim.
// Shape copied from a real transcript (req_011CdNdXSzj1).
const USAGE = { input_tokens: 10, cache_creation_input_tokens: 858_455, cache_read_input_tokens: 9_250, output_tokens: 2_029 };
const line = (uuid: string, type: string) => JSON.stringify({
  type: 'assistant', uuid, requestId: 'req_011CdNdXSzj1',
  timestamp: '2026-07-25T10:38:32.671Z',
  message: { id: 'msg_01ABC', model: 'claude-opus-5', content: [{ type }], usage: USAGE },
}) + '\n';

describe('duplicate per-request usage across content blocks', () => {
  it('counts one API response once, not once per content block', async () => {
    const root = await tmpProjects();
    await fs.mkdir(path.join(root, 'proj'), { recursive: true });
    await fs.writeFile(path.join(root, 'proj', 'sess.jsonl'),
      line('aa0994fc', 'thinking') + line('0cb10f01', 'text') + line('ede3ba11', 'tool_use'));

    const totals = await sumTokens();
    const oneResponse = { input: USAGE.input_tokens + USAGE.cache_creation_input_tokens, output: USAGE.output_tokens };

    console.log(`\n  one API response is worth : in=${oneResponse.input.toLocaleString()} out=${oneResponse.output.toLocaleString()}`);
    console.log(`  shipped sumTokens() returns: in=${totals.input.toLocaleString()} out=${totals.output.toLocaleString()}`);
    console.log(`  inflation: ${(totals.output / oneResponse.output).toFixed(2)}x\n`);

    expect(totals).toEqual(oneResponse);
  });

  it('still counts a response once when its blocks straddle two beats', async () => {
    const root = await tmpProjects();
    await fs.mkdir(path.join(root, 'proj'), { recursive: true });
    const file = path.join(root, 'proj', 'sess.jsonl');

    // Beat 1 sees only the thinking block...
    await fs.writeFile(file, line('aa0994fc', 'thinking'));
    const first = await sumTokens();

    // ...beat 2 sees the rest of the SAME response appended. The scan cache
    // resumes from the committed value, so the dedupe key must have survived.
    await fs.appendFile(file, line('0cb10f01', 'text') + line('ede3ba11', 'tool_use'));
    const second = await sumTokens();

    const oneResponse = { input: USAGE.input_tokens + USAGE.cache_creation_input_tokens, output: USAGE.output_tokens };
    expect(first).toEqual(oneResponse);
    expect(second).toEqual(oneResponse);
  });

  it('counts genuinely distinct responses separately', async () => {
    const root = await tmpProjects();
    await fs.mkdir(path.join(root, 'proj'), { recursive: true });
    const other = JSON.stringify({
      type: 'assistant', uuid: 'ffffffff', requestId: 'req_DIFFERENT',
      message: { id: 'msg_02XYZ', content: [{ type: 'text' }], usage: USAGE },
    }) + '\n';
    await fs.writeFile(path.join(root, 'proj', 'sess.jsonl'),
      line('aa0994fc', 'thinking') + line('0cb10f01', 'text') + other);

    const totals = await sumTokens();
    expect(totals.output).toBe(USAGE.output_tokens * 2);
  });

  it('counts lines with no id at all, rather than collapsing them', async () => {
    const root = await tmpProjects();
    await fs.mkdir(path.join(root, 'proj'), { recursive: true });
    const bare = JSON.stringify({ type: 'assistant', message: { usage: USAGE } }) + '\n';
    await fs.writeFile(path.join(root, 'proj', 'sess.jsonl'), bare + bare + bare);

    const totals = await sumTokens();
    expect(totals.output).toBe(USAGE.output_tokens * 3);
  });
});
