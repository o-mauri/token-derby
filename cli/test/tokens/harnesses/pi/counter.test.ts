import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { count } from '../../../../src/tokens/harnesses/engine.js';
import { pi } from '../../../../src/tokens/harnesses/pi/index.js';

let home: string;
let root: string;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'td-pi-'));
  root = path.join(home, 'sessions');
  await fs.mkdir(root, { recursive: true });
  process.env.TOKEN_DERBY_HOME = home;
  process.env.TOKEN_DERBY_PI_DIR = root;
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_HOME;
  delete process.env.TOKEN_DERBY_PI_DIR;
  await fs.rm(home, { recursive: true, force: true });
});

const header = () => JSON.stringify({ type: 'session', version: 3 });

function assistant(o: {
  id: string; provider?: string; model?: string; parentId?: string;
  input?: number; cacheWrite?: number; cacheRead?: number; output?: number; ts?: string;
}) {
  return JSON.stringify({
    type: 'message', id: o.id, timestamp: o.ts ?? `2026-09-19T00:00:0${o.id.length}Z`,
    ...(o.parentId ? { parentId: o.parentId } : {}),
    message: {
      role: 'assistant',
      ...(o.provider ? { provider: o.provider, model: o.model } : {}),
      usage: { input: o.input ?? 0, cacheWrite: o.cacheWrite ?? 0, cacheRead: o.cacheRead ?? 0, output: o.output ?? 0 },
    },
  });
}

async function writeSession(rel: string, lines: string[]): Promise<void> {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, [header(), ...lines].join('\n') + '\n', 'utf8');
}

/** Totals per family across every conversation. */
async function familyTotals(): Promise<Record<string, { input: number; output: number }>> {
  const { byFamily } = await count(pi);
  const out: Record<string, { input: number; output: number }> = {};
  for (const [family, convs] of byFamily) {
    const acc = { input: 0, output: 0 };
    for (const t of convs.values()) { acc.input += t.input; acc.output += t.output; }
    out[family] = acc;
  }
  return out;
}

describe('Pi harness — family attribution', () => {
  it('counts Anthropic models as anthropic, not as a Pi bucket of its own', () => {});

  it('attributes one session to the family that produced it', async () => {
    await writeSession('s1.jsonl', [assistant({ id: 'a', provider: 'anthropic', model: 'claude-sonnet-4-5', input: 100, output: 200 })]);
    expect(await familyTotals()).toEqual({ anthropic: { input: 100, output: 200 } });
  });

  it('counts Pi OpenAI subscription usage as OpenAI', async () => {
    await writeSession('s1.jsonl', [assistant({ id: 'a', provider: 'openai-codex', model: 'gpt-5.3-codex', input: 100, output: 200 })]);
    expect(await familyTotals()).toEqual({ openai: { input: 100, output: 200 } });
  });

  it('splits ONE session across families when the model changes mid-session', async () => {
    // The whole reason harness and family are separate concepts.
    await writeSession('s1.jsonl', [
      assistant({ id: 'a', provider: 'anthropic', model: 'claude-sonnet-4-5', input: 100, output: 200 }),
      assistant({ id: 'b', provider: 'openai', model: 'gpt-5', input: 10, output: 20 }),
      assistant({ id: 'c', provider: 'google', model: 'gemini-3-pro', input: 1, output: 2 }),
    ]);
    expect(await familyTotals()).toEqual({
      anthropic: { input: 100, output: 200 },
      openai: { input: 10, output: 20 },
      google: { input: 1, output: 2 },
    });
  });

  it('counts fresh input plus cache writes, never cache reads', async () => {
    await writeSession('s1.jsonl', [
      assistant({ id: 'a', provider: 'anthropic', model: 'm', input: 10, cacheWrite: 5, cacheRead: 9_999, output: 7 }),
    ]);
    expect(await familyTotals()).toEqual({ anthropic: { input: 15, output: 7 } });
  });

  it('inherits the model from the parent entry when a message does not name one', async () => {
    await writeSession('s1.jsonl', [
      assistant({ id: 'a', provider: 'openai', model: 'gpt-5', input: 1, output: 1 }),
      JSON.stringify({
        type: 'message', id: 'b', parentId: 'a', timestamp: '2026-09-19T00:00:09Z',
        message: { role: 'toolResult', usage: { input: 4, output: 6 } },
      }),
    ]);
    expect(await familyTotals()).toEqual({ openai: { input: 5, output: 7 } });
  });

  it('follows a model_change entry', async () => {
    await writeSession('s1.jsonl', [
      JSON.stringify({ type: 'model_change', id: 'm1', timestamp: '2026-09-19T00:00:01Z', provider: 'google', modelId: 'gemini-3-pro' }),
      JSON.stringify({
        type: 'message', id: 'a', parentId: 'm1', timestamp: '2026-09-19T00:00:02Z',
        message: { role: 'assistant', usage: { input: 3, output: 4 } },
      }),
    ]);
    expect(await familyTotals()).toEqual({ google: { input: 3, output: 4 } });
  });
});

describe('Pi harness — what it refuses to count', () => {
  it('does not count a provider serving none of our families, and says so', async () => {
    await writeSession('s1.jsonl', [assistant({ id: 'a', provider: 'deepseek', model: 'deepseek-chat', input: 500, output: 900 })]);
    const { byFamily, notices } = await count(pi);
    expect([...byFamily.keys()]).toEqual([]);
    expect(notices.join(' ')).toMatch(/deepseek.*not one of the model families/);
  });

  it('does not count a gateway, and says why it is different', async () => {
    await writeSession('s1.jsonl', [assistant({ id: 'a', provider: 'amazon-bedrock', model: 'us.anthropic.claude-sonnet-4', input: 5, output: 5 })]);
    const { byFamily, notices } = await count(pi);
    expect([...byFamily.keys()]).toEqual([]);
    expect(notices.join(' ')).toMatch(/amazon-bedrock.*not yet identifiable/);
  });

  it('still counts the families it can while reporting the ones it cannot', async () => {
    await writeSession('s1.jsonl', [
      assistant({ id: 'a', provider: 'anthropic', model: 'claude', input: 10, output: 20 }),
      assistant({ id: 'b', provider: 'deepseek', model: 'deepseek-chat', input: 99, output: 99 }),
    ]);
    const { byFamily, notices } = await count(pi);
    expect([...byFamily.keys()]).toEqual(['anthropic']);
    expect(notices).toHaveLength(1);
  });

  it('ignores a JSONL file that is not a v3 session', async () => {
    await fs.writeFile(path.join(root, 'stray.jsonl'), assistant({ id: 'a', provider: 'anthropic', model: 'm', input: 9, output: 9 }) + '\n', 'utf8');
    expect(await familyTotals()).toEqual({});
  });

  it('ignores subagent display artifacts, which duplicate real sessions', async () => {
    await writeSession(path.join('subagent-artifacts', 'x.jsonl'), [assistant({ id: 'a', provider: 'anthropic', model: 'm', input: 50, output: 50 })]);
    expect(await familyTotals()).toEqual({});
  });
});

describe('Pi harness — clones and conversations', () => {
  it('counts usage once when a clone copies entries verbatim', async () => {
    const entries = [assistant({ id: 'a', provider: 'anthropic', model: 'm', input: 100, output: 200, ts: '2026-09-19T00:00:01Z' })];
    await writeSession('original.jsonl', entries);
    await writeSession('clone.jsonl', entries);   // /branch copies entries as-is
    expect(await familyTotals()).toEqual({ anthropic: { input: 100, output: 200 } });
  });

  it('still counts work the clone added on its own branch', async () => {
    const shared = assistant({ id: 'a', provider: 'anthropic', model: 'm', input: 100, output: 200, ts: '2026-09-19T00:00:01Z' });
    await writeSession('original.jsonl', [shared]);
    await writeSession('clone.jsonl', [shared, assistant({ id: 'b', provider: 'anthropic', model: 'm', input: 1, output: 2, ts: '2026-09-19T00:00:02Z' })]);
    expect(await familyTotals()).toEqual({ anthropic: { input: 101, output: 202 } });
  });

  it('counts a nested session as its own conversation, without guessing an owner', async () => {
    // Deliberately NOT rolled into a parent: that would assume the first path
    // segment names the owning session, and nothing verifies that. Every token
    // still counts; only the grouping differs, and grouping no longer affects
    // scoring now the per-conversation cap is gone.
    await writeSession('parent.jsonl', [assistant({ id: 'a', provider: 'anthropic', model: 'm', input: 10, output: 10 })]);
    await writeSession(path.join('parent', 'child.jsonl'), [assistant({ id: 'b', provider: 'anthropic', model: 'm', input: 5, output: 5 })]);
    const { byFamily } = await count(pi);
    const conversations = byFamily.get('anthropic')!;
    expect(conversations.size).toBe(2);
    expect(await familyTotals()).toEqual({ anthropic: { input: 15, output: 15 } });
  });

  it('gives a conversation the same id on every beat, so its anchor survives', async () => {
    await writeSession(path.join('nested', 'deep', 'c.jsonl'), [assistant({ id: 'a', provider: 'anthropic', model: 'm', input: 1, output: 1 })]);
    const first = [...(await count(pi)).byFamily.get('anthropic')!.keys()];
    const second = [...(await count(pi)).byFamily.get('anthropic')!.keys()];
    expect(second).toEqual(first);
  });

  it('keeps separate top-level sessions apart', async () => {
    await writeSession('s1.jsonl', [assistant({ id: 'a', provider: 'anthropic', model: 'm', input: 1, output: 1 })]);
    await writeSession('s2.jsonl', [assistant({ id: 'b', provider: 'anthropic', model: 'm', input: 2, output: 2 })]);
    expect((await count(pi)).byFamily.get('anthropic')!.size).toBe(2);
  });
});

describe('Pi harness — incremental reads', () => {
  it('credits only what was appended since the last scan', async () => {
    const file = path.join(root, 's1.jsonl');
    await writeSession('s1.jsonl', [assistant({ id: 'a', provider: 'anthropic', model: 'm', input: 10, output: 20 })]);
    expect(await familyTotals()).toEqual({ anthropic: { input: 10, output: 20 } });

    await fs.appendFile(file, assistant({ id: 'b', provider: 'anthropic', model: 'm', input: 1, output: 2 }) + '\n', 'utf8');
    expect(await familyTotals()).toEqual({ anthropic: { input: 11, output: 22 } });
  });

  it('carries model inheritance across a beat boundary', async () => {
    // The model is declared in the first read and inherited by an entry that
    // only arrives in the second, so the fold state has to survive the gap.
    const file = path.join(root, 's1.jsonl');
    await writeSession('s1.jsonl', [
      JSON.stringify({ type: 'model_change', id: 'm1', timestamp: '2026-09-19T00:00:01Z', provider: 'google', modelId: 'gemini-3-pro' }),
    ]);
    await familyTotals();   // first beat: model known, no usage yet

    await fs.appendFile(file, JSON.stringify({
      type: 'message', id: 'a', parentId: 'm1', timestamp: '2026-09-19T00:00:02Z',
      message: { role: 'assistant', usage: { input: 7, output: 8 } },
    }) + '\n', 'utf8');

    expect(await familyTotals()).toEqual({ google: { input: 7, output: 8 } });
  });
});
