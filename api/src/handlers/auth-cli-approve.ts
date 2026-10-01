import type { ApiHandler } from '../lib/http.js';
import type { CliAuthApproveRequest, CliAuthApproveResponse } from '@token-derby/shared';
import { normaliseUserCode } from '@token-derby/shared';
import { ok, err, parseJson } from '../lib/http.js';
import { resolveCaller } from '../lib/auth.js';
import { generateSecretToken } from '../lib/codes.js';
import { putDevice, deleteDevice } from '../db/devices.js';
import { recordAttempt, CLI_APPROVE_BUCKET, CLI_APPROVE_LIMIT } from '../db/rate-limits.js';
import {
  getCliAuthRequest,
  getCliAuthRequestByUserCode,
  approveCliAuthRequest,
  CliAuthRequestNotPendingError,
} from '../db/cli-auth-requests.js';

// Unknown, malformed, expired and already-approved codes all answer with this
// one message: which of those a code is tells a prober something, and none of
// them is actionable for the person who mistyped.
const NOT_FOUND_MESSAGE = 'That code is not valid — it may have expired or already been used';

/**
 * Did our approval actually land? true = the row carries our token, so the write
 * is durable. false = the row is present and does not, so it did not. null =
 * cannot tell, which happens when the row is already gone: either a poll
 * consumed it (the credential is live and must not be deleted) or its ttl
 * lapsed. Ambiguity is resolved towards keeping the device row, because a
 * deleted-but-collected token breaks the login irrecoverably while an orphan row
 * is one revoke away in the account view.
 */
async function approvalLanded(device_code: string, token: string): Promise<boolean | null> {
  try {
    const row = await getCliAuthRequest(device_code);
    if (!row) return null;
    return row.issued_token === token;
  } catch (readError) {
    console.error('cli approve: could not confirm whether the approval landed', { device_code, error: readError });
    return null;
  }
}

/**
 * Mints a device credential onto the caller's own jockey, or with `preview`
 * resolves the code and returns its label without writing anything. The ordering
 * below is the security boundary: the caller is resolved before the table is
 * touched, every candidate code is charged before it is looked up, and the
 * link-target check runs before any credential exists — preview included, so a
 * look costs the same and reveals no more than an approval would.
 */
export const handler: ApiHandler = async (event) => {
  const caller = await resolveCaller(event);
  if ('error' in caller) return err('UNAUTHENTICATED', caller.error);
  // Approval is a browser act by design — the human typing the code is what
  // proves they are looking at the terminal that asked. Accepting a CLI
  // credential here would open a second path that skips that proof.
  if (caller.source !== 'web') {
    return err('UNAUTHENTICATED', 'Sign in on the web to approve a device');
  }

  const body = parseJson<CliAuthApproveRequest>(event.body);
  if (!body || typeof body.user_code !== 'string') {
    return err('BAD_REQUEST', 'user_code is required');
  }
  // Fail closed rather than coercing: `preview: 'true'` read as falsy would mint
  // a real credential for a caller who asked only to look.
  if (body.preview !== undefined && typeof body.preview !== 'boolean') {
    return err('BAD_REQUEST', 'preview must be a boolean');
  }
  const preview = body.preview === true;
  const user_code = normaliseUserCode(body.user_code);
  if (!user_code) return err('CLI_AUTH_NOT_FOUND', NOT_FOUND_MESSAGE);

  // Charged before the lookup, and keyed on the caller's own user_id because
  // this endpoint is authenticated — a real identity rather than a spoofable IP.
  // Being over budget is a hard stop even for a correct guess: 6 characters over
  // a 32-character alphabet is ~30 bits, so without a throttle an authenticated
  // prober could walk the space for a live unlinked code inside its 600s life
  // and land somebody else's CLI on their own jockey.
  const attempts = await recordAttempt(CLI_APPROVE_BUCKET, caller.user_id);
  if (attempts > CLI_APPROVE_LIMIT) {
    return err('RATE_LIMITED', 'Too many device approval attempts. Try again later.');
  }

  const pending = await getCliAuthRequestByUserCode(user_code);
  if (!pending || pending.status !== 'pending') {
    return err('CLI_AUTH_NOT_FOUND', NOT_FOUND_MESSAGE);
  }

  // The attack this endpoint exists to stop: a request started by a CLI that
  // already holds someone else's identity, approved by whoever can be talked
  // into typing the code. Refuse before anything is minted.
  if (pending.link_to_user_id !== undefined && pending.link_to_user_id !== caller.user_id) {
    return err('CLI_AUTH_WRONG_ACCOUNT', 'That code was started on a machine signed in as a different account');
  }

  const response: CliAuthApproveResponse = { label: pending.label };

  // The /cli page shows the label BEFORE the user approves, so they have a
  // second thing to compare against their terminal. That read has already paid
  // the rate limit and cleared the wrong-account check above — a preview that
  // skipped either would be a free probe and an ownership oracle. It writes
  // nothing: no token, no device row, no change to the pending row.
  if (preview) return ok(response);

  // The authenticated session is the identity — link_to_user_id has been proven
  // equal to it above, so it is never the value written.
  const user_id = caller.user_id;
  const token = generateSecretToken();
  const device = await putDevice({ user_id, token, label: pending.label });

  try {
    await approveCliAuthRequest({
      device_code: pending.device_code, issued_token: token, user_id, device_id: device.device_id,
    });
  } catch (e) {
    // An error here does NOT mean the write was not applied. DynamoDB can apply
    // the transaction and lose the acknowledgement; the SDK then retries, and
    // because there is no ClientRequestToken the retry is a fresh transaction
    // whose `#status = :pending` condition now fails — arriving here as
    // CliAuthRequestNotPendingError with the approval already durable. Deleting
    // the device row on that path would hand the CLI a token with no device
    // behind it, which is the broken-login failure that ruled out reordering.
    // So roll back only on POSITIVE evidence the write did not land.
    const landed = await approvalLanded(pending.device_code, token);
    if (landed === false) {
      try {
        await deleteDevice(user_id, device.device_id);
      } catch (cleanupError) {
        console.error('cli approve: failed to roll back stranded device row', {
          user_id, device_id: device.device_id, error: cleanupError,
        });
      }
    }
    // Our own token is on the row: the approval is durable and the device row
    // exists, so this succeeded and only the acknowledgement was lost.
    if (landed === true) return ok(response);
    // Lost a race with a concurrent approval, or the row expired between the
    // read above and the write. Either way the caller sees one credential or none.
    if (e instanceof CliAuthRequestNotPendingError) return err('CLI_AUTH_NOT_FOUND', NOT_FOUND_MESSAGE);
    throw e;
  }

  return ok(response);
};
