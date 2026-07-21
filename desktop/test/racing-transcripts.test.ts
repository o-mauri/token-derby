import { describe, it, expect, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { claudeProjectsDir, codexSessionsDir, geminiTmpDir } from '@token-derby/token-engine';
import { DEFAULT_CONFIG, type Config } from '../electron/config.js';

const { applyTranscriptDirs } = await import('../electron/racing/transcripts.js');

// Reset the engine's module-level override to defaults after each test so
// tests don't leak state into one another.
afterEach(() => {
  applyTranscriptDirs(DEFAULT_CONFIG);
});

describe('applyTranscriptDirs', () => {
  it('an explicit claudeDir override makes claudeProjectsDir() return it', () => {
    const cfg = { ...DEFAULT_CONFIG, claudeDir: '/tmp/custom-claude' } as Config;
    applyTranscriptDirs(cfg);
    expect(claudeProjectsDir()).toBe('/tmp/custom-claude');
  });

  it('a blank/undefined override falls back to the engine default', () => {
    applyTranscriptDirs(DEFAULT_CONFIG);
    expect(claudeProjectsDir()).toBe(path.join(os.homedir(), '.claude', 'projects'));
  });

  it('resolves all three dirs (claude, codex, gemini) on every call', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      claudeDir: '/tmp/c',
      codexDir: '/tmp/x',
      geminiDir: '/tmp/g',
    } as Config;
    applyTranscriptDirs(cfg);
    expect(claudeProjectsDir()).toBe('/tmp/c');
    expect(codexSessionsDir()).toBe('/tmp/x');
    expect(geminiTmpDir()).toBe('/tmp/g');
  });

  it('a later call without overrides clears the previous ones (full-replace semantics)', () => {
    applyTranscriptDirs({ ...DEFAULT_CONFIG, claudeDir: '/tmp/c' } as Config);
    expect(claudeProjectsDir()).toBe('/tmp/c');

    applyTranscriptDirs(DEFAULT_CONFIG);
    expect(claudeProjectsDir()).toBe(path.join(os.homedir(), '.claude', 'projects'));
  });
});
