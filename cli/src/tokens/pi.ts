// Counts real tokens produced through Pi. Pi persists normalized usage on each
// assistant message (plus compaction/branch-summary and optional tool usage) in
// ~/.pi/agent/sessions/**/*.jsonl. Each provider/model pair gets its own
// namespaced ModelKey, so arbitrary current and future Pi models can race
// without being mislabeled as Claude, Codex, or Gemini.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { piModelKey, type PiModelKey } from '@token-derby/shared';
import { piSessionsDir } from '../paths.js';
import { mapWithConcurrency, SCAN_CONCURRENCY } from './pool.js';
import { ScanCache, type FileFold } from './scan-cache.js';
import type { TokenTotals } from './transcripts.js';

export type PiUsageByModel = Map<PiModelKey, Map<string, TokenTotals>>;

type PiUsageEvent = {
  fingerprint: string;
  model: PiModelKey;
  input: number;
  output: number;
};

type PiFileState = {
  isSession: boolean;
  // Active model inherited at each tree entry. Keeping this in the incremental
  // fold makes summary/tool usage follow parentId correctly after /tree forks,
  // rather than whichever branch happened to be appended most recently.
  modelByEntry: Record<string, PiModelKey | null>;
  events: PiUsageEvent[];
};

const UNKNOWN_MODEL = piModelKey('unknown', 'unknown')!;

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Sum Pi usage by exact provider/model and top-level conversation.
 *
 * Session clones and forks copy existing entries verbatim. Their entry IDs and
 * timestamps are therefore deduplicated globally, while genuinely new entries
 * on each branch still count. Nested subagent sessions are rolled into their
 * owning top-level conversation for the optional top-five conversation cap.
 */
export async function sumPiByModelAndConversation(): Promise<PiUsageByModel> {
  const root = piSessionsDir();
  try {
    await fs.stat(root);
  } catch (err: any) {
    // Pi is optional. A missing session root is an authoritative empty history.
    if (err?.code === 'ENOENT') return new Map();
    throw err;
  }
  // Errors after root discovery propagate so a partial scan cannot become a
  // trustworthy race baseline.
  const files = await listJsonlFiles(root);
  const cache = await ScanCache.open('pi');
  const states = await mapWithConcurrency(files, SCAN_CONCURRENCY, file =>
    cache.readIncremental(file, PI_FOLD),
  );
  await cache.save();

  const stateByFile = new Map(files.map((file, index) => [file, states[index]!]));
  const seen = new Set<string>();
  const byModel: PiUsageByModel = new Map();
  files.forEach((file, index) => {
    const state = states[index]!;
    if (!state.isSession) return; // ignores unrelated JSONL, including rendered subagent artifacts
    const conversation = conversationId(file, root, stateByFile);
    for (const event of state.events) {
      if (seen.has(event.fingerprint)) continue;
      seen.add(event.fingerprint);
      let byConversation = byModel.get(event.model);
      if (!byConversation) {
        byConversation = new Map();
        byModel.set(event.model, byConversation);
      }
      const total = byConversation.get(conversation) ?? { input: 0, output: 0 };
      total.input += event.input;
      total.output += event.output;
      byConversation.set(conversation, total);
    }
  });
  return byModel;
}

export async function sumPiTokensByModel(): Promise<Map<PiModelKey, TokenTotals>> {
  const byModelAndConversation = await sumPiByModelAndConversation();
  const out = new Map<PiModelKey, TokenTotals>();
  for (const [model, conversations] of byModelAndConversation) {
    const total = { input: 0, output: 0 };
    for (const usage of conversations.values()) {
      total.input += usage.input;
      total.output += usage.output;
    }
    out.set(model, total);
  }
  return out;
}

export async function listPiModelKeys(): Promise<PiModelKey[]> {
  return [...(await sumPiByModelAndConversation()).keys()].sort();
}

async function listJsonlFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  await collectJsonl(root, out);
  return out.sort(); // deterministic winner when copied entries occur in separate top-level clones
}

async function collectJsonl(dir: string, out: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // pi-subagents writes display/event artifacts here in a different JSONL
      // format. Billable child usage is represented by standard child Pi
      // sessions or the child tool's own native logs, so parsing the rendered
      // artifacts would be both wasteful and prone to double-counting.
      if (entry.name !== 'subagent-artifacts') await collectJsonl(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      out.push(full);
    }
  }
}

function conversationId(
  file: string,
  root: string,
  stateByFile: ReadonlyMap<string, PiFileState>,
): string {
  const parts = path.relative(root, file).split(path.sep);
  const nested = parts.length > 2 && !parts[1]!.endsWith('.jsonl');
  const ownerFile = nested
    ? path.join(root, parts[0]!, `${parts[1]!}.jsonl`)
    : file;

  // A /branch clone gets a new session header/path but copies the original
  // entries verbatim. Its first usage fingerprint is therefore a stable fork-
  // family identity even if a lexically earlier clone appears or the donor is
  // later deleted. Nested child sessions inherit their owning top-level seed.
  const seed = stateByFile.get(ownerFile)?.events[0]?.fingerprint;
  if (seed) {
    return `pi/${createHash('sha256').update(seed).digest('base64url')}`;
  }

  // A missing owner (for example, a retained child directory) still gets a
  // deterministic path identity rather than becoming a new conversation each
  // scan.
  if (parts.length === 1) return `pi/${parts[0]!.replace(/\.jsonl$/, '')}`;
  return `pi/${parts[0]!}/${parts[1]!.replace(/\.jsonl$/, '')}`;
}

const PI_FOLD: FileFold<PiFileState> = {
  empty: () => ({ isSession: false, modelByEntry: {}, events: [] }),
  append: (acc, lines) => {
    let isSession = acc.isSession;
    const modelByEntry = { ...acc.modelByEntry };
    const events = [...acc.events];

    for (const line of lines) {
      if (!line.trim()) continue;
      let entry: any;
      try { entry = JSON.parse(line); } catch { continue; }

      if (entry?.type === 'session') {
        isSession = entry.version === 3;
        continue;
      }
      if (!isSession) continue;

      const parentModel = typeof entry?.parentId === 'string'
        ? modelByEntry[entry.parentId] ?? null
        : null;
      let activeModel = parentModel;
      if (entry?.type === 'model_change') {
        activeModel = typeof entry.provider === 'string' && typeof entry.modelId === 'string'
          ? piModelKey(entry.provider, entry.modelId)
          : null;
      } else if (entry?.type === 'message' && entry.message?.role === 'assistant') {
        activeModel = typeof entry.message.provider === 'string' && typeof entry.message.model === 'string'
          ? piModelKey(entry.message.provider, entry.message.model)
          : parentModel;
      }
      if (typeof entry?.id === 'string') modelByEntry[entry.id] = activeModel;

      let usage: any = null;
      let usageModel = activeModel;
      if (entry?.type === 'message' && entry.message?.role === 'assistant' && entry.message.usage) {
        usage = entry.message.usage;
      } else if (entry?.type === 'message' && entry.message?.role === 'toolResult' && entry.message.usage) {
        usage = entry.message.usage;
      } else if ((entry?.type === 'compaction' || entry?.type === 'branch_summary') && entry.usage) {
        usage = entry.usage;
        // Pi generates a branch summary with the model active on the abandoned
        // branch, then attaches the entry at the navigation target. `fromId`
        // identifies that generating branch; parentId identifies only where
        // future context continues.
        if (entry.type === 'branch_summary' && typeof entry.fromId === 'string') {
          usageModel = modelByEntry[entry.fromId] ?? activeModel;
        }
      }
      if (!usage) continue;

      // Pi usage is normalized into disjoint buckets. Fresh input is uncached
      // input plus cache writes; cache reads are passive and excluded. Output
      // already includes reasoning where the provider reports it separately.
      const input = num(usage.input) + num(usage.cacheWrite);
      const output = num(usage.output);
      if (input > 0 || output > 0) {
        events.push({
          fingerprint: usageFingerprint(entry, line),
          model: usageModel ?? UNKNOWN_MODEL,
          input,
          output,
        });
      }
    }

    return { isSession, modelByEntry, events };
  },
};

function usageFingerprint(entry: any, rawLine: string): string {
  if (typeof entry?.id === 'string' && typeof entry?.timestamp === 'string') {
    const role = entry?.message?.role ?? '';
    return `${entry.id}\u0000${entry.timestamp}\u0000${entry.type ?? ''}\u0000${role}`;
  }
  return createHash('sha256').update(rawLine).digest('base64url');
}
