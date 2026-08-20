import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  resolveGoogleIdentity, displayNameFromClaims, normaliseEmail, EmailAlreadyLinkedError,
} from '../../src/lib/identity-link.js';
import { getUserById, putUser } from '../../src/db/users.js';
import { getUserIdByEmail } from '../../src/db/identities.js';
import { hashSecretToken } from '../../src/lib/auth.js';
import type { GoogleClaims } from '../../src/lib/google-id-token.js';

const claims = (over: Partial<GoogleClaims> = {}): GoogleClaims => ({
  sub: 'sub-' + randomUUID(), email: `u-${randomUUID()}@example.com`, email_verified: true,
  name: 'Ada Lovelace', given_name: 'Ada', ...over,
});

describe('normaliseEmail', () => {
  it('lowercases and trims', () => {
    expect(normaliseEmail('  Omar@StackOne.COM ')).toBe('omar@stackone.com');
  });
});

describe('displayNameFromClaims', () => {
  it('prefers given_name', () => {
    expect(displayNameFromClaims(claims({ given_name: 'Ada', name: 'Ada Lovelace' }))).toBe('Ada');
  });
  it('falls back to the first token of name', () => {
    expect(displayNameFromClaims(claims({ given_name: undefined, name: 'Grace Hopper' }))).toBe('Grace');
  });
  it('falls back to the email local part', () => {
    expect(displayNameFromClaims(
      claims({ given_name: undefined, name: undefined, email: 'katherine@nasa.gov' }),
    )).toBe('katherine');
  });
  it('truncates to 40 characters', () => {
    const long = 'x'.repeat(60);
    expect(displayNameFromClaims(claims({ given_name: long })).length).toBe(40);
  });
  it('falls back to jockey when every source is empty', () => {
    expect(displayNameFromClaims(
      claims({ given_name: undefined, name: undefined, email: '@example.com' }),
    )).toBe('jockey');
  });
});

describe('resolveGoogleIdentity', () => {
  it('creates an account when the email is unknown and there is no link target', async () => {
    const c = claims();
    const res = await resolveGoogleIdentity(c);
    expect(res.created).toBe(true);
    expect(res.display_name).toBe('Ada');
    expect(await getUserIdByEmail(c.email)).toBe(res.user_id);
  });

  it('signs in to the claimed account and refreshes the name', async () => {
    const c = claims();
    const first = await resolveGoogleIdentity(c);
    const again = await resolveGoogleIdentity({ ...c, given_name: 'Adelaide' });
    expect(again.user_id).toBe(first.user_id);
    expect(again.created).toBe(false);
    expect(again.display_name).toBe('Adelaide');
    expect((await getUserById(first.user_id))!.display_name).toBe('Adelaide');
  });

  it('attaches to an existing CLI account when a link target is given', async () => {
    const user_id = randomUUID();
    await putUser({ user_id, display_name: 'OldName', created_at: new Date().toISOString() }, hashSecretToken('t'));
    const c = claims({ given_name: 'NewName' });
    const res = await resolveGoogleIdentity(c, user_id);
    expect(res.user_id).toBe(user_id);
    expect(res.created).toBe(false);
    // Overwriting the jockey name with the Google first name is the product decision.
    expect(res.display_name).toBe('NewName');
    expect((await getUserById(user_id))!.display_name).toBe('NewName');
    // The email must actually be claimed, or the account becomes unreachable
    // by email on the next sign-in — the two-accounts-for-one-email bug.
    expect(await getUserIdByEmail(c.email)).toBe(user_id);
  });

  it('is idempotent when the link target already owns the email', async () => {
    const c = claims();
    const first = await resolveGoogleIdentity(c);
    const again = await resolveGoogleIdentity(c, first.user_id);
    expect(again.user_id).toBe(first.user_id);
    expect(again.created).toBe(false);
  });

  it('refuses when the email belongs to a different account — never merges', async () => {
    const c = claims();
    await resolveGoogleIdentity(c);
    const other = randomUUID();
    await putUser({ user_id: other, display_name: 'Other', created_at: new Date().toISOString() }, hashSecretToken('t'));
    await expect(resolveGoogleIdentity(c, other)).rejects.toBeInstanceOf(EmailAlreadyLinkedError);
  });

  it('produces exactly one account under concurrent first sign-ins', async () => {
    const c = claims();
    const results = await Promise.allSettled([
      resolveGoogleIdentity(c), resolveGoogleIdentity(c), resolveGoogleIdentity(c),
    ]);
    const ids = new Set(
      results.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<any>).value.user_id),
    );
    expect(ids.size).toBe(1);
    expect(await getUserIdByEmail(c.email)).toBe([...ids][0]);
  });
});
