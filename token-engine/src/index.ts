export * from './race-score.js';
export * from './race-tokens.js';
export * from './primary-cap.js';
export * from './heartbeat-loop.js';
export * from './transcripts.js';
export * from './codex.js';
export * from './gemini.js';
export * from './pool.js';
export * from './scan-cache.js';
export * from './scan-progress.js';
export * from './config.js';
export {
  setTranscriptDirs,
  claudeProjectsDir,
  codexSessionsDir,
  geminiTmpDir,
  setScanCacheDir,
  scanCacheDir,
  type TranscriptDirs,
} from './paths.js';

// CLI MAJOR.MINOR whose token-counting rules this engine implements. Bump when
// the engine's counting changes (the CLI package minor bumps in lockstep). Must
// stay >= the API's MIN_CLI_VERSION_DEFAULT: the desktop app sends this as its
// X-Cli-Version, so a value below the floor would fail every heartbeat.
export const RACING_COMPAT_VERSION = '2.12.4';
