import { HARNESSES, HARNESS_KEYS, type HarnessKey } from '../tokens/harnesses/registry.js';
import { probe } from '../tokens/harnesses/engine.js';
import { loadPrefs, isHarnessEnabled, setHarnessEnabled, enabledHarnesses } from '../stable/prefs.js';

function isHarnessKey(v: string): v is HarnessKey {
  return (HARNESS_KEYS as string[]).includes(v);
}

function listValidIds(): string {
  return HARNESS_KEYS.join(', ');
}

/**
 * Show every coding agent, whether this machine counts it, and whether it has
 * anything to count. Printing the ids is the point: nobody should have to guess
 * whether it is `codex` or `codex-cli`.
 */
export async function harnessListCommand(): Promise<number> {
  const prefs = await loadPrefs();
  const rows = await Promise.all(HARNESS_KEYS.map(async (key) => {
    const p = await probe(HARNESSES[key]);
    return {
      key,
      label: HARNESSES[key].label,
      on: isHarnessEnabled(prefs, key),
      chosen: prefs.harnesses?.[key] !== undefined,
      byDefault: HARNESSES[key].enabledByDefault,
      found: p.transcripts,
      dir: p.dir,
    };
  }));

  const width = Math.max(...rows.map(r => r.key.length));
  console.log('');
  for (const r of rows) {
    const state = r.on ? 'on ' : 'off';
    // Say when a state came from the shipped default rather than a choice, so an
    // agent that is off because nobody asked for it reads differently from one
    // that was deliberately turned off.
    const why = r.chosen ? '' : r.byDefault ? '  (default)' : '  (off by default — enable to count it)';
    const found = r.found === 1 ? '1 transcript' : `${r.found} transcripts`;
    console.log(`  ${state}  ${r.key.padEnd(width)}  ${r.label}${why}`);
    console.log(`       ${' '.repeat(width)}  ${r.dir}  (${found})`);
  }
  console.log('');
  console.log('  token-derby harness disable <id>   stop counting one');
  console.log('  token-derby harness enable <id>    start counting it again');
  console.log('');
  return 0;
}

/** Turn one agent on or off for this machine. Takes effect on the next heartbeat. */
export async function harnessToggleCommand(id: string | undefined, enabled: boolean): Promise<number> {
  const verb = enabled ? 'enable' : 'disable';
  if (!id) {
    console.error(`Usage: token-derby harness ${verb} <id>`);
    console.error(`Available: ${listValidIds()}`);
    return 2;
  }
  if (!isHarnessKey(id)) {
    console.error(`Unknown coding agent '${id}'.`);
    console.error(`Available: ${listValidIds()}`);
    return 2;
  }

  const before = await loadPrefs();
  if (isHarnessEnabled(before, id) === enabled) {
    console.log(`${HARNESSES[id].label} is already ${enabled ? 'counted' : 'turned off'}.`);
    return 0;
  }

  await setHarnessEnabled(id, enabled);
  const remaining = enabledHarnesses(await loadPrefs());
  console.log(`${HARNESSES[id].label} is now ${enabled ? 'counted' : 'turned off'}.`);
  console.log('Takes effect on your next heartbeat — no need to rejoin.');
  // Allowed, but never silently: scoring nothing should be a choice, not a surprise.
  if (remaining.length === 0) {
    console.log('');
    console.log('⚠ Every coding agent is now off, so your horse will not move.');
  }
  return 0;
}
