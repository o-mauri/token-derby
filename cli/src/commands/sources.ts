import { loadVllmSources, addSource, removeSource } from '../tokens/sources-config.js';
import { scrapeVllmCounters } from '../tokens/modal.js';
import { sumTokens } from '../tokens/transcripts.js';
import { sumGeminiTokens } from '../tokens/gemini.js';

const USAGE = `token-derby sources — count real tokens from self-hosted models (Modal/vLLM)

  token-derby sources                     List configured sources
  token-derby sources add <name> <url>    Add or replace a source
  token-derby sources remove <name>       Remove a source
  token-derby sources test                Show local totals + ping each /metrics endpoint

<url> is the base URL of a vLLM server (the /metrics path is added automatically),
e.g. https://stackonehq--ai-council-qwen-qwen-serve.modal.run

You can also set sources via TOKEN_DERBY_VLLM_URLS: "qwen=https://...,solaris=https://..."

These count REAL tokens your models produce. Please don't point this at numbers
you didn't actually generate — Token Derby is meant to be played honestly.`;

export async function sourcesCommand(argv: string[]): Promise<number> {
  const sub = argv[0];

  if (!sub || sub === 'list') {
    const all = await loadVllmSources();
    if (all.length === 0) {
      console.log('No custom sources configured. Add one with: token-derby sources add <name> <url>');
      return 0;
    }
    console.log(`Custom token sources (${all.length}):`);
    for (const s of all) console.log(`  ${s.name.padEnd(16)} ${s.url}`);
    return 0;
  }

  if (sub === 'add') {
    const name = argv[1];
    const url = argv[2];
    if (!name || !url) {
      console.error('Usage: token-derby sources add <name> <url>');
      return 2;
    }
    await addSource(name, url);
    console.log(`Added source "${name}" -> ${url}`);
    return 0;
  }

  if (sub === 'remove') {
    const name = argv[1];
    if (!name) {
      console.error('Usage: token-derby sources remove <name>');
      return 2;
    }
    const removed = await removeSource(name);
    console.log(removed ? `Removed source "${name}".` : `No source named "${name}".`);
    return removed ? 0 : 1;
  }

  if (sub === 'test') {
    // Local sources are always counted; no config needed.
    const [claude, gemini] = await Promise.all([
      sumTokens().catch(() => ({ input: 0, output: 0 })),
      sumGeminiTokens().catch(() => ({ input: 0, output: 0 })),
    ]);
    console.log('Local sources (all-time in/out):');
    console.log(`  ✓ ${'claude'.padEnd(16)} ${claude.input.toLocaleString()} in / ${claude.output.toLocaleString()} out`);
    console.log(`  ✓ ${'gemini'.padEnd(16)} ${gemini.input.toLocaleString()} in / ${gemini.output.toLocaleString()} out`);

    const all = await loadVllmSources();
    if (all.length === 0) {
      console.log('\nNo custom vLLM sources configured.');
      return 0;
    }
    console.log('\nCustom vLLM sources (live counters):');
    let ok = true;
    for (const s of all) {
      const c = await scrapeVllmCounters(s.url);
      if (c === null) {
        ok = false;
        console.log(`  ✗ ${s.name.padEnd(16)} unreachable (asleep or no /metrics)`);
      } else {
        const fresh = Math.max(0, c.prompt - c.cached);
        console.log(`  ✓ ${s.name.padEnd(16)} ${fresh.toLocaleString()} in / ${c.gen.toLocaleString()} out`);
      }
    }
    return ok ? 0 : 1;
  }

  console.error(`Unknown sources subcommand: ${sub}`);
  console.error(USAGE);
  return 2;
}
