import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { CLI_VERSION_HEADER, gteSemver } from '@token-derby/shared';

export const MIN_CLI_VERSION_DEFAULT = '4.0.0';

// The release before the CLI began restating its previous beat with the next. Any
// CLI newer than it sends that ledger, so a beat from one is checked against it,
// and one without it is a process's first.
export const LAST_LEDGERLESS_CLI_VERSION = '4.0.0';

export const sendsLedger = (cli_version: string): boolean =>
  gteSemver(cli_version, LAST_LEDGERLESS_CLI_VERSION) && !gteSemver(LAST_LEDGERLESS_CLI_VERSION, cli_version);


export function readCliVersion(event: APIGatewayProxyEventV2): string | undefined {
  const h = event.headers ?? {};
  // API Gateway lowercases header names, but be defensive.
  for (const k of Object.keys(h)) {
    if (k.toLowerCase() === CLI_VERSION_HEADER) {
      const v = h[k];
      return typeof v === 'string' ? v.trim() : undefined;
    }
  }
  return undefined;
}

export function minCliVersion(): string {
  return process.env.TOKEN_DERBY_MIN_CLI_VERSION ?? MIN_CLI_VERSION_DEFAULT;
}

export function meetsMinimumCliVersion(cli_version: string): boolean {
  return gteSemver(cli_version, minCliVersion());
}

// Single source of truth for the "your CLI is too old" message. Always
// suggests `token-derby update` (added in 2.4.0) so users can fix it with
// one keystroke instead of remembering the npm incantation.
export function versionMismatchMessage(): string {
  return (
    `This API requires token-derby v${minCliVersion()} or newer. ` +
    'Run `token-derby update` to install the latest.'
  );
}
