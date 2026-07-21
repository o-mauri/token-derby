import { describe, it, expect, afterEach } from 'vitest';
import { setTranscriptDirs, claudeProjectsDir, codexSessionsDir, geminiTmpDir } from '../src/paths.js';

afterEach(() => setTranscriptDirs({ claude: undefined, codex: undefined, gemini: undefined } as any));

describe('transcript dir resolution', () => {
  it('uses an explicit override when set', () => {
    setTranscriptDirs({ claude: '/tmp/c', codex: '/tmp/x', gemini: '/tmp/g' });
    expect(claudeProjectsDir()).toBe('/tmp/c');
    expect(codexSessionsDir()).toBe('/tmp/x');
    expect(geminiTmpDir()).toBe('/tmp/g');
  });

  it('falls back to the env var then the home default', () => {
    setTranscriptDirs({ claude: undefined } as any);
    process.env.TOKEN_DERBY_CLAUDE_DIR = '/env/claude';
    expect(claudeProjectsDir()).toBe('/env/claude');
    delete process.env.TOKEN_DERBY_CLAUDE_DIR;
    expect(claudeProjectsDir()).toContain('.claude');
  });
});
