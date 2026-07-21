import { setTranscriptDirs } from '@token-derby/token-engine';
import type { Config } from '../config.js';

// setTranscriptDirs replaces its FULL override set on every call, so all
// three keys must always be resolved and passed together — omitting one
// would clear it rather than leave it untouched.
export function applyTranscriptDirs(cfg: Config): void {
  setTranscriptDirs({
    claude: cfg.claudeDir ?? undefined,
    codex: cfg.codexDir ?? undefined,
    gemini: cfg.geminiDir ?? undefined,
  });
}
