import { sumTokensForRace } from './transcripts.js';
import { sumGeminiTokens } from './gemini.js';
import { sampleModalTokens } from './modal.js';
import type { TokenTotals } from './transcripts.js';

// Apply the race's token mode to a source: input+output when the race counts
// input, otherwise output only. Mirrors transcripts.ts/sumTokensForRace.
function scoreFor(race: { counts_input?: boolean }, t: TokenTotals): number {
  return race.counts_input ? t.input + t.output : t.output;
}

/**
 * The full race reading: real Claude Code tokens (including subagent and
 * dynamic-workflow runs) plus real Gemini CLI and self-hosted vLLM (Modal)
 * usage, all in the race's chosen mode.
 *
 * The Claude scan is the critical path and stays fail-loud — if it throws, the
 * caller treats the beat as "no reading". Gemini and Modal are additive and
 * resilient: a missing Gemini dir or a sleeping Modal server contributes 0
 * rather than stalling the whole heartbeat.
 */
export async function sumRaceReading(race: { counts_input?: boolean }): Promise<number> {
  const claude = await sumTokensForRace(race); // throws on disk failure (fail-loud, by design)
  const [gemini, modal] = await Promise.all([
    sumGeminiTokens().then(t => scoreFor(race, t)).catch(() => 0),
    sampleModalTokens().then(t => scoreFor(race, t)).catch(() => 0),
  ]);
  return claude + gemini + modal;
}
