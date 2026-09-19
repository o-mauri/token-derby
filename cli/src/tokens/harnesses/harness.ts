// The contract every harness implements. A HARNESS is a coding agent whose
// history we read (Claude Code, Codex CLI, Pi); a MODEL FAMILY is whose model
// produced the tokens (anthropic, openai, google). They are not the same thing:
// one harness can run several vendors' models, and several harnesses can produce
// the same vendor's tokens.
//
// Adding a harness is four steps and touches nothing else:
//   1. write harnesses/<id>/index.ts exporting one Harness
//   2. add its root to paths.ts, and name the env override it honours
//   3. add one line to harnesses/registry.ts
//   4. add its id to HarnessKey below
// The engine handles counting, caching, probing and warnings, and cannot be
// bypassed -- a harness declares HOW it counts and never runs the pipeline.

import type { ModelFamily } from '@token-derby/shared';
import type { FileFold } from '../scan-cache.js';

/** Which coding agent's history a counter reads. Never leaves this machine. */
export type HarnessKey = 'claude-code' | 'codex-cli' | 'gemini-cli';

/** `input` is FRESH input only: passive cache reads are never counted. */
export type TokenTotals = { input: number; output: number };

/** One file's tokens, split by the family that produced them. */
export type FamilyTotals = Partial<Record<ModelFamily, TokenTotals>>;

/** What one file yielded, plus anything the harness could not count. */
export type FileReading = {
  families: FamilyTotals;
  notices?: string[];
};

/**
 * How a harness turns files into tokens. Declared rather than executed, so the
 * engine owns the cache: a harness cannot forget to use it, and an uncached scan
 * would blow the per-beat time budget on a large history.
 */
export type Counting<S = unknown> =
  | {
      // Append-only history: resume from a byte offset, fold the new lines.
      mode: 'incremental';
      fold: FileFold<S>;
      families(state: S): FamilyTotals;
      notices?(state: S): string[];
    }
  | {
      // Rewritten in place: no offset to resume from, recompute when it changes.
      mode: 'whole-file';
      parse(raw: string, file: string): FileReading;
    };

export interface Harness {
  readonly id: HarnessKey;
  /** How the player refers to this tool. Used by warnings, never by scoring. */
  readonly label: string;

  /**
   * Env var that repoints this harness's history directory. Declared rather
   * than derived from the id: these are documented, user-facing config and
   * cannot be renamed just because the internal ids changed.
   */
  readonly overrideVar: string;

  /**
   * Extra advice shown when this harness has nothing to count. For quirks only
   * this tool has -- a config env var that relocates its history, say.
   */
  readonly hints?: readonly string[];

  /** The directory this harness keeps its history in. Honours its env override. */
  root(): string;

  /**
   * Every countable file under the root. Must throw SourceRootMissing when the
   * root itself is absent -- the one failure meaning "produced nothing" rather
   * than "could not be read".
   */
  discover(root: string): Promise<string[]>;

  /** Which conversation a file rolls up into. The engine prefixes it with the id. */
  conversationId(file: string, root: string): string;

  readonly counting: Counting<any>;
}

/** Declare an append-only harness. */
export function incremental<S>(
  fold: FileFold<S>,
  families: (state: S) => FamilyTotals,
  notices?: (state: S) => string[],
): Counting<S> {
  return { mode: 'incremental', fold, families, ...(notices ? { notices } : {}) };
}

/** Declare a rewritten-in-place harness. */
export function wholeFile(parse: (raw: string, file: string) => FileReading): Counting<unknown> {
  return { mode: 'whole-file', parse };
}

/** The projection for a harness whose family never varies. */
export function constant(family: ModelFamily) {
  return (state: TokenTotals): FamilyTotals => ({ [family]: { input: state.input, output: state.output } });
}
