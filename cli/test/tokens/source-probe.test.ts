import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describeNoSources, probeAll, harnessDir, type HarnessProbe } from '../../src/tokens/source-probe.js';
import { HARNESSES } from '../../src/tokens/harnesses/registry.js';

let home: string;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'td-probe-'));
  process.env.TOKEN_DERBY_HOME = home;
  process.env.TOKEN_DERBY_CLAUDE_DIR = path.join(home, 'claude');
  process.env.TOKEN_DERBY_CODEX_DIR = path.join(home, 'codex');
  process.env.TOKEN_DERBY_GEMINI_DIR = path.join(home, 'gemini');
});

afterEach(async () => {
  for (const v of ['TOKEN_DERBY_HOME', 'TOKEN_DERBY_CLAUDE_DIR', 'TOKEN_DERBY_CODEX_DIR', 'TOKEN_DERBY_GEMINI_DIR']) {
    delete process.env[v];
  }
  await fs.rm(home, { recursive: true, force: true });
});

const probeFor = (key: keyof typeof HARNESSES, over: Partial<HarnessProbe> = {}): HarnessProbe => ({
  harness: HARNESSES[key], dir: `/${key}`, exists: false, projects: 0, transcripts: 0, ...over,
});

describe('probeAll', () => {
  it('probes every harness and honours its declared override', async () => {
    const probes = await probeAll();
    expect(probes.map(p => p.harness.id)).toEqual(['claude-code', 'codex-cli', 'gemini-cli']);
    expect(probes.every(p => p.exists === false)).toBe(true);
  });

  it('finds transcripts once a harness has some', async () => {
    const dir = path.join(home, 'claude', 'proj');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 's1.jsonl'), '{}\n');
    const probes = await probeAll();
    expect(probes.find(p => p.harness.id === 'claude-code')!.transcripts).toBe(1);
  });
});

describe('harnessDir', () => {
  it('reports the directory a harness reads from', () => {
    expect(harnessDir('claude-code')).toBe(path.join(home, 'claude'));
  });
});

describe('describeNoSources', () => {
  it('names every harness and the directory it searched', () => {
    const text = describeNoSources([probeFor('claude-code'), probeFor('codex-cli'), probeFor('gemini-cli')]);
    expect(text).toContain('Claude Code: /claude-code');
    expect(text).toContain('Codex CLI: /codex-cli');
    expect(text).toContain('Gemini CLI: /gemini-cli');
  });

  it('distinguishes an absent root from an empty one', () => {
    expect(describeNoSources([probeFor('claude-code')])).toContain('does not exist');
    expect(describeNoSources([probeFor('claude-code', { exists: true })]))
      .toContain('exists, but holds no transcripts');
  });

  it('offers the dangling-symlink hunt when a root has history it cannot read', () => {
    const text = describeNoSources([probeFor('claude-code', { exists: true, projects: 3 })]);
    expect(text).toContain('3 project directories, none of which could be read');
    expect(text).toContain('find /claude-code -type l');
  });

  it('shows a harness-specific hint only for the harness that declares it', () => {
    const claude = describeNoSources([probeFor('claude-code')]);
    const codex = describeNoSources([probeFor('codex-cli')]);
    expect(claude).toContain('CLAUDE_CONFIG_DIR');
    expect(codex).not.toContain('CLAUDE_CONFIG_DIR');
  });

  it('lists the override each harness actually honours', () => {
    const text = describeNoSources([probeFor('claude-code')]);
    expect(text).toContain('TOKEN_DERBY_CLAUDE_DIR');
    expect(text).toContain('TOKEN_DERBY_CODEX_DIR');
    expect(text).toContain('TOKEN_DERBY_GEMINI_DIR');
  });
});
