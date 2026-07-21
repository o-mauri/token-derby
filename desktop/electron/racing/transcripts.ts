import { setTranscriptDirs } from '@token-derby/token-engine';
import type { Config } from '../config.js';

// M1's Config doesn't have claudeDir/codexDir/geminiDir yet (added by a
// later task) — read them defensively so they resolve to undefined until
// then, which just means the engine falls back to its env/home default.
type TranscriptOverrideFields = { claudeDir?: string; codexDir?: string; geminiDir?: string };

// setTranscriptDirs replaces its FULL override set on every call, so all
// three keys must always be resolved and passed together — omitting one
// would clear it rather than leave it untouched.
export function applyTranscriptDirs(cfg: Config): void {
  const overrides = cfg as Config & TranscriptOverrideFields;
  setTranscriptDirs({
    claude: overrides.claudeDir ?? undefined,
    codex: overrides.codexDir ?? undefined,
    gemini: overrides.geminiDir ?? undefined,
  });
}
