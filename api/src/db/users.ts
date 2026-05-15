import { PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { userMetaKey } from './keys.js';
import type { User } from '@token-derby/shared';

export type UserRecord = User & { secret_token_hash: string };

export async function putUser(user: User, secret_token_hash: string): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ...userMetaKey(user.user_id),
      ...user,
      secret_token_hash,
    },
    ConditionExpression: 'attribute_not_exists(pk)',
  }));
}

export async function getUserById(user_id: string): Promise<UserRecord | null> {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: userMetaKey(user_id),
  }));
  if (!Item) return null;
  const { pk: _pk, sk: _sk, ...rest } = Item;
  return rest as UserRecord;
}

export async function updateUserDisplayName(user_id: string, display_name: string): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: userMetaKey(user_id),
    UpdateExpression: 'SET display_name = :n',
    ConditionExpression: 'attribute_exists(pk)',
    ExpressionAttributeValues: { ':n': display_name },
  }));
}
