import type { Harness, HarnessKey } from './harness.js';
import { claudeCode } from './claude-code/index.js';
import { codexCli } from './codex-cli/index.js';
import { geminiCli } from './gemini-cli/index.js';

/**
 * The one place that knows which harnesses exist. The race, the join-time probe
 * and the UI all read this rather than keeping lists of their own.
 */
export const HARNESSES: Record<HarnessKey, Harness> = {
  'claude-code': claudeCode,
  'codex-cli': codexCli,
  'gemini-cli': geminiCli,
};

/** Every harness, in a stable order, so warnings always read the same way. */
export const HARNESS_KEYS = Object.keys(HARNESSES) as HarnessKey[];

export { type Harness, type HarnessKey } from './harness.js';
