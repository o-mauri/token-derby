import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  resolveGoogleIdentity, displayNameFromClaims, normaliseEmail, EmailAlreadyLinkedError,
} from '../../src/lib/identity-link.js';
import { getUserById, putUser, updateUserDisplayName } from '../../src/db/users.js';
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

  it('signs in to the claimed account without touching the jockey name', async () => {
    const c = claims();
    const first = await resolveGoogleIdentity(c);
    const again = await resolveGoogleIdentity({ ...c, given_name: 'Adelaide' });
    expect(again.user_id).toBe(first.user_id);
    expect(again.created).toBe(false);
    // Google's current given_name does not win on a repeat sign-in.
    expect(again.display_name).toBe('Ada');
    expect((await getUserById(first.user_id))!.display_name).toBe('Ada');
  });

  it('leaves an admin rename intact on the next sign-in, and carries it into the session', async () => {
    const c = claims();
    const first = await resolveGoogleIdentity(c);
    await updateUserDisplayName(first.user_id, 'Renamed');

    const again = await resolveGoogleIdentity(c);

    expect((await getUserById(first.user_id))!.display_name).toBe('Renamed');
    // The returned name becomes the web session's, so it must be the renamed one.
    expect(again.display_name).toBe('Renamed');
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

  it('does not refresh the jockey name when an already-linked account links again', async () => {
    const user_id = randomUUID();
    await putUser({ user_id, display_name: 'OldName', created_at: new Date().toISOString() }, hashSecretToken('t'));
    const c = claims({ given_name: 'FirstLink' });

    // First link is the one moment Google's first name wins.
    expect((await resolveGoogleIdentity(c, user_id)).display_name).toBe('FirstLink');

    // Clicking "Link Google account" again must not clobber the name, renamed or not.
    const relinked = await resolveGoogleIdentity({ ...c, given_name: 'SecondLink' }, user_id);
    expect(relinked.display_name).toBe('FirstLink');
    expect((await getUserById(user_id))!.display_name).toBe('FirstLink');

    await updateUserDisplayName(user_id, 'Renamed');
    const afterRename = await resolveGoogleIdentity({ ...c, given_name: 'ThirdLink' }, user_id);
    expect(afterRename.display_name).toBe('Renamed');
    expect((await getUserById(user_id))!.display_name).toBe('Renamed');
  });

  it('warns but still signs in when the Google sub changed for the same email', async () => {
    const c = claims();
    const first = await resolveGoogleIdentity(c);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let again: Awaited<ReturnType<typeof resolveGoogleIdentity>>;
    let calls: unknown[][];
    try {
      again = await resolveGoogleIdentity({ ...c, sub: 'sub-reassigned' });
      calls = warn.mock.calls.map((c2) => [...c2]);
    } finally {
      warn.mockRestore(); // also clears the recorded calls, hence the copy above
    }

    // A reassigned Workspace address inherits the account; refusing would lock
    // out a legitimate user, so this is visible rather than fatal.
    expect(again.user_id).toBe(first.user_id);
    expect(calls).toHaveLength(1);
    expect(String(calls[0]![0])).toMatch(/idp_sub/);
    expect(calls[0]![1]).toMatchObject({
      user_id: first.user_id, email: c.email, stored_idp_sub: c.sub, new_idp_sub: 'sub-reassigned',
    });
  });

  it('does not warn when the same Google sub signs in again', async () => {
    const c = claims();
    await resolveGoogleIdentity(c);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let calls: unknown[][];
    try {
      await resolveGoogleIdentity(c);
      calls = warn.mock.calls.map((c2) => [...c2]);
    } finally {
      warn.mockRestore();
    }

    expect(calls).toEqual([]);
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
