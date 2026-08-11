import * as path from 'node:path';
import { setTranscriptDirs, setScanCacheDir } from '@token-derby/token-engine';
import { homeDirFor, type Config } from '../config.js';

// Applies every engine-side setting the desktop Config owns. Called before each
// scan so a change saved in Settings mid-race takes effect on the next beat.
export function applyEngineConfig(cfg: Config): void {
  // setTranscriptDirs replaces its FULL override set on every call, so all
  // three keys must always be resolved and passed together — omitting one
  // would clear it rather than leave it untouched.
  setTranscriptDirs({
    claude: cfg.claudeDir ?? undefined,
    codex: cfg.codexDir ?? undefined,
    gemini: cfg.geminiDir ?? undefined,
  });
  // Keep the scan cache in the desktop's own home. Sharing the CLI's would make
  // each prune the other's entries on every save, leaving both always cold.
  setScanCacheDir(path.join(homeDirFor(cfg), 'scan-cache'));
}
