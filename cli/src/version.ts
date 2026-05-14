import { createRequire } from 'node:module';

declare const __CLI_VERSION__: string | undefined;

function readVersion(): string {
  if (typeof __CLI_VERSION__ === 'string' && __CLI_VERSION__.length > 0) {
    return __CLI_VERSION__;
  }
  try {
    const req = createRequire(import.meta.url);
    const pkg = req('../package.json') as { version?: string };
    if (typeof pkg.version === 'string') return pkg.version;
  } catch {
    // fall through
  }
  return '0.0.0-dev';
}

export const CLI_VERSION: string = readVersion();
