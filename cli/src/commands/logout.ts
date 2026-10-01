import { deleteIdentity as deleteIdentityDefault } from '../identity/identity.js';
import { logoutDevice as logoutDeviceDefault } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';

export type LogoutDeps = {
  apiLogoutDevice?: typeof logoutDeviceDefault;
  deleteIdentity?: typeof deleteIdentityDefault;
};

/**
 * Retires this machine's credential. Order matters: the server-side device
 * row is deleted FIRST, and identity.json is only removed once that succeeds.
 * If the local file were cleared first and the server call then failed, the
 * user would hold no credential locally and no way to retry, since the file
 * that would let `logout` run again is already gone.
 *
 * A legacy credential (never linked via `token-derby login`) has no device
 * row — the server reports that plainly (`revoked: false`) rather than as an
 * error, and the local file is still cleared, since refusing to log the user
 * out because there was nothing to revoke would defeat the point of the command.
 *
 * A 401 means the server already considers this credential dead (e.g. it was
 * revoked from another machine or the web). Retrying can't fix that, so the
 * local file is cleared here too rather than leaving the user stuck with a
 * credential that will never work again.
 */
export async function logoutCommand(deps: LogoutDeps = {}): Promise<number> {
  const apiLogoutDevice = deps.apiLogoutDevice ?? logoutDeviceDefault;
  const deleteIdentity = deps.deleteIdentity ?? deleteIdentityDefault;

  try {
    const result = await apiLogoutDevice();
    if (result.revoked) {
      console.log("Revoked this device's credential on the server.");
    } else {
      console.log(
        'This machine is signed in with a legacy account credential (never linked via ' +
        '`token-derby login`), so there is no separate device credential to revoke.',
      );
    }
  } catch (e) {
    if (e instanceof ApiError && e.code === 'UNAUTHENTICATED') {
      console.error('This device credential was already invalid on the server — clearing it locally too.');
      await deleteIdentity();
      console.log('Removed local identity. You are signed out.');
      return 0;
    }
    if (e instanceof ApiError) {
      console.error(`Error: ${e.code} ${e.message}`);
      console.error('Local identity left in place — run `token-derby logout` again to retry.');
      return 1;
    }
    throw e;
  }

  await deleteIdentity();
  console.log('Removed local identity. You are signed out.');
  return 0;
}
