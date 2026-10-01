// Parsing one Pi session file.
//
// Pi writes a v3 JSONL per session. Usage rides on assistant messages, tool
// results, compactions and branch summaries, and the MODEL that produced it is
// inherited through the entry tree rather than repeated on every line -- so the
// fold has to carry that inheritance across beat boundaries, not just across
// lines within one read.
//
// The fold stores the raw provider and model id rather than a resolved family:
// the cache holds facts, so the provider table can change without every cached
// value becoming wrong.

import { createHash } from 'node:crypto';
import type { FileFold } from '../../scan-cache.js';

/** Which model was active for an entry, as Pi reported it. */
export type ModelRef = { provider: string; modelId: string };

/** One piece of countable usage, with enough identity to spot a copy of it. */
export type PiUsageEvent = {
  /**
   * Stable across files. A clone or /branch copies entries verbatim into a new
   * session, so the same usage legitimately appears twice on disk and must be
   * counted once.
   */
  fingerprint: string;
  model: ModelRef | null;
  input: number;
  output: number;
};

export type PiFileState = {
  /** Only a v3 session file counts; anything else under the root is ignored. */
  isSession: boolean;
  /** Model active at each entry id, so children can inherit it after a fork. */
  modelByEntry: Record<string, ModelRef | null>;
  events: PiUsageEvent[];
};

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function modelOf(provider: unknown, modelId: unknown): ModelRef | null {
  return typeof provider === 'string' && typeof modelId === 'string' && provider && modelId
    ? { provider, modelId }
    : null;
}

/**
 * Identity for one piece of usage. Copied entries keep their id and timestamp,
 * which is what makes a clone recognisable; a line without them falls back to
 * hashing the line itself.
 */
function fingerprint(entry: any, rawLine: string): string {
  if (typeof entry?.id === 'string' && typeof entry?.timestamp === 'string') {
    const role = entry?.message?.role ?? '';
    return [entry.id, entry.timestamp, entry.type ?? '', role].join('\u0000');
  }
  return createHash('sha256').update(rawLine).digest('base64url');
}

export const PI_FOLD: FileFold<PiFileState> = {
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

      // A model persists down the tree until something changes it, so an entry
      // inherits from its parent rather than from whatever was appended last.
      const inherited = typeof entry?.parentId === 'string' ? modelByEntry[entry.parentId] ?? null : null;
      let active = inherited;
      if (entry?.type === 'model_change') {
        active = modelOf(entry.provider, entry.modelId);
      } else if (entry?.type === 'message' && entry.message?.role === 'assistant') {
        active = modelOf(entry.message.provider, entry.message.model) ?? inherited;
      }
      if (typeof entry?.id === 'string') modelByEntry[entry.id] = active;

      let usage: any = null;
      let usageModel = active;
      if (entry?.type === 'message' && (entry.message?.role === 'assistant' || entry.message?.role === 'toolResult')) {
        usage = entry.message.usage;
      } else if ((entry?.type === 'compaction' || entry?.type === 'branch_summary') && entry.usage) {
        usage = entry.usage;
        // A branch summary is produced by the model on the branch being left,
        // then attached where the conversation continues. `fromId` names the
        // branch that generated it; parentId only says where it landed.
        if (entry.type === 'branch_summary' && typeof entry.fromId === 'string') {
          usageModel = modelByEntry[entry.fromId] ?? active;
        }
      }
      if (!usage) continue;

      // Pi normalises usage into disjoint buckets. Fresh input is uncached input
      // plus cache writes; cache reads are passive and excluded, matching every
      // other harness. Output already includes reasoning where it is reported.
      const input = num(usage.input) + num(usage.cacheWrite);
      const output = num(usage.output);
      if (input > 0 || output > 0) {
        events.push({ fingerprint: fingerprint(entry, line), model: usageModel, input, output });
      }
    }

    return { isSession, modelByEntry, events };
  },
};
