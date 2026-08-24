import type { ApiHandler } from '../lib/http.js';
import type { RegisterDeviceRequest, RegisterDeviceResponse } from '@token-derby/shared';
import { ok, err, parseJson } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
import { validateDeviceLabel } from '../lib/device-label.js';
import { generateSecretToken } from '../lib/codes.js';
import { putDevice } from '../db/devices.js';
import { recordAttempt, DEVICE_REGISTER_BUCKET, DEVICE_REGISTER_LIMIT } from '../db/rate-limits.js';

/**
 * Mints a device credential for the machine that asked, without the browser leg
 * the device-code flow uses. `token-derby link` calls this to finish the
 * migration: a legacy machine is running on the account-level token, which is
 * shared across every machine and cannot be revoked per-machine, and rotating
 * it would kill the others.
 *
 * It grants no new authority, which is worth stating because the missing
 * browser approval invites a second look. The caller must already present a
 * working CLI credential, and what they get back is STRICTLY LESS powerful: a
 * device credential is revocable on its own row, where the legacy account-level
 * one is not. Anyone who can reach this already holds something better than
 * what it hands out. Browser approval exists in the device-code flow to prove a
 * human is present and that the machine is theirs — a caller presenting a valid
 * credential has already established both.
 *
 * `authenticate`, not `resolveCaller`: this registers the machine that made the
 * request, and a web session has no machine behind it to register.
 */
export const handler: ApiHandler = async (event) => {
  const caller = await authenticate(event);
  if ('error' in caller) return err('UNAUTHENTICATED', caller.error);

  const body = parseJson<RegisterDeviceRequest>(event.body);
  const validated = validateDeviceLabel(body?.label);
  if (!validated.ok) return err('BAD_REQUEST', validated.message);

  // Charged after the label check and before the write, matching
  // auth-cli-start: a rejected label writes nothing, so it must not spend the
  // budget the honest retry needs, and an over-budget caller must get no row.
  const attempts = await recordAttempt(DEVICE_REGISTER_BUCKET, caller.user_id);
  if (attempts > DEVICE_REGISTER_LIMIT) {
    return err('RATE_LIMITED', 'Too many device registrations. Try again later.');
  }

  const secret_token = generateSecretToken();
  const device = await putDevice({ user_id: caller.user_id, token: secret_token, label: validated.label });

  const response: RegisterDeviceResponse = { device_id: device.device_id, secret_token };
  return ok(response);
};
