import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { CLI_VERSION_HEADER, CLIENT_HEADER, CLIENT_VERSION_HEADER, gteSemver, type ClientId } from '@token-derby/shared';

export const MIN_CLI_VERSION_DEFAULT = '2.10.0';
export const MIN_DESKTOP_VERSION_DEFAULT = '0.1.0';

// API Gateway lowercases header names, but be defensive.
function header(event: APIGatewayProxyEventV2, name: string): string | undefined {
  const h = event.headers ?? {};
  for (const k of Object.keys(h)) {
    if (k.toLowerCase() === name) {
      const v = h[k];
      return typeof v === 'string' ? v.trim() : undefined;
    }
  }
  return undefined;
}

export function readCliVersion(event: APIGatewayProxyEventV2): string | undefined {
  return header(event, CLI_VERSION_HEADER);
}

export function minCliVersion(): string {
  return process.env.TOKEN_DERBY_MIN_CLI_VERSION ?? MIN_CLI_VERSION_DEFAULT;
}

export function meetsMinimumCliVersion(cli_version: string): boolean {
  return gteSemver(cli_version, minCliVersion());
}

export function readClient(event: APIGatewayProxyEventV2): ClientId {
  return header(event, CLIENT_HEADER) === 'desktop' ? 'desktop' : 'cli';
}

export function readClientVersion(event: APIGatewayProxyEventV2): string | undefined {
  return readClient(event) === 'desktop'
    ? header(event, CLIENT_VERSION_HEADER)
    : readCliVersion(event);
}

export function minDesktopVersion(): string {
  return process.env.TOKEN_DERBY_MIN_DESKTOP_VERSION ?? MIN_DESKTOP_VERSION_DEFAULT;
}

export function meetsMinimumVersion(client: ClientId, version: string): boolean {
  return client === 'desktop'
    ? gteSemver(version, minDesktopVersion())
    : gteSemver(version, minCliVersion());
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
