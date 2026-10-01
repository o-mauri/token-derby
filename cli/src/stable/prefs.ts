import * as fs from 'node:fs/promises';
import { prefsFile, homeDir } from '../paths.js';
import { HARNESSES, HARNESS_KEYS, type HarnessKey } from '../tokens/harnesses/registry.js';

/** Local preferences. Lives beside identity.json, under the same home dir. */
export type Prefs = {
  /**
   * Stored by id, not name: renaming a horse in the web UI should not silently
   * drop the default, and two horses may share a name.
   */
  default_stable_horse_id?: string;
  /**
   * Explicit per-agent choices. Only agents the player has actually decided
   * about appear here; anything absent falls back to that harness's own
   * `enabledByDefault`. Storing the choice even when it matches today's default
   * means a later change of default cannot silently overturn it.
   */
  harnesses?: Partial<Record<HarnessKey, boolean>>;
};

/**
 * Preferences are a convenience, never a credential, so every failure to read
 * them degrades to "none set" rather than stopping the command. A corrupt
 * prefs.json costs the user a picker prompt; refusing to run would cost them
 * the command.
 */
export async function loadPrefs(): Promise<Prefs> {
  let raw: string;
  try {
    raw = await fs.readFile(prefsFile(), 'utf8');
  } catch {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const obj = parsed as Record<string, unknown>;
  const id = obj.default_stable_horse_id;
  const harnesses = readHarnessChoices(obj);
  return {
    ...(typeof id === 'string' && id !== '' ? { default_stable_horse_id: id } : {}),
    ...(Object.keys(harnesses).length > 0 ? { harnesses } : {}),
  };
}

/**
 * Only ids and values this version understands are honoured. A choice written by
 * a newer CLI is ignored rather than guessed at -- but setHarnessEnabled writes
 * through the RAW object, so it survives rather than being dropped.
 */
function readHarnessChoices(obj: Record<string, unknown>): Partial<Record<HarnessKey, boolean>> {
  const raw = obj.harnesses;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Partial<Record<HarnessKey, boolean>> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'boolean' && HARNESS_KEYS.includes(key as HarnessKey)) {
      out[key as HarnessKey] = value;
    }
  }
  return out;
}

/**
 * Whether this machine counts a given harness: the player's explicit choice if
 * they made one, otherwise whatever that harness ships as.
 */
export function isHarnessEnabled(prefs: Prefs, key: HarnessKey): boolean {
  return prefs.harnesses?.[key] ?? HARNESSES[key].enabledByDefault;
}

/** The harnesses this machine counts, in registry order. */
export function enabledHarnesses(prefs: Prefs): HarnessKey[] {
  return HARNESS_KEYS.filter(key => isHarnessEnabled(prefs, key));
}

/**
 * Record a choice about one harness. Reads the RAW object rather than the
 * validated one, so a choice about an agent this version does not know is
 * preserved. The choice is stored even when it matches the current default,
 * so changing a default later cannot overturn what the player asked for.
 */
export async function setHarnessEnabled(key: HarnessKey, enabled: boolean): Promise<void> {
  const raw = await loadRaw();
  const stored = typeof raw.harnesses === 'object' && raw.harnesses !== null && !Array.isArray(raw.harnesses)
    ? raw.harnesses as Record<string, unknown>
    : {};
  await savePrefs({ harnesses: { ...stored, [key]: enabled } as Partial<Record<HarnessKey, boolean>> });
}

/**
 * Merges rather than replaces, so a future preference written by a newer CLI
 * survives an older one touching this file.
 */
export async function savePrefs(patch: Prefs): Promise<void> {
  const merged = { ...(await loadRaw()), ...patch };
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined) delete (merged as Record<string, unknown>)[k];
  }
  await fs.mkdir(homeDir(), { recursive: true });
  await fs.writeFile(prefsFile(), JSON.stringify(merged, null, 2) + '\n', 'utf8');
}

/** Unvalidated contents, so savePrefs preserves keys this version does not know. */
async function loadRaw(): Promise<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(await fs.readFile(prefsFile(), 'utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function setDefaultHorse(stableHorseId: string): Promise<void> {
  await savePrefs({ default_stable_horse_id: stableHorseId });
}

export async function clearDefaultHorse(): Promise<void> {
  await savePrefs({ default_stable_horse_id: undefined });
}
