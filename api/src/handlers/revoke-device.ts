import type { ApiHandler } from '../lib/http.js';
import type { DeleteDeviceResponse } from '@token-derby/shared';
import { resolveCaller } from '../lib/auth.js';
import { deleteDevice } from '../db/devices.js';
import { ok, err } from '../lib/http.js';

export const handler: ApiHandler = async (event) => {
  const auth = await resolveCaller(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const device_id = event.pathParameters?.device_id;
  if (!device_id) return err('BAD_REQUEST', 'device_id path parameter required');

  // deleteDevice is scoped to auth.user_id, so a device belonging to another
  // caller — or no device at all — is indistinguishable: both return false.
  const deleted = await deleteDevice(auth.user_id, device_id);
  if (!deleted) return err('DEVICE_NOT_FOUND', 'No such device');

  const response: DeleteDeviceResponse = { ok: true };
  return ok(response);
};
