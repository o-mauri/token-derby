import { GetCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { userMetaKey, emailClaimKey } from './keys.js';

export type IdentityWrite = {
  user_id: string;
  email: string;
  idp_sub: string;
  hd?: string;
};

export class EmailAlreadyClaimedError extends Error {
  constructor(email: string) {
    super(`Email ${email} is already linked to an account`);
    this.name = 'EmailAlreadyClaimedError';
  }
}

/** Strongly consistent: the claim row is the source of truth, not a GSI. */
export async function getUserIdByEmail(email: string): Promise<string | null> {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: emailClaimKey(email),
    ProjectionExpression: 'user_id',
  }));
  return Item?.user_id ? String(Item.user_id) : null;
}

function identityAttrs(input: IdentityWrite) {
  return {
    email: input.email,
    email_verified: true,
    idp: 'google' as const,
    idp_sub: input.idp_sub,
    ...(input.hd ? { hd: input.hd } : {}),
  };
}

/** Creates the user row and its email claim in one transaction, so two
 *  simultaneous first sign-ins cannot produce two accounts. */
export async function createUserWithEmail(
  input: IdentityWrite & { display_name: string },
): Promise<string> {
  try {
    await ddb.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE,
            Item: {
              ...userMetaKey(input.user_id),
              user_id: input.user_id,
              display_name: input.display_name,
              created_at: new Date().toISOString(),
              ...identityAttrs(input),
            },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
        {
          Put: {
            TableName: TABLE,
            Item: { ...emailClaimKey(input.email), user_id: input.user_id, created_at: new Date().toISOString() },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
      ],
    }));
    return input.user_id;
  } catch (err: any) {
    if (err?.name === 'TransactionCanceledException') throw new EmailAlreadyClaimedError(input.email);
    throw err;
  }
}

/** Links an email to an existing account. The attribute_not_exists(email) guard
 *  is what stops an already-linked account being taken over. */
export async function attachEmailToUser(input: IdentityWrite): Promise<void> {
  try {
    await ddb.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE,
            Item: { ...emailClaimKey(input.email), user_id: input.user_id, created_at: new Date().toISOString() },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
        {
          Update: {
            TableName: TABLE,
            Key: userMetaKey(input.user_id),
            UpdateExpression:
              'SET email = :e, email_verified = :v, idp = :i, idp_sub = :s' + (input.hd ? ', hd = :h' : ''),
            ConditionExpression: 'attribute_exists(pk) AND attribute_not_exists(email)',
            ExpressionAttributeValues: {
              ':e': input.email, ':v': true, ':i': 'google', ':s': input.idp_sub,
              ...(input.hd ? { ':h': input.hd } : {}),
            },
          },
        },
      ],
    }));
  } catch (err: any) {
    if (err?.name === 'TransactionCanceledException') throw new EmailAlreadyClaimedError(input.email);
    throw err;
  }
}

/** Sign-in refresh for an account that already owns this email. */
export async function updateUserIdentity(
  input: IdentityWrite & { display_name: string },
): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: userMetaKey(input.user_id),
    UpdateExpression:
      'SET display_name = :n, email_verified = :v, idp = :i, idp_sub = :s' + (input.hd ? ', hd = :h' : ''),
    ConditionExpression: 'attribute_exists(pk)',
    ExpressionAttributeValues: {
      ':n': input.display_name, ':v': true, ':i': 'google', ':s': input.idp_sub,
      ...(input.hd ? { ':h': input.hd } : {}),
    },
  }));
}
