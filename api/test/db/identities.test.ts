import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  getUserIdByEmail, createUserWithEmail, attachEmailToUser, updateUserIdentity,
  EmailAlreadyClaimedError, UserAlreadyLinkedError,
} from '../../src/db/identities.js';
import { getUserById, putUser } from '../../src/db/users.js';
import { hashSecretToken } from '../../src/lib/auth.js';

const email = () => `u-${randomUUID()}@example.com`;

describe('identity writes', () => {
  it('creates a user and its email claim together', async () => {
    const e = email();
    const user_id = await createUserWithEmail({
      user_id: randomUUID(), email: e, idp_sub: 'sub-1', hd: 'example.com', display_name: 'Ada',
    });
    expect(await getUserIdByEmail(e)).toBe(user_id);
    const row = await getUserById(user_id);
    expect(row!.display_name).toBe('Ada');
    expect(row!.email).toBe(e);
    expect(row!.email_verified).toBe(true);
    expect(row!.idp).toBe('google');
    expect(row!.idp_sub).toBe('sub-1');
    expect(row!.hd).toBe('example.com');
    expect(row!.secret_token_hash).toBeUndefined();
  });

  it('returns null for an unclaimed email', async () => {
    expect(await getUserIdByEmail(email())).toBeNull();
  });

  it('refuses a second user for the same email', async () => {
    const e = email();
    await createUserWithEmail({ user_id: randomUUID(), email: e, idp_sub: 's', display_name: 'First' });
    await expect(createUserWithEmail({
      user_id: randomUUID(), email: e, idp_sub: 's2', display_name: 'Second',
    })).rejects.toBeInstanceOf(EmailAlreadyClaimedError);
  });

  it('attaches an email to an existing CLI user without disturbing their token', async () => {
    const user_id = randomUUID();
    await putUser({ user_id, display_name: 'CliUser', created_at: new Date().toISOString() }, hashSecretToken('tok'));
    const e = email();
    await attachEmailToUser({ user_id, email: e, idp_sub: 'sub-9' });

    expect(await getUserIdByEmail(e)).toBe(user_id);
    const row = await getUserById(user_id);
    expect(row!.email).toBe(e);
    expect(row!.secret_token_hash).toBe(hashSecretToken('tok'));
    expect(row!.display_name).toBe('CliUser');
  });

  it('refuses to attach a second email to an already-linked user', async () => {
    const user_id = randomUUID();
    await putUser({ user_id, display_name: 'Linked', created_at: new Date().toISOString() }, hashSecretToken('t'));
    await attachEmailToUser({ user_id, email: email(), idp_sub: 's1' });
    // The user-row guard is what fails here — a distinct cause from a claim-row race.
    await expect(attachEmailToUser({ user_id, email: email(), idp_sub: 's2' }))
      .rejects.toBeInstanceOf(UserAlreadyLinkedError);
  });

  it('refuses to attach an email that another user already claims', async () => {
    const e = email();
    await createUserWithEmail({ user_id: randomUUID(), email: e, idp_sub: 's', display_name: 'Owner' });
    const other = randomUUID();
    await putUser({ user_id: other, display_name: 'Other', created_at: new Date().toISOString() }, hashSecretToken('t'));
    // The claim-row guard is what fails here, not the user row's.
    await expect(attachEmailToUser({ user_id: other, email: e, idp_sub: 's2' }))
      .rejects.toBeInstanceOf(EmailAlreadyClaimedError);
  });

  it('refreshes the display name and identity fields on sign-in', async () => {
    const e = email();
    const user_id = await createUserWithEmail({
      user_id: randomUUID(), email: e, idp_sub: 'old-sub', display_name: 'Before',
    });
    await updateUserIdentity({ user_id, email: e, idp_sub: 'new-sub', hd: 'corp.com', display_name: 'After' });
    const row = await getUserById(user_id);
    expect(row!.display_name).toBe('After');
    expect(row!.idp_sub).toBe('new-sub');
    expect(row!.hd).toBe('corp.com');
  });
});
