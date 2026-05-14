import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { CLI_VERSION_HEADER } from '@token-derby/shared';

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
