import { count } from '../../../src/tokens/harnesses/engine.js';
import type { Harness, TokenTotals } from '../../../src/tokens/harnesses/harness.js';

/**
 * A harness's whole total across every family. Production reads per family and
 * per conversation, so this lives in the tests rather than shipping unused.
 */
export async function totalOf(harness: Harness): Promise<TokenTotals> {
  const { byFamily } = await count(harness);
  let input = 0;
  let output = 0;
  for (const conversations of byFamily.values()) {
    for (const t of conversations.values()) { input += t.input; output += t.output; }
  }
  return { input, output };
}

/**
 * One harness's conversations for a family, with the engine's harness prefix
 * stripped so tests can assert on the id the harness itself produced.
 */
export async function conversationsOf(harness: Harness, family: string): Promise<Map<string, TokenTotals>> {
  const { byFamily } = await count(harness);
  const out = new Map<string, TokenTotals>();
  for (const [id, totals] of byFamily.get(family as any) ?? new Map()) {
    out.set(id.replace(`${harness.id}:`, ''), totals);
  }
  return out;
}
