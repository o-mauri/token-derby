import { randomUUID } from 'node:crypto';
import { USER_NAME_MAX_LENGTH } from '@token-derby/shared';
import type { GoogleClaims } from './google-id-token.js';
import {
  getUserIdByEmail, createUserWithEmail, attachEmailToUser, updateUserIdentity,
} from '../db/identities.js';

export class EmailAlreadyLinkedError extends Error {
  constructor(email: string) {
    super(`${email} is already linked to a different Token Derby account`);
    this.name = 'EmailAlreadyLinkedError';
  }
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** given_name, else the first token of name, else the email local part. */
export function displayNameFromClaims(claims: GoogleClaims): string {
  const fromName = claims.name?.trim().split(/\s+/)[0];
  const local = claims.email.split('@')[0] ?? 'jockey';
  const raw = claims.given_name?.trim() || fromName || local;
  return raw.slice(0, USER_NAME_MAX_LENGTH);
}

export type ResolvedIdentity = {
  user_id: string;
  display_name: string;
  created: boolean;
};

export async function resolveGoogleIdentity(
  claims: GoogleClaims,
  link_to_user_id?: string,
): Promise<ResolvedIdentity> {
  const email = normaliseEmail(claims.email);
  const display_name = displayNameFromClaims({ ...claims, email });
  const write = { email, idp_sub: claims.sub, ...(claims.hd ? { hd: claims.hd } : {}) };

  const claimed = await getUserIdByEmail(email);

  if (claimed) {
    if (link_to_user_id && link_to_user_id !== claimed) throw new EmailAlreadyLinkedError(email);
    await updateUserIdentity({ ...write, user_id: claimed, display_name });
    return { user_id: claimed, display_name, created: false };
  }

  if (link_to_user_id) {
    await attachEmailToUser({ ...write, user_id: link_to_user_id });
    await updateUserIdentity({ ...write, user_id: link_to_user_id, display_name });
    return { user_id: link_to_user_id, display_name, created: false };
  }

  const user_id = await createUserWithEmail({ ...write, user_id: randomUUID(), display_name });
  return { user_id, display_name, created: true };
}
