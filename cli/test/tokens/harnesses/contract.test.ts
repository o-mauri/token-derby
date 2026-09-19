// One set of assertions, run against every harness. These are the promises the
// race relies on regardless of which coding agent produced the tokens; a new
// harness that breaks one of them fails here rather than in a live race.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { MODEL_FAMILIES } from '@token-derby/shared';
import { count, probe } from '../../../src/tokens/harnesses/engine.js';
import { HARNESSES, HARNESS_KEYS } from '../../../src/tokens/harnesses/registry.js';
import type { HarnessKey } from '../../../src/tokens/harnesses/harness.js';
import { SourceRootMissing } from '../../../src/tokens/source-root.js';

let home: string;

/** The env override each harness honours for its root. */
function overrideVar(key: HarnessKey): string {
  return HARNESSES[key].overrideVar;
}

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'td-contract-'));
  process.env.TOKEN_DERBY_HOME = home;
  for (const key of HARNESS_KEYS) process.env[overrideVar(key)] = path.join(home, key);
});

afterEach(async () => {
  for (const key of HARNESS_KEYS) delete process.env[overrideVar(key)];
  delete process.env.TOKEN_DERBY_HOME;
  await fs.rm(home, { recursive: true, force: true });
});

async function makeRoot(key: HarnessKey): Promise<string> {
  const root = path.join(home, key);
  await fs.mkdir(root, { recursive: true });
  return root;
}

/** A file this harness will discover, holding `raw`. */
async function writeCountable(key: HarnessKey, root: string, raw: string): Promise<string> {
  const file = {
    'claude-code': path.join(root, 'proj', 'session-1.jsonl'),
    'codex-cli': path.join(root, 'sessions', '2026', '09', 'rollout-a.jsonl'),
    'gemini-cli': path.join(root, 'projhash', 'chats', 'session-a.json'),
  }[key];
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, raw, 'utf8');
  return file;
}

describe.each(HARNESS_KEYS)('Harness contract — %s', (key) => {
  const harness = HARNESSES[key];

  it('identifies itself with its key and a human label', () => {
    expect(harness.id).toBe(key);
    expect(harness.label).toMatch(/^\S/);
  });

  it('throws SourceRootMissing when the root does not exist', async () => {
    await expect(count(harness)).rejects.toBeInstanceOf(SourceRootMissing);
  });

  it('reads an existing but empty root as no conversations, not an error', async () => {
    await makeRoot(key);
    const { byFamily, notices } = await count(harness);
    expect([...byFamily.keys()]).toEqual([]);
    expect(notices).toEqual([]);
  });

  it('propagates a per-file read error rather than counting it as zero', async () => {
    const root = await makeRoot(key);
    const file = await writeCountable(key, root, '{}\n');
    await fs.chmod(file, 0o000);   // unreadable, but discoverable
    try {
      await expect(count(harness)).rejects.toThrow();
    } finally {
      await fs.chmod(file, 0o644);
    }
  });

  it('only ever reports families we score', async () => {
    const root = await makeRoot(key);
    await writeCountable(key, root, JSON.stringify({
      message: { usage: { input_tokens: 1, cache_creation_input_tokens: 0, output_tokens: 2 } },
      payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 2 } } },
      messages: [{ tokens: { input: 1, cached: 0, output: 2 } }],
    }) + '\n');
    for (const family of (await count(harness)).byFamily.keys()) {
      expect(MODEL_FAMILIES).toContain(family);
    }
  });

  it('never reports negative or non-finite totals', async () => {
    const root = await makeRoot(key);
    // Deliberately hostile: cached/passive fields larger than the fresh ones.
    await writeCountable(key, root, JSON.stringify({
      message: { usage: { input_tokens: 1, cache_creation_input_tokens: 0, output_tokens: 2 } },
      payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 1, cached_input_tokens: 9_999, output_tokens: 2 } } },
      messages: [{ tokens: { input: 1, cached: 9_999, output: 2 } }],
    }) + '\n');
    for (const conversations of (await count(harness)).byFamily.values()) {
      for (const totals of conversations.values()) {
        expect(totals.input).toBeGreaterThanOrEqual(0);
        expect(totals.output).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(totals.input)).toBe(true);
        expect(Number.isFinite(totals.output)).toBe(true);
      }
    }
  });

  it('namespaces conversation ids with its own id, so harnesses cannot collide', async () => {
    const root = await makeRoot(key);
    await writeCountable(key, root, '{}\n');
    await writeCountable(key, root, JSON.stringify({
      message: { usage: { input_tokens: 5, output_tokens: 5 } },
      payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 5, output_tokens: 5 } } },
      messages: [{ tokens: { input: 5, output: 5 } }],
    }) + '\n');
    for (const conversations of (await count(harness)).byFamily.values()) {
      for (const id of conversations.keys()) expect(id.startsWith(`${key}:`)).toBe(true);
    }
  });

  it('probe reports an absent root without throwing', async () => {
    await expect(probe(harness)).resolves.toMatchObject({ exists: false, transcripts: 0 });
  });

  it('probe agrees with the scan about what counts', async () => {
    const root = await makeRoot(key);
    await writeCountable(key, root, '{}\n');
    const p = await probe(harness);
    expect(p.exists).toBe(true);
    expect(p.transcripts).toBe(1);   // the same file count() would read
  });
});
