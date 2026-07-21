export * from './race-score.js';
export * from './race-tokens.js';
export * from './primary-cap.js';
export * from './heartbeat-loop.js';
export * from './transcripts.js';
export * from './codex.js';
export * from './gemini.js';
export { setTranscriptDirs, claudeProjectsDir, codexSessionsDir, geminiTmpDir, type TranscriptDirs } from './paths.js';

// CLI MAJOR.MINOR whose token-counting rules this engine implements. Bump when
// the engine's counting changes (the CLI package minor bumps in lockstep).
export const RACING_COMPAT_VERSION = '2.12.1';
