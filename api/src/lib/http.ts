import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type { ErrorCode } from '@token-derby/shared';
import { ERROR_STATUS } from '@token-derby/shared';

// Handlers only ever read the event. Lambda passes context/callback too, but
// typing them in would force every test call site to supply stubs.
export type ApiHandler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyStructuredResultV2>;

export function ok<T>(body: T, status = 200): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function err(code: ErrorCode, message: string): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: ERROR_STATUS[code],
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, message }),
  };
}

export function parseJson<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
