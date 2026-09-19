// The shape every token counter shares. One subclass per coding agent, each
// supplying only what is genuinely different about that agent's history:
// where it lives, which files count, how a file's tokens are read, and which
// conversation a file belongs to. Everything else — the missing-root rule, the
// scan cache, the concurrency pool, the grouping — lives here so the three
// cannot drift apart.

import * as fs from 'node:fs/promises';
import type { ModelKey } from '@token-derby/shared';
import { mapWithConcurrency, SCAN_CONCURRENCY } from '../pool.js';
import { ScanCache } from '../scan-cache.js';
import { SourceRootMissing } from '../source-root.js';

/** `input` is FRESH input only: passive cache reads are never counted. */
export type TokenTotals = { input: number; output: number };

/** What a join-time probe found, without parsing a byte of token data. */
export type SourceProbe = {
  key: ModelKey;
  dir: string;         // the root that was searched
  exists: boolean;     // whether that root is a directory at all
  projects: number;    // entries directly beneath it
  transcripts: number; // countable files found anywhere beneath it
};

export abstract class TokenCounter {
  abstract readonly key: ModelKey;
  abstract readonly label: string;

  /** The directory this counter reads from. Honours the per-source env override. */
  abstract root(): string;

  /**
   * Every countable file under the root. Must throw SourceRootMissing when the
   * root itself is absent — that is the one failure meaning "produced nothing"
   * rather than "could not be read".
   */
  protected abstract discover(root: string): Promise<string[]>;

  /** Which conversation a file rolls up into. Several files may share one id. */
  protected abstract conversationId(file: string, root: string): string;

  /**
   * One file's totals, read through the cache so an untouched file costs a
   * single stat. Errors propagate: a file that cannot be read degrades the
   * whole source for this beat rather than quietly counting as zero.
   */
  protected abstract read(cache: ScanCache, file: string): Promise<TokenTotals>;

  /** This source's tokens, grouped by conversation. The race's entry point. */
  async byConversation(): Promise<Map<string, TokenTotals>> {
    const root = this.root();
    const files = await this.discover(root);
    const cache = await ScanCache.open(this.key);
    const totals = await mapWithConcurrency(files, SCAN_CONCURRENCY, f => this.read(cache, f));
    await cache.save(); // only after a clean scan — a throw above must not commit

    const byConv = new Map<string, TokenTotals>();
    files.forEach((file, i) => {
      const t = totals[i]!;
      const id = this.conversationId(file, root);
      const acc = byConv.get(id) ?? { input: 0, output: 0 };
      acc.input += t.input;
      acc.output += t.output;
      byConv.set(id, acc);
    });
    return byConv;
  }

  /**
   * Whether this machine has anything for this source to count. Never throws —
   * an unreadable root reads as empty. Reuses `discover`, so a probe can never
   * disagree with the scan about what counts.
   */
  async probe(): Promise<SourceProbe> {
    const dir = this.root();
    const exists = await fs.stat(dir).then(st => st.isDirectory()).catch(() => false);
    if (!exists) return { key: this.key, dir, exists: false, projects: 0, transcripts: 0 };
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    const projects = entries.filter(e => e.isDirectory() || e.isSymbolicLink()).length;
    const files = await this.discover(dir).catch((e) => {
      if (e instanceof SourceRootMissing) return [] as string[];
      return [] as string[];
    });
    return { key: this.key, dir, exists: true, projects, transcripts: files.length };
  }
}
