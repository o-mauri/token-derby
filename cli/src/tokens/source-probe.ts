// The join-time gate: can this machine count anything at all? Probing is the
// counters' own job -- this module only decides what to say about the result.

import type { ModelKey } from '@token-derby/shared';
import { COUNTERS, type SourceProbe } from './counters/index.js';

export type { SourceProbe };

/** Directory a source reads from, for messages that need to name it. */
export function sourceDir(key: ModelKey): string {
  return COUNTERS[key].root();
}

/** Look for a source's countable files. Never throws; an unreadable root reads as empty. */
export function probeSource(key: ModelKey): Promise<SourceProbe> {
  return COUNTERS[key].probe();
}

/** Env var that repoints a source's history directory. */
function overrideVar(key: ModelKey): string {
  return `TOKEN_DERBY_${key.toUpperCase()}_DIR`;
}

/**
 * The join-time gate. Every model counts the same, so one readable source is
 * enough to race — the warning is for the player who has none at all. Returns
 * whether to go ahead with the join. A non-interactive caller is warned but
 * never blocked: there is nobody there to answer.
 */
export async function confirmNoSources(opts: {
  probes: SourceProbe[];
  interactive: boolean;
  warn: (text: string) => void;
  ask: () => Promise<boolean>;
}): Promise<boolean> {
  if (opts.probes.some(p => p.transcripts > 0)) return true;
  opts.warn(describeNoSources(opts.probes));
  if (!opts.interactive) return true;
  return opts.ask();
}

/** What to tell a player with no countable transcripts from any source. */
export function describeNoSources(probes: SourceProbe[]): string {
  const lines = [
    `⚠ No transcripts found for any source — your horse will not move.`,
    ``,
  ];
  for (const probe of probes) {
    const label = COUNTERS[probe.key].label;
    lines.push(`  ${label}: ${probe.dir}`, `  ${' '.repeat(label.length)}  (${reasonFor(probe)})`);
  }
  lines.push(
    ``,
    `  Token Derby counts usage from this machine's own filesystem. If your`,
    `  coding agent runs in a container, over SSH, or on another machine, join`,
    `  the race from there instead.`,
    ``,
    `  To read them from somewhere else: export ${overrideVar('claude')}=<dir>`,
    `  (and likewise ${overrideVar('codex')} / ${overrideVar('gemini')})`,
  );
  return lines.join('\n');
}

/** Why a probe came back empty, phrased for the player. */
function reasonFor(probe: SourceProbe): string {
  if (!probe.exists) return 'does not exist';
  if (probe.projects > 0) {
    return `holds ${probe.projects} project ${probe.projects === 1 ? 'directory' : 'directories'}, none of which could be read`;
  }
  return 'exists, but holds no transcripts';
}

/** What to tell a player whose primary source has no transcripts to count. */
export function describeEmptySource(probe: SourceProbe): string {
  const label = COUNTERS[probe.key].label;
  // A root full of projects that yields no transcripts is a different problem
  // from a root with nothing in it, and wants different advice.
  const populated = probe.exists && probe.projects > 0;
  const reason = reasonFor(probe);
  const lines = [
    `⚠ No ${label} transcripts found — your horse will not move.`,
    ``,
    `  Looked in: ${probe.dir}`,
    `             (${reason})`,
    ``,
  ];
  if (populated) {
    lines.push(
      `  The directory is there and has history in it, so this is usually a`,
      `  dangling symlink or a permissions problem on one of those projects.`,
      `  To find dangling links:`,
      `    find ${probe.dir} -type l ! -exec test -e {} \\; -print`,
      ``,
    );
  }
  lines.push(
    `  Token Derby counts ${label} usage from this machine's own filesystem.`,
    `  If ${label} runs in a container, over SSH, or on another machine, join`,
    `  the race from there instead.`,
  );
  if (probe.key === 'claude') {
    lines.push(
      `  If CLAUDE_CONFIG_DIR relocated your config, Token Derby follows it —`,
      `  check it points at the config root, not the projects directory.`,
    );
  }
  lines.push(``, `  To read them from somewhere else: export ${overrideVar(probe.key)}=<dir>`);
  return lines.join('\n');
}
