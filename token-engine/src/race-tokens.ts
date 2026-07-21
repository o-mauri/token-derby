import { MODEL_KEYS, type ModelKey } from '@token-derby/shared';
import { sumTokens, sumTokensByConversation, type TokenTotals } from './transcripts.js';
import { sumCodexTokens, sumCodexByConversation } from './codex.js';
import { sumGeminiTokens, sumGeminiByConversation } from './gemini.js';

/** Per-source reading for one beat: the two secondary scalars + the primary, per conversation. */
export type AllSources = {
  secondary: Record<ModelKey, number>; // scored scalar; only the 2 non-primary keys are meaningful
  primaryByConv: Map<string, number>;  // convId → scored value, for the primary source
};

/** A beat that could not be read. `stall` is a human-readable cause for the UI. */
export type StallReading = { stall: string };

/** The result of one scan: either usable numbers or a stall carrying its cause. */
export type BeatReading = AllSources | StallReading;

export function isStall(r: BeatReading): r is StallReading {
  return 'stall' in r;
}

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
 * the critical path — a genuine read failure stalls the whole beat and reports its
 * cause. The one exception is a MISSING home dir (ENOENT): choosing a primary CLI
 * you've never run means it has simply produced 0 tokens, so it reads as empty and
 * must NOT freeze the race. The two secondary sources are scalar and resilient: a
 * failure of any kind contributes 0.
 */
export async function readAllSources(
  race: { counts_input?: boolean },
  primary: ModelKey,
): Promise<BeatReading> {
  const primaryByConv = new Map<string, number>();
  try {
    const primaryMap = await BY_CONVERSATION_READERS[primary]();
    for (const [id, totals] of primaryMap) primaryByConv.set(id, scoreFor(race, totals));
  } catch (e: any) {
    // Absent home dir → treat as empty (0), never a stall. Any other error is a
    // real read failure → stall, and carry the cause so the UI can show it.
    if (e?.code !== 'ENOENT') {
      return { stall: `Can't read ${primary} token usage: ${e?.message ?? String(e)}` };
    }
  }

  const secondary: Record<ModelKey, number> = { claude: 0, codex: 0, gemini: 0 };
  await Promise.all(
    MODEL_KEYS.filter(k => k !== primary).map(async (k) => {
      secondary[k] = await SCALAR_READERS[k]().then(t => scoreFor(race, t)).catch(() => 0);
    }),
  );
  return { secondary, primaryByConv };
}
