// One set of assertions, run against every counter. These are the promises the
// race relies on regardless of which agent produced the tokens; a new counter
// that breaks one of them fails here rather than in a live race.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { MODEL_KEYS, type ModelKey } from '@token-derby/shared';
import { COUNTERS } from '../../../src/tokens/counters/index.js';
import { SourceRootMissing } from '../../../src/tokens/source-root.js';

let home: string;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'td-contract-'));
  process.env.TOKEN_DERBY_HOME = home;
  for (const key of MODEL_KEYS) process.env[`TOKEN_DERBY_${key.toUpperCase()}_DIR`] = path.join(home, key);
});

afterEach(async () => {
  for (const key of MODEL_KEYS) delete process.env[`TOKEN_DERBY_${key.toUpperCase()}_DIR`];
  delete process.env.TOKEN_DERBY_HOME;
  await fs.rm(home, { recursive: true, force: true });
});

/** The minimum tree each source needs for its root to count as present. */
async function makeRoot(key: ModelKey): Promise<string> {
  const root = path.join(home, key);
  await fs.mkdir(root, { recursive: true });
  return root;
}

/** A file this counter will discover, holding `raw`. */
async function writeCountable(key: ModelKey, root: string, raw: string): Promise<string> {
  const file = {
    claude: path.join(root, 'proj', 'session-1.jsonl'),
    codex: path.join(root, 'sessions', '2026', '09', 'rollout-a.jsonl'),
    gemini: path.join(root, 'projhash', 'chats', 'session-a.json'),
  }[key];
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, raw, 'utf8');
  return file;
}

describe.each(MODEL_KEYS)('TokenCounter contract — %s', (key) => {
  const counter = COUNTERS[key];

  it('identifies itself with its key and a human label', () => {
    expect(counter.key).toBe(key);
    expect(counter.label).toMatch(/^\S/);
  });

  it('throws SourceRootMissing when the root does not exist', async () => {
    await expect(counter.byConversation()).rejects.toBeInstanceOf(SourceRootMissing);
  });

  it('reads an existing but empty root as no conversations, not an error', async () => {
    await makeRoot(key);
    await expect(counter.byConversation()).resolves.toEqual(new Map());
  });

  it('propagates a per-file read error rather than counting it as zero', async () => {
    const root = await makeRoot(key);
    const file = await writeCountable(key, root, '{}\n');
    await fs.chmod(file, 0o000);   // unreadable, but discoverable
    try {
      await expect(counter.byConversation()).rejects.toThrow();
    } finally {
      await fs.chmod(file, 0o644);
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
    for (const totals of (await counter.byConversation()).values()) {
      expect(totals.input).toBeGreaterThanOrEqual(0);
      expect(totals.output).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(totals.input)).toBe(true);
      expect(Number.isFinite(totals.output)).toBe(true);
    }
  });

  it('probe reports an absent root without throwing', async () => {
    await expect(counter.probe()).resolves.toMatchObject({ key, exists: false, transcripts: 0 });
  });

  it('probe agrees with the scan about what counts', async () => {
    const root = await makeRoot(key);
    await writeCountable(key, root, '{}\n');
    const probe = await counter.probe();
    expect(probe.exists).toBe(true);
    expect(probe.transcripts).toBe(1);   // the same file byConversation would read
  });
});
