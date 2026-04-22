import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ErrorCode } from '@token-derby/shared';
import { ERROR_STATUS } from '@token-derby/shared';

export function ok<T>(body: T, status = 200): APIGatewayProxyResultV2 {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function err(code: ErrorCode, message: string): APIGatewayProxyResultV2 {
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
