import type { ApiHandler } from '../lib/http.js';
import type { DeviceRecord, ListDevicesResponse } from '@token-derby/shared';
import { resolveCaller } from '../lib/auth.js';
import { listDevices } from '../db/devices.js';
import { ok, err } from '../lib/http.js';

export const handler: ApiHandler = async (event) => {
  const auth = await resolveCaller(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const rows = await listDevices(auth.user_id);
  // Mapped field-by-field, not passed through: the db row is structurally
  // assignable to DeviceRecord but that only checks the fields declared
  // here, not the fields actually present — a field added to the db
  // record later must not reach the wire just by being assignable.
  const devices: DeviceRecord[] = rows.map((d) => ({
    device_id: d.device_id,
    label: d.label,
    created_at: d.created_at,
    last_seen_at: d.last_seen_at,
  }));
  const response: ListDevicesResponse = { devices };
  return ok(response);
};
