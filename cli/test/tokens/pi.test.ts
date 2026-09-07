import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { piModelKey } from '@token-derby/shared';
import { listPiModelKeys, sumPiByModelAndConversation, sumPiTokensByModel } from '../../src/tokens/pi.js';

const dirs: string[] = [];
let nextId = 0;

async function tmpPi(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'td-pi-'));
  dirs.push(dir);
  process.env.TOKEN_DERBY_PI_DIR = dir;
  return dir;
}

beforeEach(async () => {
  nextId = 0;
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'td-pi-home-'));
  dirs.push(home);
  process.env.TOKEN_DERBY_HOME = home;
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_PI_DIR;
  delete process.env.TOKEN_DERBY_HOME;
  for (const dir of dirs.splice(0)) await fs.rm(dir, { recursive: true, force: true });
});

function id(): string {
  nextId += 1;
  return nextId.toString(16).padStart(8, '0');
}

function header(sessionId = 'session-1'): object {
  return { type: 'session', version: 3, id: sessionId, timestamp: '2026-09-07T00:00:00.000Z', cwd: '/tmp/project' };
}

function modelChange(provider: string, model: string): object {
  return {
    type: 'model_change', id: id(), parentId: null,
    timestamp: `2026-09-07T00:00:${String(nextId).padStart(2, '0')}.000Z`,
    provider, modelId: model,
  };
}

function assistant(provider: string, model: string, usage: object, identity?: { id: string; timestamp: string }): object {
  return {
    type: 'message', id: identity?.id ?? id(), parentId: null,
    timestamp: identity?.timestamp ?? `2026-09-07T00:01:${String(nextId).padStart(2, '0')}.000Z`,
    message: { role: 'assistant', provider, model, usage, content: [], stopReason: 'stop', timestamp: 0 },
  };
}

function summary(type: 'compaction' | 'branch_summary', usage: object): object {
  return {
    type, id: id(), parentId: null,
    timestamp: `2026-09-07T00:02:${String(nextId).padStart(2, '0')}.000Z`,
    usage,
  };
}

function toolUsage(usage: object): object {
  return {
    type: 'message', id: id(), parentId: null,
    timestamp: `2026-09-07T00:03:${String(nextId).padStart(2, '0')}.000Z`,
    message: { role: 'toolResult', toolCallId: 'x', toolName: 'nested-llm', content: [], usage, isError: false },
  };
}

async function writeJsonl(root: string, rel: string, entries: object[]): Promise<string> {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  let previous: string | null = null;
  const linked = entries.map((value) => {
    const entry = { ...value } as any;
    if (entry.type === 'session') {
      previous = null;
    } else {
      if (entry.parentId === null && previous !== null) entry.parentId = previous;
      if (typeof entry.id === 'string') previous = entry.id;
    }
    return entry;
  });
  await fs.writeFile(file, linked.map(entry => JSON.stringify(entry)).join('\n') + '\n');
  return file;
}

describe('Pi token scanning', () => {
  it('treats a missing optional Pi session root as empty history', async () => {
    process.env.TOKEN_DERBY_PI_DIR = path.join(os.tmpdir(), `td-pi-missing-${Math.random()}`);
    await expect(sumPiByModelAndConversation()).resolves.toEqual(new Map());
  });

  it('buckets usage by exact provider/model and matches Pi footer usage sources', async () => {
    const root = await tmpPi();
    await writeJsonl(root, 'scope/session-a.jsonl', [
      header(),
      modelChange('qwen', 'qwen3-coder'),
      assistant('qwen', 'qwen3-coder', { input: 10, output: 20, cacheRead: 100, cacheWrite: 5 }),
      summary('compaction', { input: 3, output: 4, cacheRead: 50, cacheWrite: 2 }),
      modelChange('openai-codex', 'gpt-5.3-codex'),
      assistant('openai-codex', 'gpt-5.3-codex', { input: 7, output: 8, cacheRead: 60, cacheWrite: 0 }),
      toolUsage({ input: 1, output: 2, cacheRead: 30, cacheWrite: 0 }),
    ]);

    const byModel = await sumPiByModelAndConversation();
    const qwen = piModelKey('qwen', 'qwen3-coder')!;
    const openai = piModelKey('openai-codex', 'gpt-5.3-codex')!;
    expect([...(byModel.get(qwen)?.values() ?? [])]).toEqual([{ input: 20, output: 24 }]);
    expect([...(byModel.get(openai)?.values() ?? [])]).toEqual([{ input: 8, output: 10 }]);
    expect(await listPiModelKeys()).toEqual([openai, qwen].sort());
  });

  it('attributes a branch summary to the abandoned branch model identified by fromId', async () => {
    const root = await tmpPi();
    const qwenChange = modelChange('qwen', 'qwen3-coder') as any;
    const qwenReply = assistant('qwen', 'qwen3-coder', { input: 1, output: 10 }) as any;
    qwenReply.parentId = qwenChange.id;
    const openaiChange = modelChange('openai-codex', 'gpt-5.3-codex') as any;
    openaiChange.parentId = qwenReply.id;
    const openaiReply = assistant('openai-codex', 'gpt-5.3-codex', { input: 2, output: 20 }) as any;
    openaiReply.parentId = openaiChange.id;
    const branchedSummary = summary('branch_summary', { input: 3, output: 30 }) as any;
    branchedSummary.parentId = qwenReply.id; // new context continues from the Qwen branch
    branchedSummary.fromId = openaiReply.id; // summary was generated while leaving OpenAI
    await writeJsonl(root, 'scope/tree.jsonl', [
      header(), qwenChange, qwenReply, openaiChange, openaiReply, branchedSummary,
    ]);

    const totals = await sumPiTokensByModel();
    expect(totals.get(piModelKey('qwen', 'qwen3-coder')!)).toEqual({ input: 1, output: 10 });
    expect(totals.get(piModelKey('openai-codex', 'gpt-5.3-codex')!)).toEqual({ input: 5, output: 50 });
  });

  it('keeps clone ownership stable when an earlier clone appears and its donor is deleted', async () => {
    const root = await tmpPi();
    const copied = assistant('qwen', 'qwen3-coder', { input: 10, output: 100 });
    const donor = await writeJsonl(root, 'scope/z-donor.jsonl', [header(), copied]);
    const key = piModelKey('qwen', 'qwen3-coder')!;

    const first = (await sumPiByModelAndConversation()).get(key)!;
    const [conversation] = [...first.keys()];
    expect([...first.values()]).toEqual([{ input: 10, output: 100 }]);

    await writeJsonl(root, 'scope/a-clone.jsonl', [
      header(), copied, assistant('qwen', 'qwen3-coder', { input: 2, output: 20 }),
    ]);
    const withClone = (await sumPiByModelAndConversation()).get(key)!;
    expect([...withClone.keys()]).toEqual([conversation]);
    expect([...withClone.values()]).toEqual([{ input: 12, output: 120 }]);

    await fs.rm(donor);
    const withoutDonor = (await sumPiByModelAndConversation()).get(key)!;
    expect([...withoutDonor.keys()]).toEqual([conversation]);
    expect([...withoutDonor.values()]).toEqual([{ input: 12, output: 120 }]);
  });

  it('rolls nested child/fork sessions into the owner and deduplicates copied entries', async () => {
    const root = await tmpPi();
    const copiedIdentity = { id: 'deadbeef', timestamp: '2026-09-07T01:00:00.000Z' };
    const copied = assistant('qwen', 'qwen3-coder', { input: 10, output: 100 }, copiedIdentity);
    await writeJsonl(root, 'scope/parent.jsonl', [header('parent'), copied]);
    await writeJsonl(root, 'scope/parent/run-1/run-0/session.jsonl', [
      header('child'),
      assistant('qwen', 'qwen3-coder', { input: 2, output: 20 }),
    ]);
    await writeJsonl(root, 'scope/parent/forks/fork.jsonl', [
      header('fork'),
      copied,
      assistant('qwen', 'qwen3-coder', { input: 3, output: 30 }),
    ]);
    await writeJsonl(root, 'scope/subagent-artifacts/rendered.jsonl', [
      assistant('qwen', 'qwen3-coder', { input: 999, output: 999 }),
    ]);

    const qwen = piModelKey('qwen', 'qwen3-coder')!;
    const conversations = (await sumPiByModelAndConversation()).get(qwen)!;
    expect([...conversations.values()]).toEqual([{ input: 15, output: 150 }]);
  });

  it('does not deduplicate unrelated entries that merely share an id', async () => {
    const root = await tmpPi();
    await writeJsonl(root, 'scope/a.jsonl', [
      header('a'),
      assistant('qwen', 'qwen3-coder', { input: 1, output: 10 }, { id: 'same-id', timestamp: '2026-09-07T01:00:00.000Z' }),
    ]);
    await writeJsonl(root, 'scope/b.jsonl', [
      header('b'),
      assistant('qwen', 'qwen3-coder', { input: 2, output: 20 }, { id: 'same-id', timestamp: '2026-09-07T01:00:01.000Z' }),
    ]);
    const totals = await sumPiTokensByModel();
    expect(totals.get(piModelKey('qwen', 'qwen3-coder')!)).toEqual({ input: 3, output: 30 });
  });

  it('ignores unrelated JSONL and unsupported Pi session versions', async () => {
    const root = await tmpPi();
    await writeJsonl(root, 'scope/not-a-session.jsonl', [
      assistant('qwen', 'qwen3-coder', { input: 999, output: 999 }),
    ]);
    await writeJsonl(root, 'scope/future-version.jsonl', [
      { ...header(), version: 4 },
      assistant('qwen', 'qwen3-coder', { input: 999, output: 999 }),
    ]);
    expect(await sumPiTokensByModel()).toEqual(new Map());
  });

  it('does not expose zero-usage aborted models as selectable buckets', async () => {
    const root = await tmpPi();
    await writeJsonl(root, 'scope/aborted.jsonl', [
      header(),
      assistant('anthropic', 'claude-aborted', { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }),
    ]);
    expect(await listPiModelKeys()).toEqual([]);
  });

  it('incrementally adds newly appended Pi usage without recounting cached entries', async () => {
    const root = await tmpPi();
    const firstReply = assistant('qwen', 'qwen3-coder', { input: 1, output: 10 }) as any;
    const file = await writeJsonl(root, 'scope/session-a.jsonl', [header(), firstReply]);
    const qwen = piModelKey('qwen', 'qwen3-coder')!;
    expect((await sumPiTokensByModel()).get(qwen)).toEqual({ input: 1, output: 10 });

    const compaction = summary('compaction', { input: 2, output: 20 }) as any;
    compaction.parentId = firstReply.id; // must resolve through modelByEntry loaded from the cache
    await fs.appendFile(file, JSON.stringify(compaction) + '\n');
    expect((await sumPiTokensByModel()).get(qwen)).toEqual({ input: 3, output: 30 });
  });
});
