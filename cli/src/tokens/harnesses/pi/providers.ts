// Which model family a Pi provider's tokens belong to.
//
// Pi is the first harness that can run models from several vendors, which is
// why harness and family are separate concepts at all. Most of its ~35
// providers serve none of the families we score; a few serve exactly one; and a
// handful are gateways that can serve any of them.

import type { ModelFamily } from '@token-derby/shared';

/**
 * Providers that serve exactly one vendor, so the provider id alone settles it.
 * Azure is OpenAI-only by definition, which is what makes it safe here even
 * though its model ids are arbitrary deployment names.
 */
const DIRECT: Record<string, ModelFamily> = {
  anthropic: 'anthropic',
  openai: 'openai',
  'azure-openai-responses': 'openai',
  google: 'google',
};

/**
 * Providers that can route to several vendors. Their model ids would have to be
 * matched against vendor patterns to tell which — and some cannot be matched at
 * all: a Bedrock application inference profile is an ARN naming no vendor, and
 * an Azure deployment name is whatever someone typed. Rather than guess, these
 * are reported as uncounted so the player knows why.
 */
const GATEWAYS = new Set([
  'amazon-bedrock',
  'openrouter',
  'cloudflare-ai-gateway',
  'vercel-ai-gateway',
  'radius',
]);

export type Resolution =
  | { kind: 'family'; family: ModelFamily }
  /** Serves families we score, but we cannot yet tell which. */
  | { kind: 'gateway'; provider: string }
  /** Serves none of the families we score. */
  | { kind: 'other'; provider: string };

export function resolveProvider(provider: string): Resolution {
  const normalised = provider.trim().toLowerCase();
  const family = DIRECT[normalised];
  if (family) return { kind: 'family', family };
  if (GATEWAYS.has(normalised)) return { kind: 'gateway', provider: normalised };
  return { kind: 'other', provider: normalised };
}

/** One line per uncounted provider, explaining which kind of gap it is. */
export function describeUncounted(uncounted: Iterable<Resolution>): string[] {
  const gateways = new Set<string>();
  const others = new Set<string>();
  for (const r of uncounted) {
    if (r.kind === 'gateway') gateways.add(r.provider);
    else if (r.kind === 'other') others.add(r.provider);
  }
  const lines: string[] = [];
  if (gateways.size > 0) {
    lines.push(
      `Pi usage on ${[...gateways].sort().join(', ')} not counted — ` +
      `can serve models we score, but not yet identifiable.`,
    );
  }
  if (others.size > 0) {
    lines.push(
      `Pi usage on ${[...others].sort().join(', ')} not counted — ` +
      `not one of the model families we score.`,
    );
  }
  return lines;
}
