import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { homeDir, claudeProjectsDir } from '../src/paths.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-paths-'));
  process.env.TOKEN_DERBY_BASE = tmp;
  delete process.env.TOKEN_DERBY_HOME;
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_BASE;
  delete process.env.TOKEN_DERBY_HOME;
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('homeDir precedence', () => {
  it('TOKEN_DERBY_HOME hard-overrides the base directory', () => {
    process.env.TOKEN_DERBY_HOME = '/custom/home';
    expect(homeDir()).toBe('/custom/home');
  });

  it('resolves to <base>/.token-derby', () => {
    expect(homeDir()).toBe(path.join(tmp, '.token-derby'));
  });
});

describe('claudeProjectsDir precedence', () => {
  beforeEach(() => {
    delete process.env.TOKEN_DERBY_CLAUDE_DIR;
    delete process.env.CLAUDE_CONFIG_DIR;
  });

  afterEach(() => {
    delete process.env.TOKEN_DERBY_CLAUDE_DIR;
    delete process.env.CLAUDE_CONFIG_DIR;
  });

  it('defaults to ~/.claude/projects when nothing is set', () => {
    expect(claudeProjectsDir()).toBe(path.join(os.homedir(), '.claude', 'projects'));
  });

  it('follows CLAUDE_CONFIG_DIR, which relocates the whole Claude Code config', () => {
    process.env.CLAUDE_CONFIG_DIR = '/relocated/claude';
    expect(claudeProjectsDir()).toBe(path.join('/relocated/claude', 'projects'));
  });

  it('TOKEN_DERBY_CLAUDE_DIR hard-overrides CLAUDE_CONFIG_DIR', () => {
    process.env.CLAUDE_CONFIG_DIR = '/relocated/claude';
    process.env.TOKEN_DERBY_CLAUDE_DIR = '/explicit/projects';
    expect(claudeProjectsDir()).toBe('/explicit/projects');
  });

  it('ignores an empty CLAUDE_CONFIG_DIR rather than reading the filesystem root', () => {
    process.env.CLAUDE_CONFIG_DIR = '';
    expect(claudeProjectsDir()).toBe(path.join(os.homedir(), '.claude', 'projects'));
  });
});
