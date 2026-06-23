import { MODEL_KEYS, type ModelKey } from '@token-derby/shared';
import { sumTokens, sumTokensByConversation, type TokenTotals } from './transcripts.js';
import { sumCodexTokens, sumCodexByConversation } from './codex.js';
import { sumGeminiTokens, sumGeminiByConversation } from './gemini.js';

/** Per-source reading for one beat: the two secondary scalars + the primary, per conversation. */
export type AllSources = {
  secondary: Record<ModelKey, number>; // scored scalar; only the 2 non-primary keys are meaningful
  primaryByConv: Map<string, number>;  // convId → scored value, for the primary source
};

const SCALAR_READERS: Record<ModelKey, () => Promise<TokenTotals>> = {
  claude: sumTokens,
  codex: sumCodexTokens,
  gemini: sumGeminiTokens,
};

const BY_CONVERSATION_READERS: Record<ModelKey, () => Promise<Map<string, TokenTotals>>> = {
  claude: sumTokensByConversation,
  codex: sumCodexByConversation,
  gemini: sumGeminiByConversation,
};

/** Collapse a source's totals to a single number in the race's mode. */
export function scoreFor(race: { counts_input?: boolean }, t: TokenTotals): number {
  return race.counts_input ? t.input + t.output : t.output;
}

/**
 * Read all sources for a beat. The PRIMARY source is read per-conversation and is
 * the critical path — if its reader throws, the whole beat is a stall (null). The
 * two secondary sources are scalar and resilient: a failure contributes 0.
 */
export async function readAllSources(
  race: { counts_input?: boolean },
  primary: ModelKey,
): Promise<AllSources | null> {
  try {
    const primaryMap = await BY_CONVERSATION_READERS[primary](); // throws → caught → null
    const primaryByConv = new Map<string, number>();
    for (const [id, totals] of primaryMap) primaryByConv.set(id, scoreFor(race, totals));

    const secondary: Record<ModelKey, number> = { claude: 0, codex: 0, gemini: 0 };
    await Promise.all(
      MODEL_KEYS.filter(k => k !== primary).map(async (k) => {
        secondary[k] = await SCALAR_READERS[k]().then(t => scoreFor(race, t)).catch(() => 0);
      }),
    );
    return { secondary, primaryByConv };
  } catch {
    return null;
  }
}
