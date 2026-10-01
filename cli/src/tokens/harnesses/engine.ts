// The counting pipeline, shared by every harness and reachable by none of them.
// A harness declares where its history is, which files count, how to read one,
// and which conversation it belongs to; everything here is the same regardless.

import * as fs from 'node:fs/promises';
import type { ModelFamily } from '@token-derby/shared';
import { mapWithConcurrency, SCAN_CONCURRENCY } from '../pool.js';
import { ScanCache } from '../scan-cache.js';
import { SourceRootMissing } from '../source-root.js';
import type { FamilyTotals, FileReading, Harness, TokenTotals } from './harness.js';
import { logWarn } from '../../log/logger.js';

/** What a harness contributed for one beat. */
export type CountResult = {
  byFamily: Map<ModelFamily, Map<string, TokenTotals>>;
  notices: string[];
  /** Conversations (prefixed ids) whose files failed to read, so nothing was counted for them. */
  unreadable?: string[];
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
  if (counting.mode === 'custom') throw new Error('custom counting is read whole-history, not per file');
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

  const byFamily = new Map<ModelFamily, Map<string, TokenTotals>>();
  const notices = new Set<string>(); // the same caveat from many files reads once

  const add = (id: string, families: FamilyTotals) => {
    const prefixed = `${harness.id}:${id}`;
    for (const [family, totals] of Object.entries(families) as [ModelFamily, TokenTotals][]) {
      if (!totals) continue;
      const conversations = byFamily.get(family) ?? new Map<string, TokenTotals>();
      const acc = conversations.get(prefixed) ?? { input: 0, output: 0 };
      acc.input += totals.input;
      acc.output += totals.output;
      conversations.set(prefixed, acc);
      byFamily.set(family, conversations);
    }
  };

  if (harness.counting.mode === 'custom') {
    // Whole-history: the harness groups its own conversations because its work
    // cannot be attributed a file at a time.
    const reading = await harness.counting.read(cache, files, root);
    await cache.save();
    for (const notice of reading.notices ?? []) notices.add(notice);
    for (const [id, families] of reading.byConversation) add(id, families);
    return { byFamily, notices: [...notices] };
  }

  // One unreadable file is skipped and named, never counted as zero and never
  // allowed to stop the rest of this harness counting. A failed file is not cached.
  const readings = await mapWithConcurrency(files, SCAN_CONCURRENCY, f =>
    readFile(harness, cache, f).catch((err: unknown) => ({ failed: err })));
  await cache.save();
  const unreadable = new Set<string>();
  files.forEach((file, i) => {
    const reading = readings[i]!;
    const id = harness.conversationId(file, root);
    if ('failed' in reading) {
      unreadable.add(`${harness.id}:${id}`);
      logWarn('scan.file.err', { harness: harness.id, file, message: (reading.failed as Error)?.message ?? String(reading.failed) });
      return;
    }
    for (const notice of reading.notices ?? []) notices.add(notice);
    add(id, reading.families);
  });
  if (unreadable.size > 0) {
    const n = unreadable.size;
    notices.add(`${n} ${harness.label} conversation${n === 1 ? '' : 's'} couldn't be read and ${n === 1 ? "isn't" : "aren't"} counted for now`);
  }
  return { byFamily, notices: [...notices], unreadable: [...unreadable] };
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
