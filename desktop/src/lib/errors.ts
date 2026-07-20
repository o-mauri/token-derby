import type { ApiErrorCode } from '@token-derby/client';

// Codes the desktop renderer can see beyond the server's ApiErrorCode union:
// 'UNKNOWN' is api-service's catch-all for anything that isn't an ApiError,
// and 'NO_IDENTITY' is a purely local condition (no identity on disk yet) —
// never sent by the server.
export type DesktopErrorCode = ApiErrorCode | 'UNKNOWN' | 'NO_IDENTITY';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

const MESSAGES: Record<DesktopErrorCode, string> = {
  RACE_NOT_FOUND: 'Race not found — it may have ended or the code was mistyped.',
  RACE_FULL: 'That race is full.',
  RACE_FINISHED: 'That race has already finished.',
  INVALID_TOKEN: 'That link or token is invalid or has expired.',
  RATE_LIMITED: "You're doing that too fast — try again in a moment.",
  BAD_REQUEST: 'Something about that request was invalid.',
  VERSION_MISMATCH: 'Token Derby needs to be updated before you can continue. Please install the latest version.',
  IDENTITY_REQUIRED: "You'll need to set up your jockey again.",
  DUPLICATE_HORSE: 'You already have a horse with that name.',
  ORG_NAME_TAKEN: 'That organisation name is already taken.',
  ORG_NOT_FOUND: 'Organisation not found.',
  NOT_ORG_MEMBER: "You're not a member of that organisation.",
  UNAUTHENTICATED: "Your session isn't valid — you'll need to set up your jockey again.",
  STABLE_HORSE_NOT_FOUND: 'Horse not found in your stable.',
  STABLE_HORSE_NAME_TAKEN: 'You already have a horse with that name.',
  INSUFFICIENT_ROLLS: 'No rolls left — level up this horse to earn more.',
  NETWORK_ERROR: "Couldn't reach Token Derby — check your connection and try again.",
  UNKNOWN: GENERIC_MESSAGE,
  NO_IDENTITY: "You'll need to set up your jockey again.",
};

// Maps an error code to friendly, desktop-authored copy. Unlike the CLI, the
// server's own `message` is never shown for VERSION_MISMATCH — desktop users
// always see this copy so the wording stays consistent across the app.
export function errorMessage(code: string): string {
  return (MESSAGES as Record<string, string>)[code] ?? GENERIC_MESSAGE;
}

export type ErrorRoute = 'reonboard' | 'update-required' | 'empty' | null;

const REONBOARD_CODES = new Set<string>(['IDENTITY_REQUIRED', 'UNAUTHENTICATED', 'NO_IDENTITY']);
const EMPTY_STATE_CODES = new Set<string>(['RACE_NOT_FOUND', 'RACE_FINISHED']);

// Routing hint alongside the friendly message: screens use this to decide
// whether to kick the user back to onboarding, show an "update required"
// banner, or just render a friendly empty state instead of an error.
export function errorRoute(code: string): ErrorRoute {
  if (REONBOARD_CODES.has(code)) return 'reonboard';
  if (code === 'VERSION_MISMATCH') return 'update-required';
  if (EMPTY_STATE_CODES.has(code)) return 'empty';
  return null;
}
