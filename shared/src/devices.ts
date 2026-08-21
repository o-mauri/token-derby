import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from './constants.js';

// RFC 8628 device flow. device_code is the long secret the CLI polls with;
// user_code is the short code a human types at verification_uri.
export const CLI_AUTH_TTL_SECONDS = 600;
export const CLI_AUTH_POLL_INTERVAL_SECONDS = 5;

/**
 * Canonicalise a hand-typed user_code: uppercase, whitespace and dashes
 * stripped. Shared by the api handler and the /cli page so the two never
 * drift on which characters count.
 */
export function normaliseUserCode(raw: string): string | null {
  const cleaned = raw.replace(/[\s-]/g, '').toUpperCase();
  if (cleaned.length !== JOIN_CODE_LENGTH) return null;
  for (const ch of cleaned) {
    if (!JOIN_CODE_ALPHABET.includes(ch)) return null;
  }
  return cleaned;
}

export type CliAuthStartRequest = {
  label: string;
};

export type CliAuthStartResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
  expires_in: number;
};

export type CliAuthApproveRequest = {
  user_code: string;
  /** Resolve the code and return its label WITHOUT approving anything. */
  preview?: boolean;
};

/** The label the CLI sent at /start, so the page can show what is being approved. */
export type CliAuthApproveResponse = {
  label: string;
};

export type CliAuthPollRequest = {
  device_code: string;
};

/** Not yet approved — also the answer for an unknown or over-limit device_code. */
export type CliAuthPollPendingResponse = {
  status: 'pending';
};

/**
 * horses/orgs are counts, not lists: enough for the CLI's confirm prompt
 * ("Omar (7 horses, 2 orgs)") without shipping a stable/membership dump over
 * an unauthenticated polling endpoint.
 *
 * device_id lets the CLI revoke the credential it is about to receive if the
 * user declines the confirm prompt — the device row already exists server-side
 * by the time this response is sent.
 *
 * email is optional: a legacy account that has never linked a Google identity
 * has none, and the CLI's confirm prompt must degrade gracefully rather than
 * print "undefined".
 */
export type CliAuthPollApprovedResponse = {
  status: 'approved';
  user_id: string;
  secret_token: string;
  device_id: string;
  display_name: string;
  email?: string;
  horses: number;
  orgs: number;
};

export type CliAuthPollResponse = CliAuthPollPendingResponse | CliAuthPollApprovedResponse;

/** A device credential as shown to its owner — deliberately no token or hash. */
export type DeviceRecord = {
  device_id: string;
  label: string;
  created_at: string;
  last_seen_at: string;
};

export type ListDevicesResponse = {
  devices: DeviceRecord[];
};

export type DeleteDeviceResponse = {
  ok: true;
};

/**
 * Response for DELETE /devices/me — deletes whichever device row authenticated
 * the request, resolved server-side from the credential itself. `revoked: false`
 * means the credential was a legacy account-level token with no device row to
 * delete, not an error.
 */
export type LogoutDeviceResponse = {
  revoked: boolean;
};
