import type { TokenCounter, TokenTotals } from '../../../src/tokens/counters/counter.js';

/**
 * A counter's whole-source total. Production only ever reads per conversation,
 * so this lives in the tests rather than shipping an unused code path.
 */
export async function totalOf(counter: TokenCounter): Promise<TokenTotals> {
  let input = 0;
  let output = 0;
  for (const t of (await counter.byConversation()).values()) {
    input += t.input;
    output += t.output;
  }
  return { input, output };
}
