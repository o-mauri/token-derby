// The join-time gate: can this machine count anything at all? Probing is the
// engine's job -- this module only decides what to say about the result.

import { probe, type HarnessProbe } from './harnesses/engine.js';
import { HARNESSES, HARNESS_KEYS, type HarnessKey } from './harnesses/registry.js';
import { loadPrefs, enabledHarnesses } from '../stable/prefs.js';

export type { HarnessProbe };

/** Directory a harness reads from, for messages that need to name it. */
export function harnessDir(key: HarnessKey): string {
  return HARNESSES[key].root();
}

/**
 * Probe the harnesses this machine counts. Never throws; an unreadable root
 * reads as empty. A harness turned off is left out rather than listed as though
 * it were broken -- the player already knows they turned it off.
 */
export async function probeAll(): Promise<HarnessProbe[]> {
  const enabled = enabledHarnesses(await loadPrefs());
  return Promise.all(enabled.map(key => probe(HARNESSES[key])));
}

/**
 * The join-time gate. Every family counts the same, so one readable tool is
 * enough to race -- the warning is for the player who has none at all. Returns
 * whether to go ahead with the join. A non-interactive caller is warned but
 * never blocked: there is nobody there to answer.
 */
export async function confirmNoSources(opts: {
  probes: HarnessProbe[];
  interactive: boolean;
  warn: (text: string) => void;
  ask: () => Promise<boolean>;
}): Promise<boolean> {
  if (opts.probes.some(p => p.transcripts > 0)) return true;
  opts.warn(opts.probes.length === 0 ? describeAllDisabled() : describeNoSources(opts.probes));
  if (!opts.interactive) return true;
  return opts.ask();
}

/** What to tell a player with no countable transcripts from any tool. */
export function describeNoSources(probes: HarnessProbe[]): string {
  const lines = [
    `⚠ No transcripts found for any coding agent — your horse will not move.`,
    ``,
  ];
  for (const p of probes) {
    const label = p.harness.label;
    lines.push(`  ${label}: ${p.dir}`, `  ${' '.repeat(label.length)}  (${reasonFor(p)})`);
    // A root full of projects that yields no transcripts is a different problem
    // from an empty one, and wants different advice.
    if (p.exists && p.projects > 0) {
      lines.push(
        `    Has history in it, so this is usually a dangling symlink or a`,
        `    permissions problem. To find dangling links:`,
        `      find ${p.dir} -type l ! -exec test -e {} \\; -print`,
      );
    }
    for (const hint of p.harness.hints ?? []) lines.push(`    ${hint}`);
  }
  lines.push(
    ``,
    `  Token Derby counts usage from this machine's own filesystem. If your`,
    `  coding agent runs in a container, over SSH, or on another machine, join`,
    `  the race from there instead.`,
    ``,
    `  To read them from somewhere else, set the matching directory override:`,
    `    ${HARNESS_KEYS.map(k => HARNESSES[k].overrideVar).join('  ')}`,
  );
  return lines.join('\n');
}

/** Every harness is turned off, which is a different problem from none having history. */
export function describeAllDisabled(): string {
  return [
    `⚠ Every coding agent is turned off — your horse will not move.`,
    ``,
    `  Turn one back on with:  token-derby harness enable <id>`,
    `  See what is available:  token-derby harness list`,
  ].join('\n');
}

/** Why a probe came back empty, phrased for the player. */
function reasonFor(probe: HarnessProbe): string {
  if (!probe.exists) return 'does not exist';
  if (probe.projects > 0) {
    return `holds ${probe.projects} project ${probe.projects === 1 ? 'directory' : 'directories'}, none of which could be read`;
  }
  return 'exists, but holds no transcripts';
}
