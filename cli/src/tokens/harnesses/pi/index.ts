// Counts real tokens produced through Pi — same honesty rules as every other
// harness. Pi is the reason harness and model family are separate concepts: it
// can run Anthropic, OpenAI and Google models in one session, and its tokens
// should count as whatever actually produced them.
//
// It is a WHOLE-HISTORY harness rather than a per-file one. Cloning or /branch
// copies entries verbatim into a new session file, so the same usage exists
// twice on disk and has to be reconciled across every file before anything is
// counted -- which a file-at-a-time reader cannot do.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ModelFamily } from '@token-derby/shared';
import { piSessionsDir } from '../../../paths.js';
import type { ScanCache } from '../../scan-cache.js';
import { readRoot } from '../../source-root.js';
import { mapWithConcurrency, SCAN_CONCURRENCY } from '../../pool.js';
import { custom, type CustomReading, type FamilyTotals, type Harness } from '../harness.js';
import { PI_FOLD } from './entries.js';
import { describeUncounted, resolveProvider, type Resolution } from './providers.js';

const SESSION_EXT = '.jsonl';

// pi-subagents writes display artifacts here in a different JSONL shape. The
// billable child usage already appears as its own Pi session, so parsing these
// would double-count.
const IGNORED_DIRS = new Set(['subagent-artifacts']);

export const pi: Harness = {
  id: 'pi',
  label: 'Pi',
  // Off until asked for: Pi arrived after the others, and adding a harness must
  // never start counting someone's history behind their back.
  enabledByDefault: false,
  overrideVar: 'TOKEN_DERBY_PI_DIR',
  root: piSessionsDir,

  async discover(root) {
    await readRoot(root, () => fs.stat(root));
    const out: string[] = [];
    await collect(root, out);
    return out.sort(); // deterministic, so a deduped copy always loses to the same winner
  },

  // Unused for a whole-history harness: it groups its own conversations, since
  // one session's work can be spread across a file and its clones.
  conversationId(file) {
    return file;
  },

  counting: custom(readAll),
};

/** Recursively collect session files. Nothing below the root is fatal. */
async function collect(dir: string, out: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) await collect(full, out);
    } else if (entry.isFile() && entry.name.endsWith(SESSION_EXT)) {
      out.push(full);
    }
  }
}

/**
 * Read every session, then reconcile across them: each piece of usage counts
 * once, attributed to the family that produced it.
 */
async function readAll(cache: ScanCache, files: string[], root: string): Promise<CustomReading> {
  const states = await mapWithConcurrency(files, SCAN_CONCURRENCY, f => cache.readIncremental(f, PI_FOLD));

  const byConversation = new Map<string, FamilyTotals>();
  const seen = new Set<string>();
  const uncounted: Resolution[] = [];

  files.forEach((file, i) => {
    const state = states[i]!;
    if (!state.isSession) return; // unrelated JSONL under the root
    const conversation = conversationOf(file, root);

    for (const event of state.events) {
      // The same usage in a clone and its donor is one piece of work.
      if (seen.has(event.fingerprint)) continue;
      seen.add(event.fingerprint);

      if (!event.model) continue; // no model ever declared: nothing to attribute it to
      const resolved = resolveProvider(event.model.provider);
      if (resolved.kind !== 'family') {
        uncounted.push(resolved);
        continue;
      }
      addTo(byConversation, conversation, resolved.family, event.input, event.output);
    }
  });

  return { byConversation, notices: describeUncounted(uncounted) };
}

function addTo(
  byConversation: Map<string, FamilyTotals>,
  conversation: string,
  family: ModelFamily,
  input: number,
  output: number,
): void {
  const families = byConversation.get(conversation) ?? {};
  const totals = families[family] ?? { input: 0, output: 0 };
  totals.input += input;
  totals.output += output;
  families[family] = totals;
  byConversation.set(conversation, families);
}

/**
 * Which conversation a session file belongs to: the file itself.
 *
 * Nested files are NOT rolled up into a parent session. Doing so would mean
 * assuming the first path segment names the owning session -- and if Pi ever
 * nests by date the way Codex does, that assumption would collapse every
 * session into one conversation. Rolling up was only ever needed for the
 * per-conversation cap, which no longer exists, and duplicate work is already
 * handled by fingerprint rather than by grouping.
 *
 * What a conversation id must actually be is STABLE between beats, so the
 * tracker's per-conversation floor keeps its anchor. A path is exactly that.
 */
function conversationOf(file: string, root: string): string {
  return path.relative(root, file).replace(/\.jsonl$/, '');
}
