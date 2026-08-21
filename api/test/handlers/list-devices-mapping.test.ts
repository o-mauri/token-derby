import { describe, it, expect, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// Mocks the whole db/devices module so listDevices can be made to return a
// row carrying a field the shared DeviceRecord does not declare — proving
// the handler maps fields explicitly rather than passing db rows through.
vi.mock('../../src/db/devices.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/devices.js')>(
    '../../src/db/devices.js',
  );
  return { ...actual, listDevices: vi.fn() };
});

import { handler as listDevicesHandler } from '../../src/handlers/list-devices.js';
import { listDevices } from '../../src/db/devices.js';
import { makeUser, authHeaders } from '../helpers/auth-helper.js';

function listEvent(headers: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /api/devices',
    rawPath: '/api/devices',
    rawQueryString: '',
    headers: { 'content-type': 'application/json', ...headers },
    requestContext: {} as any,
    isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

describe('list-devices field mapping', () => {
  it('does not forward a field the shared DeviceRecord does not declare', async () => {
    const user = await makeUser('MappingFilterUser');
    vi.mocked(listDevices).mockResolvedValueOnce([
      {
        device_id: 'd1',
        label: 'leaky-row',
        created_at: '2024-01-01T00:00:00.000Z',
        last_seen_at: '2024-01-01T00:00:00.000Z',
        token_hash: 'should-not-reach-the-wire',
      } as any,
    ]);

    const res: any = await listDevicesHandler(listEvent(authHeaders(user)));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.devices).toHaveLength(1);
    expect(body.devices[0]).not.toHaveProperty('token_hash');
    expect(Object.keys(body.devices[0]).sort()).toEqual(
      ['created_at', 'device_id', 'label', 'last_seen_at'].sort(),
    );
  });
});
