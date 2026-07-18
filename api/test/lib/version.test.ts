import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { readClient, readClientVersion, meetsMinimumVersion } from '../../src/lib/version.js';

function ev(headers: Record<string, string>): APIGatewayProxyEventV2 {
  return { headers } as unknown as APIGatewayProxyEventV2;
}

describe('client-aware version gate', () => {
  it('treats a missing x-client as cli and reads x-cli-version', () => {
    const e = ev({ 'x-cli-version': '2.12.2' });
    expect(readClient(e)).toBe('cli');
    expect(readClientVersion(e)).toBe('2.12.2');
    expect(meetsMinimumVersion('cli', '2.12.2')).toBe(true);
    expect(meetsMinimumVersion('cli', '2.0.0')).toBe(false);
  });

  it('reads desktop client + x-client-version and gates on desktop minimum', () => {
    const e = ev({ 'x-client': 'desktop', 'x-client-version': '0.1.0' });
    expect(readClient(e)).toBe('desktop');
    expect(readClientVersion(e)).toBe('0.1.0');
    expect(meetsMinimumVersion('desktop', '0.1.0')).toBe(true);
    expect(meetsMinimumVersion('desktop', '0.0.9')).toBe(false);
  });
});
