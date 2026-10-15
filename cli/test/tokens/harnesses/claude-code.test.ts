import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { claudeCode, setBirthLookupForTests } from '../../../src/tokens/harnesses/claude-code/index.js';
import { totalOf, conversationsOf } from './helpers.js';
import { count } from '../../../src/tokens/harnesses/engine.js';
import { readAllSources, isStall, type AllSources } from '../../../src/tokens/race-tokens.js';
import { RaceScoreTracker, joinState } from '../../../src/tokens/race-score.js';

const FAMILY = 'anthropic';

const dirs: string[] = [];
async function tmpProjects(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'td-tx-'));
  dirs.push(d);
  process.env.TOKEN_DERBY_CLAUDE_DIR = d;
  return d;
}
beforeEach(async () => {
  // Isolate the scan cache so tests never read or prune the real ~/.token-derby.
  const h = await fs.mkdtemp(path.join(os.tmpdir(), 'td-tx-home-'));
  dirs.push(h);
  process.env.TOKEN_DERBY_HOME = h;
  // Fixtures are dated in the past but written now, which would read as a fork.
  // Tests about forks say when their files were created.
  setBirthLookupForTests(async () => undefined);
});
afterEach(async () => {
  setBirthLookupForTests(null);
  delete process.env.TOKEN_DERBY_CLAUDE_DIR;
  delete process.env.TOKEN_DERBY_HOME;
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
    const t = await totalOf(claudeCode);
    expect(t.output).toBe(150);
    expect(t.input).toBe(25);
  });

  it('throws when the projects directory is missing (not 0)', async () => {
    process.env.TOKEN_DERBY_CLAUDE_DIR = path.join(os.tmpdir(), 'td-does-not-exist-' + Math.random());
    await expect(totalOf(claudeCode)).rejects.toThrow();
  });

  it('reports a transcript file it cannot read instead of counting it', async () => {
    const root = await tmpProjects();
    const proj = path.join(root, 'proj1');
    await fs.mkdir(proj, { recursive: true });
    // A directory named like a .jsonl file makes readFile fail with EISDIR.
    await fs.mkdir(path.join(proj, 'broken.jsonl'));
    await fs.writeFile(path.join(proj, 'ok.jsonl'), line(5) + '\n');
    const result = await count(claudeCode);
    expect(result.unreadable).toHaveLength(1);
    expect((await totalOf(claudeCode)).output).toBe(5);   // the readable file still counts
  });

  it('counts subagent and dynamic-workflow agent transcripts nested under the session', async () => {
    const root = await tmpProjects();
    const session = path.join(root, 'proj', 'sess');
    // Main session transcript.
    await fs.mkdir(path.join(root, 'proj'), { recursive: true });
    await fs.writeFile(path.join(root, 'proj', 'sess.jsonl'), line(111) + '\n');
    // Plain Agent/Task subagent.
    await fs.mkdir(path.join(session, 'subagents'), { recursive: true });
    await fs.writeFile(path.join(session, 'subagents', 'agent-aplain.jsonl'), line(222) + '\n');
    // Dynamic workflow agent (one tier deeper, under subagents/workflows/wf_<id>/).
    const wf = path.join(session, 'subagents', 'workflows', 'wf_abc123');
    await fs.mkdir(wf, { recursive: true });
    await fs.writeFile(path.join(wf, 'agent-awf.jsonl'), line(444) + '\n');

    const t = await totalOf(claudeCode);
    expect(t.output).toBe(777); // 111 main + 222 subagent + 444 workflow
  });
});

describe('incremental scanning', () => {
  it('re-parses only the lines appended since the previous scan', async () => {
    const root = await tmpProjects();
    const proj = path.join(root, 'proj1');
    await fs.mkdir(proj, { recursive: true });
    const f = path.join(proj, 'a.jsonl');
    await fs.writeFile(f, line(100) + '\n');
    expect((await totalOf(claudeCode)).output).toBe(100);

    await fs.appendFile(f, line(25) + '\n');
    expect((await totalOf(claudeCode)).output).toBe(125); // 100 from cache + 25 newly parsed
  });

  it('serves an unchanged transcript from cache instead of re-reading it', async () => {
    const root = await tmpProjects();
    const proj = path.join(root, 'proj1');
    await fs.mkdir(proj, { recursive: true });
    const f = path.join(proj, 'a.jsonl');
    await fs.writeFile(f, line(100) + '\n');
    await fs.utimes(f, 1_700_000_000, 1_700_000_000);
    expect((await totalOf(claudeCode)).output).toBe(100);

    // Same size, same mtime, different tokens: only a re-read would see 999.
    await fs.writeFile(f, line(999) + '\n');
    await fs.utimes(f, 1_700_000_000, 1_700_000_000);
    expect((await totalOf(claudeCode)).output).toBe(100);
  });

  it('picks up a transcript that was rewritten shorter', async () => {
    const root = await tmpProjects();
    const proj = path.join(root, 'proj1');
    await fs.mkdir(proj, { recursive: true });
    const f = path.join(proj, 'a.jsonl');
    await fs.writeFile(f, line(100) + '\n' + line(200) + '\n');
    expect((await totalOf(claudeCode)).output).toBe(300);

    await fs.writeFile(f, line(7) + '\n');
    expect((await totalOf(claudeCode)).output).toBe(7);
  });
});

describe('sumTokensByConversation', () => {
  it('groups a session and its subagents/workflows under one <project>/<session> id', async () => {
    const root = await tmpProjects();
    const session = path.join(root, 'proj', 'sess');
    await fs.mkdir(path.join(root, 'proj'), { recursive: true });
    await fs.writeFile(path.join(root, 'proj', 'sess.jsonl'), line(111) + '\n');
    await fs.mkdir(path.join(session, 'subagents'), { recursive: true });
    await fs.writeFile(path.join(session, 'subagents', 'agent-a.jsonl'), line(222) + '\n');
    const wf = path.join(session, 'subagents', 'workflows', 'wf_1');
    await fs.mkdir(wf, { recursive: true });
    await fs.writeFile(path.join(wf, 'agent-b.jsonl'), line(444) + '\n');

    const map = await conversationsOf(claudeCode, FAMILY);
    expect(map.get('proj/sess')?.output).toBe(777); // 111 + 222 + 444 rolled up
    expect(map.size).toBe(1);
  });

  it('separates distinct sessions and projects', async () => {
    const root = await tmpProjects();
    await fs.mkdir(path.join(root, 'projA'), { recursive: true });
    await fs.mkdir(path.join(root, 'projB'), { recursive: true });
    await fs.writeFile(path.join(root, 'projA', 's1.jsonl'), line(10) + '\n');
    await fs.writeFile(path.join(root, 'projA', 's2.jsonl'), line(20) + '\n');
    await fs.writeFile(path.join(root, 'projB', 's1.jsonl'), line(30) + '\n');

    const map = await conversationsOf(claudeCode, FAMILY);
    expect(map.get('projA/s1')?.output).toBe(10);
    expect(map.get('projA/s2')?.output).toBe(20);
    expect(map.get('projB/s1')?.output).toBe(30);
    expect(map.size).toBe(3);
  });

  it('sumTokens equals the sum of the by-conversation map', async () => {
    const root = await tmpProjects();
    await fs.mkdir(path.join(root, 'projA'), { recursive: true });
    await fs.writeFile(path.join(root, 'projA', 's1.jsonl'), line(100, 5, 20) + '\n' + line(50) + '\n');
    const total = await totalOf(claudeCode);
    const map = await conversationsOf(claudeCode, FAMILY);
    let input = 0, output = 0;
    for (const t of map.values()) { input += t.input; output += t.output; }
    expect({ input, output }).toEqual(total);
  });

  it('throws when the projects directory is missing (fail-loud)', async () => {
    process.env.TOKEN_DERBY_CLAUDE_DIR = path.join(os.tmpdir(), 'td-tx-missing-' + Math.random());
    await expect(conversationsOf(claudeCode, FAMILY)).rejects.toThrow();
  });
});

describe('sumTokens — resilience of the directory walk', () => {
  it('counts transcripts despite a broken symlink beside them', async () => {
    // A dangling link — a removed worktree, a moved repo, a cleaned temp dir —
    // used to abort the whole walk, and the empty result read as "0 tokens".
    const root = await tmpProjects();
    const proj = path.join(root, 'proj1');
    await fs.mkdir(proj, { recursive: true });
    await fs.writeFile(path.join(proj, 'a.jsonl'), line(5000, 100) + '\n');
    await fs.symlink(path.join(os.tmpdir(), 'td-gone-' + Math.random()), path.join(proj, 'node_modules'));
    const t = await totalOf(claudeCode);
    expect(t.output).toBe(5000);
  });

  it('still descends through a symlink that points at a real directory', async () => {
    const root = await tmpProjects();
    const proj = path.join(root, 'proj1');
    const real = path.join(root, 'proj1', 'real-nested');
    await fs.mkdir(real, { recursive: true });
    await fs.writeFile(path.join(real, 'deep.jsonl'), line(700) + '\n');
    await fs.symlink(real, path.join(proj, 'linked'));
    const t = await totalOf(claudeCode);
    expect(t.output).toBe(1400); // once through the real dir, once through the link
  });

  it('skips a project entry that vanishes mid-scan rather than abandoning the scan', async () => {
    const root = await tmpProjects();
    const good = path.join(root, 'proj-good');
    await fs.mkdir(good, { recursive: true });
    await fs.writeFile(path.join(good, 'a.jsonl'), line(250) + '\n');
    await fs.symlink(path.join(os.tmpdir(), 'td-gone-' + Math.random()), path.join(root, 'proj-dangling'));
    const t = await totalOf(claudeCode);
    expect(t.output).toBe(250);
  });

  it('still throws when the projects root itself is missing', async () => {
    process.env.TOKEN_DERBY_CLAUDE_DIR = path.join(os.tmpdir(), 'td-tx-none-' + Math.random());
    await expect(totalOf(claudeCode)).rejects.toThrow();
  });
});

describe('forked and resumed sessions', () => {
  // A dated response the way Claude Code writes it: one line per content block,
  // each repeating the request's usage.
  function resp(id: string, ts: string, output: number, input = 0): string {
    return JSON.stringify({ requestId: id, timestamp: ts, message: { usage: { output_tokens: output, input_tokens: input } } });
  }

  it('counts a request copied into a fork once, not once per file', async () => {
    const root = await tmpProjects();
    const proj = path.join(root, 'proj');
    await fs.mkdir(proj, { recursive: true });
    const history = [resp('r1', '2026-10-01T15:00:01Z', 100), resp('r2', '2026-10-01T15:01:00Z', 50)];
    await fs.writeFile(path.join(proj, 'parent.jsonl'), history.join('\n') + '\n');
    // The fork copies the history verbatim, then adds its own turn.
    await fs.writeFile(path.join(proj, 'fork.jsonl'), [...history, resp('r3', '2026-10-01T15:02:00Z', 7)].join('\n') + '\n');

    expect((await totalOf(claudeCode)).output).toBe(157);
  });

  it('dedupes a non-contiguous repeat of the same request within a file', async () => {
    const root = await tmpProjects();
    const proj = path.join(root, 'proj');
    await fs.mkdir(proj, { recursive: true });
    const ts = '2026-10-01T15:00:00Z';
    await fs.writeFile(path.join(proj, 'a.jsonl'), [resp('r1', ts, 100), resp('r2', ts, 5), resp('r1', ts, 100)].join('\n') + '\n');
    expect((await totalOf(claudeCode)).output).toBe(105);
  });

  it("groups dated responses by hour, so deleting a fork's donor never moves a request to a new conversation", async () => {
    const root = await tmpProjects();
    const proj = path.join(root, 'proj');
    await fs.mkdir(proj, { recursive: true });
    const history = [resp('r1', '2026-10-01T14:59:00Z', 100), resp('r2', '2026-10-01T15:01:00Z', 50)];
    await fs.writeFile(path.join(proj, 'a-donor.jsonl'), history.join('\n') + '\n');
    await fs.writeFile(path.join(proj, 'b-fork.jsonl'), history.join('\n') + '\n');

    const before = await conversationsOf(claudeCode, FAMILY);
    expect([...before.keys()].sort()).toEqual(['@2026-10-01T14', '@2026-10-01T15']);

    await fs.rm(path.join(proj, 'a-donor.jsonl'));
    const after = await conversationsOf(claudeCode, FAMILY);
    expect(after).toEqual(before);
  });

  it('keeps the largest usage when a later block of the same response reports more', async () => {
    const root = await tmpProjects();
    const proj = path.join(root, 'proj');
    await fs.mkdir(proj, { recursive: true });
    const ts = '2026-10-01T15:00:00Z';
    // Streaming: the first block is written before the response's output is final.
    await fs.writeFile(path.join(proj, 'a.jsonl'), [resp('r1', ts, 1, 40), resp('r1', ts, 1, 40), resp('r1', ts, 300, 40)].join('\n') + '\n');
    expect(await totalOf(claudeCode)).toEqual({ input: 40, output: 300 });
  });

  it('keeps the largest usage when a response straddles two scans', async () => {
    const root = await tmpProjects();
    const proj = path.join(root, 'proj');
    await fs.mkdir(proj, { recursive: true });
    const file = path.join(proj, 'a.jsonl');
    const ts = '2026-10-01T15:00:00Z';
    await fs.writeFile(file, resp('r1', ts, 1) + '\n');
    expect((await totalOf(claudeCode)).output).toBe(1);
    await fs.appendFile(file, resp('r1', ts, 300) + '\n');
    expect((await totalOf(claudeCode)).output).toBe(300);
  });

  it('keeps the largest usage across a fork copied mid-stream and its finished original', async () => {
    const root = await tmpProjects();
    const proj = path.join(root, 'proj');
    await fs.mkdir(proj, { recursive: true });
    const ts = '2026-10-01T15:00:00Z';
    await fs.writeFile(path.join(proj, 'a-fork.jsonl'), resp('r1', ts, 1) + '\n');
    await fs.writeFile(path.join(proj, 'b-original.jsonl'), [resp('r1', ts, 1), resp('r1', ts, 300)].join('\n') + '\n');
    expect((await totalOf(claudeCode)).output).toBe(300);
  });

  it('skips a transcript deleted between discovery and read instead of stalling', async () => {
    const root = await tmpProjects();
    const proj = path.join(root, 'proj');
    await fs.mkdir(proj, { recursive: true });
    await fs.writeFile(path.join(proj, 'kept.jsonl'), resp('r1', '2026-10-01T15:00:00Z', 10) + '\n');
    const gone = path.join(proj, 'gone.jsonl');
    await fs.writeFile(gone, resp('r2', '2026-10-01T15:00:00Z', 20) + '\n');

    const discover = claudeCode.discover;
    (claudeCode as any).discover = async (r: string) => {
      const files = await discover.call(claudeCode, r);
      await fs.rm(gone);
      return files;
    };
    try {
      expect((await totalOf(claudeCode)).output).toBe(10);
    } finally {
      (claudeCode as any).discover = discover;
    }
  });
});

describe("a fork's copied history", () => {
  const FORKED_AT = Date.parse('2026-10-01T16:00:00Z');

  function resp(id: string, ts: string, output: number): string {
    return JSON.stringify({ requestId: id, timestamp: ts, message: { usage: { output_tokens: output } } });
  }
  const createdAt = (births: Record<string, number>) =>
    setBirthLookupForTests(async (file) => births[path.basename(file)]);

  async function projectDir(): Promise<string> {
    const proj = path.join(await tmpProjects(), 'proj');
    await fs.mkdir(proj, { recursive: true });
    return proj;
  }

  it('is not credited to the fork when the original is gone', async () => {
    const proj = await projectDir();
    createdAt({ 'fork.jsonl': FORKED_AT });
    await fs.writeFile(path.join(proj, 'fork.jsonl'), [
      resp('r1', '2026-10-01T15:00:00Z', 100),
      resp('r2', '2026-10-01T15:30:00Z', 50),
      resp('r3', '2026-10-01T16:00:05Z', 7),
    ].join('\n') + '\n');

    expect((await totalOf(claudeCode)).output).toBe(7);
  });

  it('is credited once, to the original, while the original is still on disk', async () => {
    const proj = await projectDir();
    createdAt({ 'donor.jsonl': Date.parse('2026-10-01T14:00:00Z'), 'fork.jsonl': FORKED_AT });
    const history = [resp('r1', '2026-10-01T15:00:00Z', 100), resp('r2', '2026-10-01T15:30:00Z', 50)];
    await fs.writeFile(path.join(proj, 'donor.jsonl'), history.join('\n') + '\n');
    await fs.writeFile(path.join(proj, 'fork.jsonl'), [...history, resp('r3', '2026-10-01T16:00:05Z', 7)].join('\n') + '\n');

    expect((await totalOf(claudeCode)).output).toBe(157);
  });

  it("still counts a session's own opening lines, stamped a beat before its file was created", async () => {
    const proj = await projectDir();
    createdAt({ 'a.jsonl': FORKED_AT });
    await fs.writeFile(path.join(proj, 'a.jsonl'), resp('r1', '2026-10-01T15:59:56Z', 40) + '\n');

    expect((await totalOf(claudeCode)).output).toBe(40);
  });

  it('counts everything when the platform cannot say when the file was created', async () => {
    const proj = await projectDir();
    createdAt({});
    await fs.writeFile(path.join(proj, 'fork.jsonl'), resp('r1', '2026-10-01T09:00:00Z', 100) + '\n');

    expect((await totalOf(claudeCode)).output).toBe(100);
  });

  it('never skips a line that carries no timestamp', async () => {
    const proj = await projectDir();
    createdAt({ 'a.jsonl': FORKED_AT });
    await fs.writeFile(path.join(proj, 'a.jsonl'), line(25) + '\n');

    expect((await totalOf(claudeCode)).output).toBe(25);
  });
});

// Through the race tracker, the way a live race scores: join on one reading,
// then credit only what later readings add.
describe('race crediting', () => {
  const NOW = '2026-10-01T15';
  function resp(id: string, output: number, hour = NOW): string {
    return JSON.stringify({ requestId: id, timestamp: `${hour}:00:00Z`, message: { usage: { output_tokens: output } } });
  }

  beforeEach(() => {
    // Only Claude Code: the other harnesses point at roots that don't exist.
    for (const v of ['TOKEN_DERBY_CODEX_DIR', 'TOKEN_DERBY_GEMINI_DIR', 'TOKEN_DERBY_PI_DIR']) {
      process.env[v] = path.join(os.tmpdir(), `td-none-${Math.random()}`);
    }
  });
  afterEach(() => {
    for (const v of ['TOKEN_DERBY_CODEX_DIR', 'TOKEN_DERBY_GEMINI_DIR', 'TOKEN_DERBY_PI_DIR']) delete process.env[v];
  });

  async function reading(): Promise<AllSources> {
    const r = await readAllSources();
    if (isStall(r)) throw new Error(`stalled: ${r.stall}`);
    return r;
  }

  it("still credits one session's work after another session's only copy in the same hour is deleted", async () => {
    const root = await tmpProjects();
    const proj = path.join(root, 'proj');
    await fs.mkdir(proj, { recursive: true });
    const a = path.join(proj, 'a.jsonl');
    const b = path.join(proj, 'b.jsonl');
    await fs.writeFile(a, resp('a1', 1000) + '\n');
    await fs.writeFile(b, resp('b1', 100) + '\n');
    const tracker = new RaceScoreTracker(joinState(await reading(), 0));

    await fs.rm(a);
    await fs.appendFile(b, resp('b2', 50) + '\n');
    tracker.recordReading(await reading());
    expect(tracker.nextBeat().components.anthropic).toBe(50);
  });

  it('anchors a transcript that was unreadable at join instead of crediting its history', async () => {
    const root = await tmpProjects();
    const proj = path.join(root, 'proj');
    await fs.mkdir(proj, { recursive: true });
    await fs.writeFile(path.join(proj, 'ok.jsonl'), resp('o1', 10, '2026-09-30T09') + '\n');
    // A directory named like a transcript fails to read (EISDIR) but is discovered.
    const broken = path.join(proj, 'broken.jsonl');
    await fs.mkdir(broken);
    const join = await reading();
    expect(join.unreadable).toEqual(['claude-code:proj/broken']);
    const tracker = new RaceScoreTracker(joinState(join, 0));

    // It reads again, holding 2M tokens of history from hours no other file has,
    // plus a line with no request id that can't be matched to anything.
    await fs.rmdir(broken);
    const idless = JSON.stringify({ timestamp: '2026-09-30T09:30:00Z', message: { usage: { output_tokens: 7_000 } } });
    await fs.writeFile(broken, [resp('h1', 1_500_000, '2026-09-30T08'), resp('h2', 500_000, '2026-09-30T09'), idless].join('\n') + '\n');
    tracker.recordReading(await reading());
    expect(tracker.nextBeat().components.anthropic).toBe(0);
    // ...and stays anchored on later scans, rather than moving into hour buckets.
    tracker.recordReading(await reading());
    expect(tracker.nextBeat().components.anthropic).toBe(0);

    // New work in that session after it recovered is credited as usual.
    await fs.appendFile(broken, resp('h3', 25) + '\n');
    tracker.recordReading(await reading());
    expect(tracker.nextBeat().components.anthropic).toBe(25);
  });

  it('credits work written while a transcript that read cleanly before was briefly unreadable', async () => {
    const root = await tmpProjects();
    const proj = path.join(root, 'proj');
    await fs.mkdir(proj, { recursive: true });
    const file = path.join(proj, 'a.jsonl');
    await fs.writeFile(file, resp('a1', 100) + '\n');
    const tracker = new RaceScoreTracker(joinState(await reading(), 0));

    await fs.rm(file);
    await fs.mkdir(file);
    const failed = await reading();
    expect(failed.unreadable).toEqual(['claude-code:proj/a']);
    tracker.recordReading(failed);

    await fs.rmdir(file);
    await fs.writeFile(file, [resp('a1', 100), resp('a2', 40)].join('\n') + '\n');
    tracker.recordReading(await reading());
    expect(tracker.nextBeat().components.anthropic).toBe(40);
  });

  it("credits a fork started mid-race only for its own work when the original was pruned", async () => {
    const root = await tmpProjects();
    const proj = path.join(root, 'proj');
    await fs.mkdir(proj, { recursive: true });
    await fs.writeFile(path.join(proj, 'a.jsonl'), resp('a1', 1000) + '\n');
    const tracker = new RaceScoreTracker(joinState(await reading(), 0));

    // Copied hours the tracker has never seen would credit from zero, were they counted.
    const forkedAt = Date.parse('2026-10-01T16:00:00Z');
    setBirthLookupForTests(async (file) => (path.basename(file) === 'fork.jsonl' ? forkedAt : undefined));
    await fs.writeFile(path.join(proj, 'fork.jsonl'), [
      resp('x1', 5000, '2026-10-01T09'),
      resp('x2', 3000, '2026-10-01T10'),
      resp('x3', 70, '2026-10-01T16'),
    ].join('\n') + '\n');
    tracker.recordReading(await reading());

    expect(tracker.nextBeat().components.anthropic).toBe(70);
  });
});
