import type { ModelKey } from '@token-derby/shared';
import type { TokenCounter } from './counter.js';
import { ClaudeCounter } from './claude.js';
import { CodexCounter } from './codex.js';
import { GeminiCounter } from './gemini.js';

/**
 * The one place that knows which counters exist. Adding an agent means adding a
 * file here and a key to ModelKey — the race, the join-time probe and the UI all
 * read this registry rather than keeping lists of their own.
 */
export const COUNTERS: Record<ModelKey, TokenCounter> = {
  claude: new ClaudeCounter(),
  codex: new CodexCounter(),
  gemini: new GeminiCounter(),
};

export { TokenCounter, type TokenTotals, type SourceProbe } from './counter.js';
