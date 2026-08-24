import type { ApiHandler } from '../lib/http.js';
import type { RegisterDeviceRequest, RegisterDeviceResponse } from '@token-derby/shared';
import { validateDeviceLabel } from '@token-derby/shared';
import { ok, err, parseJson } from '../lib/http.js';
import { authenticate } from '../lib/auth.js';
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
 * Skipping browser approval is only defensible for that one caller. A legacy
 * caller hands over the account-level token and gets back something strictly
 * weaker — revocable on its own row, where the token it presented is not — so
 * there is no new authority to approve. A caller presenting a DEVICE credential
 * is the opposite case: what it presents is revocable and what it would receive
 * is a second row the first one's revocation does not touch, so a leaked
 * credential could outlive its own eviction and re-mint indefinitely. Hence the
 * device_label guard below: it holds the endpoint to the scope this docstring
 * can actually justify, which is also all `link` ever needs.
 *
 * `authenticate`, not `resolveCaller`: this registers the machine that made the
 * request, and a web session has no machine behind it to register.
 */
export const handler: ApiHandler = async (event) => {
  const caller = await authenticate(event);
  if ('error' in caller) return err('UNAUTHENTICATED', caller.error);

  // Set only on the device-credential path in `authenticate`, so its presence
  // is the whole test. Refused before the rate-limit charge: a caller this
  // endpoint is not for must not spend the budget `link` needs.
  if (caller.device_label) {
    return err(
      'BAD_REQUEST',
      'This machine already has its own device credential, so there is nothing to migrate. ' +
      'Revoking it is how it stops working; use `token-derby login` to add another machine.',
    );
  }

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
