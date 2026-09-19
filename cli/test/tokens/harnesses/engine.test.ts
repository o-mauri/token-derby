// The pipeline, tested once against fake harnesses. Everything here is behaviour
// no harness should have to re-implement or be able to bypass.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { count, probe } from '../../../src/tokens/harnesses/engine.js';
import { incremental, wholeFile, constant, type Harness } from '../../../src/tokens/harnesses/harness.js';
import { SourceRootMissing } from '../../../src/tokens/source-root.js';

let home: string;
let root: string;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'td-engine-'));
  root = path.join(home, 'history');
  await fs.mkdir(root, { recursive: true });
  process.env.TOKEN_DERBY_HOME = home;
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_HOME;
  await fs.rm(home, { recursive: true, force: true });
});

async function write(name: string, raw: string): Promise<string> {
  const file = path.join(root, name);
  await fs.writeFile(file, raw, 'utf8');
  return file;
}

/** A harness that reads one number per line and calls it anthropic output. */
function fake(over: Partial<Harness> = {}): Harness {
  return {
    id: 'claude-code',
    label: 'Fake',
    overrideVar: 'TOKEN_DERBY_FAKE_DIR',
    root: () => root,
    discover: async r => (await fs.readdir(r)).map(f => path.join(r, f)).sort(),
    conversationId: file => path.basename(file),
    counting: incremental(
      {
        empty: () => ({ input: 0, output: 0 }),
        append: (acc, lines) => {
          let { input, output } = acc;
          for (const l of lines) { if (l.trim()) output += Number(l.trim()) || 0; }
          return { input, output };
        },
      },
      constant('anthropic'),
    ),
    ...over,
  } as Harness;
}

describe('engine.count', () => {
  it('groups conversations under the family the harness reported', async () => {
    await write('a.txt', '10\n20\n');
    const { byFamily } = await count(fake());
    expect([...byFamily.keys()]).toEqual(['anthropic']);
    expect([...byFamily.get('anthropic')!.values()]).toEqual([{ input: 0, output: 30 }]);
  });

  it('prefixes conversation ids with the harness id', async () => {
    await write('a.txt', '5\n');
    const { byFamily } = await count(fake());
    expect([...byFamily.get('anthropic')!.keys()]).toEqual(['claude-code:a.txt']);
  });

  it('rolls several files sharing a conversation id into one entry', async () => {
    await write('a.txt', '10\n');
    await write('b.txt', '20\n');
    const { byFamily } = await count(fake({ conversationId: () => 'one' }));
    const conversations = byFamily.get('anthropic')!;
    expect(conversations.size).toBe(1);
    expect(conversations.get('claude-code:one')).toEqual({ input: 0, output: 30 });
  });

  it('splits one file across families when the harness reports several', async () => {
    await write('a.txt', '');
    const multi = fake({
      counting: wholeFile(() => ({
        families: { anthropic: { input: 1, output: 2 }, openai: { input: 3, output: 4 } },
      })),
    });
    const { byFamily } = await count(multi);
    expect(byFamily.get('anthropic')!.get('claude-code:a.txt')).toEqual({ input: 1, output: 2 });
    expect(byFamily.get('openai')!.get('claude-code:a.txt')).toEqual({ input: 3, output: 4 });
  });

  it('collects notices and reports each distinct one once', async () => {
    await write('a.txt', '');
    await write('b.txt', '');
    const noisy = fake({
      counting: wholeFile(() => ({ families: {}, notices: ['provider deepseek not counted'] })),
    });
    expect((await count(noisy)).notices).toEqual(['provider deepseek not counted']);
  });

  it('lets a missing root through as SourceRootMissing, not an empty read', async () => {
    const absent = fake({ discover: async () => { throw new SourceRootMissing('/nope'); } });
    await expect(count(absent)).rejects.toBeInstanceOf(SourceRootMissing);
  });

  it('propagates a read error rather than counting the file as zero', async () => {
    await write('a.txt', '1\n');
    const broken = fake({
      counting: wholeFile(() => { throw new Error('EACCES'); }),
    });
    await expect(count(broken)).rejects.toThrow('EACCES');
  });

  it('caches: an unchanged file is not re-parsed on the next scan', async () => {
    await write('a.txt', '10\n');
    const parse = vi.fn(() => ({ families: { anthropic: { input: 0, output: 10 } } }));
    const harness = fake({ counting: wholeFile(parse) });
    await count(harness);
    await count(harness);
    expect(parse).toHaveBeenCalledTimes(1);   // second scan was a stat, not a read
  });

  it('does not commit the cache when a scan throws partway', async () => {
    await write('a.txt', '10\n');
    const parse = vi.fn(() => ({ families: { anthropic: { input: 0, output: 10 } } }));
    const ok = fake({ counting: wholeFile(parse) });
    const boom = fake({ counting: wholeFile(() => { throw new Error('boom'); }) });

    await expect(count(boom)).rejects.toThrow('boom');
    await count(ok);
    expect(parse).toHaveBeenCalledTimes(1);   // the failed scan left nothing behind
  });
});

describe('engine.probe', () => {
  it('reports an absent root without throwing', async () => {
    const absent = fake({ root: () => path.join(home, 'nope') });
    await expect(probe(absent)).resolves.toMatchObject({ exists: false, transcripts: 0 });
  });

  it('counts the same files the scan would read', async () => {
    await write('a.txt', '1\n');
    await write('b.txt', '2\n');
    const p = await probe(fake());
    expect(p.exists).toBe(true);
    expect(p.transcripts).toBe(2);
  });

  it('survives a discover() that throws, rather than failing the join', async () => {
    const broken = fake({ discover: async () => { throw new Error('boom'); } });
    await expect(probe(broken)).resolves.toMatchObject({ exists: true, transcripts: 0 });
  });
});
