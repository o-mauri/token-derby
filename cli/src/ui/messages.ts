/** What to say when the server rejects this machine's stored credential.
 *  Shared so every read-only command names the same cause and next step
 *  rather than printing a bare `UNAUTHENTICATED`. */
export const CREDENTIAL_DEAD_MESSAGE =
  "This machine's credential is no longer valid on the server — it may have been revoked.\n" +
  'Run `token-derby login` to sign this machine in again.';
