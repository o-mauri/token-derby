// Pure, framework-free logic for the onboarding window — kept separate from
// Onboarding.tsx so it's unit-testable without React or window.api.

import { USER_NAME_MAX_LENGTH } from '@token-derby/shared';

export type ValidateDisplayNameResult = { ok: true; name: string } | { ok: false; error: string };

// Ported from cli/src/identity/identity.ts so the desktop and CLI apply the
// exact same display-name rule.
export function validateDisplayName(name: string): ValidateDisplayNameResult {
  const trimmed = name.trim();
  if (trimmed.length < 1) return { ok: false, error: 'Name cannot be empty.' };
  if (trimmed.length > USER_NAME_MAX_LENGTH) {
    return { ok: false, error: `Name must be ${USER_NAME_MAX_LENGTH} characters or fewer.` };
  }
  return { ok: true, name: trimmed };
}

// Builds the "<user_id>:<secret_token>" string electron/identity.ts's
// pasteToken() expects, from the two labelled fields the paste-fallback UI
// collects.
export function buildPasteToken(userId: string, secretToken: string): string {
  return `${userId.trim()}:${secretToken.trim()}`;
}
