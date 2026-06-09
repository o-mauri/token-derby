import { loadVllmSources, type VllmSource } from './sources-config.js';
import type { TokenTotals } from './transcripts.js';

// Counts real tokens produced by self-hosted models on vLLM servers (e.g.
// solaris/qwen on Modal). Same honesty rules as tokens/transcripts.ts — this
// reads the server's own usage counters, it does not fabricate anything.
//
// vLLM exposes cumulative Prometheus counters at /metrics:
//   vllm:prompt_tokens_total{model_name="..."}        total prompt tokens
//   vllm:prompt_tokens_cached_total{model_name="..."}  cached (passive) prompt
//   vllm:generation_tokens_total{model_name="..."}     generated tokens
//
// To mirror the Claude scoring philosophy: fresh `input` = prompt − cached
// (cached prompt is passive context, excluded), and `output` = generation.
//
// Two operational realities are handled by a monotonic accumulator:
//  - Modal servers scale to zero, so /metrics is unreachable when idle → we
//    skip that reading and keep the running total.
//  - Counters reset to 0 on every cold start → detected (current < last) and
//    folded back in so the total never goes backwards.
// The first successful reading per source is a baseline (contributes 0), so
// usage from before the race isn't counted.

type RawCounters = { prompt: number; gen: number; cached: number };

type SourceState = {
  last: RawCounters;
  acc: RawCounters;
  initialized: boolean;
};

const states = new Map<string, SourceState>();

const SCRAPE_TIMEOUT_MS = 5_000;

const COUNTER_RE = {
  prompt: /^vllm:prompt_tokens_total\{[^}]*\}\s+([0-9.eE+]+)/,
  cached: /^vllm:prompt_tokens_cached_total\{[^}]*\}\s+([0-9.eE+]+)/,
  gen: /^vllm:generation_tokens_total\{[^}]*\}\s+([0-9.eE+]+)/,
};

/** Scrape the three token counters from a vLLM /metrics endpoint. Null if unreachable. */
export async function scrapeVllmCounters(url: string): Promise<RawCounters | null> {
  const base = url.replace(/\/+$/, '');
  let text: string;
  try {
    const res = await fetch(`${base}/metrics`, { signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS) });
    if (!res.ok) return null;
    text = await res.text();
  } catch {
    return null;
  }
  const sum = { prompt: 0, gen: 0, cached: 0 };
  let found = false;
  for (const line of text.split('\n')) {
    for (const key of ['prompt', 'cached', 'gen'] as const) {
      const m = COUNTER_RE[key].exec(line);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n)) { sum[key] += n; found = true; }
      }
    }
  }
  return found ? sum : null;
}

function foldCounter(acc: number, last: number, cur: number): number {
  // Forward progress, or a cold-start reset (cur < last) where we add the
  // post-reset value so the accumulator never decreases.
  return acc + (cur >= last ? cur - last : cur);
}

function fold(state: SourceState, raw: RawCounters | null): void {
  if (raw === null) return; // server asleep — hold the running total
  if (!state.initialized) {
    state.initialized = true; // baseline; don't count pre-existing usage
  } else {
    state.acc.prompt = foldCounter(state.acc.prompt, state.last.prompt, raw.prompt);
    state.acc.gen = foldCounter(state.acc.gen, state.last.gen, raw.gen);
    state.acc.cached = foldCounter(state.acc.cached, state.last.cached, raw.cached);
  }
  state.last = raw;
}

/**
 * Scrape every configured source and return the running token total across them
 * since this process first observed each one. `input` is fresh prompt
 * (prompt − cached); `output` is generation. Stateful across calls.
 */
export async function sampleModalTokens(): Promise<TokenTotals> {
  const sources = await loadVllmSources();
  if (sources.length === 0) return { input: 0, output: 0 };
  await Promise.all(sources.map(async (s: VllmSource) => {
    const raw = await scrapeVllmCounters(s.url);
    const state = states.get(s.name) ?? {
      last: { prompt: 0, gen: 0, cached: 0 },
      acc: { prompt: 0, gen: 0, cached: 0 },
      initialized: false,
    };
    fold(state, raw);
    states.set(s.name, state);
  }));
  let input = 0;
  let output = 0;
  for (const state of states.values()) {
    input += Math.max(0, state.acc.prompt - state.acc.cached);
    output += state.acc.gen;
  }
  return { input: Math.round(input), output: Math.round(output) };
}

/** Test helper — clears all accumulator state. */
export function __resetModalState(): void {
  states.clear();
}
