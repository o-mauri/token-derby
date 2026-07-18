import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type EnvName = 'prod' | 'staging';

export type Config = {
  env: EnvName;
  apiBaseOverride: string | null;
  homeOverride: string | null;
  launchAtLogin: boolean;
};

// Mirrors cli/src/config.ts's ENVIRONMENTS map — same two server environments.
export const ENVIRONMENTS: Record<EnvName, { apiBase: string }> = {
  prod: { apiBase: 'https://token-derby.mauricode.co.uk/api' },
  staging: { apiBase: 'https://token-derby-staging.mauricode.co.uk/api' },
};

// Desktop defaults to staging so onboarding/CRUD during development never
// touches prod data. Users can switch to prod from Settings once this is
// ready to ship.
export const DEFAULT_CONFIG: Config = {
  env: 'staging',
  apiBaseOverride: null,
  homeOverride: null,
  launchAtLogin: false,
};

// Fixed location for config.json itself — independent of any homeOverride
// stored inside it (that override only relocates identity storage).
// Overridable via TOKEN_DERBY_DESKTOP_HOME for tests.
function baseAppHomeDir(): string {
  return (
    process.env.TOKEN_DERBY_DESKTOP_HOME ??
    path.join(os.homedir(), 'Library', 'Application Support', 'token-derby-desktop')
  );
}

function configFilePath(): string {
  return path.join(baseAppHomeDir(), 'config.json');
}

export function loadConfig(): Config {
  try {
    const raw = readFileSync(configFilePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<Config>;
    return {
      env: parsed.env === 'prod' || parsed.env === 'staging' ? parsed.env : DEFAULT_CONFIG.env,
      apiBaseOverride: typeof parsed.apiBaseOverride === 'string' ? parsed.apiBaseOverride : null,
      homeOverride: typeof parsed.homeOverride === 'string' ? parsed.homeOverride : null,
      launchAtLogin:
        typeof parsed.launchAtLogin === 'boolean' ? parsed.launchAtLogin : DEFAULT_CONFIG.launchAtLogin,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(patch: Partial<Config>): Config {
  const next = { ...loadConfig(), ...patch };
  mkdirSync(baseAppHomeDir(), { recursive: true });
  writeFileSync(configFilePath(), JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}

export function resolveApiBase(cfg: Config): string {
  return cfg.apiBaseOverride ?? ENVIRONMENTS[cfg.env].apiBase;
}

// Effective home dir for per-env identity storage. A user-set homeOverride
// wins over the default app-support directory.
export function homeDirFor(cfg: Config): string {
  return cfg.homeOverride ?? baseAppHomeDir();
}
