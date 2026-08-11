// Single source of truth for the CLI version strings used across API tests.
// On a release that raises the API's MIN_CLI_VERSION_DEFAULT (api/src/lib/version.ts),
// update CURRENT_CLI_VERSION here and every fixture below follows.

/** A valid, current CLI version — at or above the API minimum. The common fixture. */
export const CURRENT_CLI_VERSION = '2.12.2';

const [maj, min] = CURRENT_CLI_VERSION.split('.').map(Number) as [number, number];

/** Same MAJOR.MINOR as current, higher patch — accepted by the per-race minor pin. */
export const SAME_MINOR_CLI_VERSION = `${maj}.${min}.99`;

/** Above the floor but a different minor — rejected by the per-race minor pin. */
export const MISMATCHED_MINOR_CLI_VERSION = `${maj}.${min + 1}.0`;

/** Far below any supported minimum — rejected by the version gate. */
export const OUTDATED_CLI_VERSION = '1.5.0';

/** A valid, current desktop-app version — at or above the API's desktop minimum. */
export const CURRENT_DESKTOP_VERSION = '0.1.0';

/** Far below the desktop minimum — rejected by the version gate. */
export const OUTDATED_DESKTOP_VERSION = '0.0.1';

/** Builds the `x-cli-version` header pair used by the default (CLI) client. */
export function cliHeaders(version: string = CURRENT_CLI_VERSION): Record<string, string> {
  return { 'x-cli-version': version };
}

/** Builds the `x-client` + `x-client-version` header pair for the desktop client. */
export function desktopHeaders(version: string = CURRENT_DESKTOP_VERSION): Record<string, string> {
  return { 'x-client': 'desktop', 'x-client-version': version };
}
