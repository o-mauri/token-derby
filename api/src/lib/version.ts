import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { CLI_VERSION_HEADER, gteSemver } from '@token-derby/shared';

export const MIN_CLI_VERSION_DEFAULT = '1.1.0';

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
