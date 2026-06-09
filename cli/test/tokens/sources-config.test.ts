import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadVllmSources, addSource, removeSource, readFileSources } from '../../src/tokens/sources-config.js';

const dirs: string[] = [];
async function tmpHome(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'td-src-'));
  dirs.push(d);
  process.env.TOKEN_DERBY_HOME = d;
  return d;
}
afterEach(async () => {
  delete process.env.TOKEN_DERBY_HOME;
  delete process.env.TOKEN_DERBY_VLLM_URLS;
  for (const d of dirs.splice(0)) await fs.rm(d, { recursive: true, force: true });
});

describe('sources file persistence', () => {
  it('returns [] when no file exists', async () => {
    await tmpHome();
    expect(await readFileSources()).toEqual([]);
  });

  it('adds, lists, and removes sources', async () => {
    await tmpHome();
    await addSource('qwen', 'https://qwen.example');
    await addSource('solaris', 'https://solaris.example');
    expect(await readFileSources()).toEqual([
      { name: 'qwen', url: 'https://qwen.example' },
      { name: 'solaris', url: 'https://solaris.example' },
    ]);
    expect(await removeSource('qwen')).toBe(true);
    expect(await readFileSources()).toEqual([{ name: 'solaris', url: 'https://solaris.example' }]);
    expect(await removeSource('nope')).toBe(false);
  });

  it('replaces a source with the same name instead of duplicating', async () => {
    await tmpHome();
    await addSource('qwen', 'https://old.example');
    await addSource('qwen', 'https://new.example');
    expect(await readFileSources()).toEqual([{ name: 'qwen', url: 'https://new.example' }]);
  });

  it('tolerates a corrupt sources file', async () => {
    const home = await tmpHome();
    await fs.writeFile(path.join(home, 'sources.json'), 'not json', 'utf8');
    expect(await readFileSources()).toEqual([]);
  });
});

describe('loadVllmSources merges env and file', () => {
  it('parses env entries with and without explicit names', async () => {
    await tmpHome();
    process.env.TOKEN_DERBY_VLLM_URLS = 'qwen=https://q.example, https://solaris-host.example';
    expect(await loadVllmSources()).toEqual([
      { name: 'qwen', url: 'https://q.example' },
      { name: 'solaris-host', url: 'https://solaris-host.example' },
    ]);
  });

  it('env sources take precedence over file sources with the same name', async () => {
    await tmpHome();
    await addSource('qwen', 'https://file.example');
    process.env.TOKEN_DERBY_VLLM_URLS = 'qwen=https://env.example';
    expect(await loadVllmSources()).toEqual([{ name: 'qwen', url: 'https://env.example' }]);
  });
});
