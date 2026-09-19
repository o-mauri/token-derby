// The counting pipeline, shared by every harness and reachable by none of them.
// A harness declares where its history is, which files count, how to read one,
// and which conversation it belongs to; everything here is the same regardless.

import * as fs from 'node:fs/promises';
import type { ModelFamily } from '@token-derby/shared';
import { mapWithConcurrency, SCAN_CONCURRENCY } from '../pool.js';
import { ScanCache } from '../scan-cache.js';
import { SourceRootMissing } from '../source-root.js';
import type { FileReading, Harness, TokenTotals } from './harness.js';

/** What a harness contributed for one beat. */
export type CountResult = {
  byFamily: Map<ModelFamily, Map<string, TokenTotals>>;
  notices: string[];
};

/** What a join-time probe found, without parsing a byte of token data. */
export type HarnessProbe = {
  harness: Harness;
  dir: string;         // the root that was searched
  exists: boolean;     // whether that root is a directory at all
  projects: number;    // entries directly beneath it
  transcripts: number; // countable files found anywhere beneath it
};

/** Read one file through the cache, using whichever mode the harness declared. */
async function readFile(harness: Harness, cache: ScanCache, file: string): Promise<FileReading> {
  const counting = harness.counting;
  if (counting.mode === 'whole-file') {
    return cache.readWhenChanged(file, async raw => counting.parse(raw, file));
  }
  const state = await cache.readIncremental(file, counting.fold);
  const notices = counting.notices?.(state) ?? [];
  return { families: counting.families(state), ...(notices.length > 0 ? { notices } : {}) };
}

/**
 * Count one harness's tokens, grouped by family and conversation.
 *
 * Conversation ids are prefixed with the harness id because several harnesses
 * can feed the same family, and two of them colliding on an id would silently
 * merge their anchors.
 */
export async function count(harness: Harness): Promise<CountResult> {
  const root = harness.root();
  const files = await harness.discover(root);
  const cache = await ScanCache.open(harness.id);
  const readings = await mapWithConcurrency(files, SCAN_CONCURRENCY, f => readFile(harness, cache, f));
  await cache.save(); // only after a clean scan — a throw above must not commit

  const byFamily = new Map<ModelFamily, Map<string, TokenTotals>>();
  const notices = new Set<string>(); // the same caveat from many files reads once
  files.forEach((file, i) => {
    const reading = readings[i]!;
    for (const notice of reading.notices ?? []) notices.add(notice);
    const id = `${harness.id}:${harness.conversationId(file, root)}`;
    for (const [family, totals] of Object.entries(reading.families) as [ModelFamily, TokenTotals][]) {
      if (!totals) continue;
      const conversations = byFamily.get(family) ?? new Map<string, TokenTotals>();
      const acc = conversations.get(id) ?? { input: 0, output: 0 };
      acc.input += totals.input;
      acc.output += totals.output;
      conversations.set(id, acc);
      byFamily.set(family, conversations);
    }
  });
  return { byFamily, notices: [...notices] };
}

/**
 * Whether this machine has anything for this harness to count. Never throws —
 * an unreadable root reads as empty. Reuses `discover`, so a probe can never
 * disagree with the scan about what counts.
 */
export async function probe(harness: Harness): Promise<HarnessProbe> {
  const dir = harness.root();
  const exists = await fs.stat(dir).then(st => st.isDirectory()).catch(() => false);
  if (!exists) return { harness, dir, exists: false, projects: 0, transcripts: 0 };
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const projects = entries.filter(e => e.isDirectory() || e.isSymbolicLink()).length;
  const files = await harness.discover(dir).catch((e) => {
    if (e instanceof SourceRootMissing) return [] as string[];
    return [] as string[];
  });
  return { harness, dir, exists: true, projects, transcripts: files.length };
}
