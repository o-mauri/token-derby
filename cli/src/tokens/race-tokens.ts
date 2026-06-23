import { MODEL_KEYS, type ModelKey } from '@token-derby/shared';
import { sumTokens, type TokenTotals } from './transcripts.js';
import { sumCodexTokens } from './codex.js';
import { sumGeminiTokens } from './gemini.js';

export type SourceReading = Record<ModelKey, number>;

/** Collapse a source's totals to a single number in the race's mode. */
export function scoreFor(race: { counts_input?: boolean }, t: TokenTotals): number {
  return race.counts_input ? t.input + t.output : t.output;
}

/**
 * Read all three sources, scored in the race's mode. The PRIMARY source is the
 * critical path — if its reader throws, the whole beat is a stall (returns null,
 * matching how a missing ~/.claude is treated). The two secondary sources are
 * resilient: a failure contributes 0 rather than stalling the heartbeat.
 */
export async function readAllSources(
  race: { counts_input?: boolean },
  primary: ModelKey,
): Promise<SourceReading | null> {
  const READERS: Record<ModelKey, () => Promise<TokenTotals>> = {
    claude: sumTokens,
    codex: sumCodexTokens,
    gemini: sumGeminiTokens,
  };

  const read = async (key: ModelKey): Promise<number> => scoreFor(race, await READERS[key]());
  try {
    const entries = await Promise.all(
      MODEL_KEYS.map(async (key): Promise<[ModelKey, number]> => {
        if (key === primary) return [key, await read(key)]; // throws → caught below → null
        return [key, await read(key).catch(() => 0)];
      }),
    );
    return Object.fromEntries(entries) as SourceReading;
  } catch {
    return null;
  }
}
