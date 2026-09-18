import * as fs from 'node:fs/promises';
import { prefsFile, homeDir } from '../paths.js';

/**
 * Local, per-environment preferences. Lives beside identity.json, so prod and
 * staging keep their own — a default horse id from one env is meaningless in
 * the other.
 */
export type Prefs = {
  /**
   * Stored by id, not name: renaming a horse in the web UI should not silently
   * drop the default, and two horses may share a name.
   */
  default_stable_horse_id?: string;
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
  const id = (parsed as Record<string, unknown>).default_stable_horse_id;
  return typeof id === 'string' && id !== '' ? { default_stable_horse_id: id } : {};
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
