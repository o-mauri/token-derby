import { beforeAll, afterAll } from 'vitest';
import { DynamoDBClient, CreateTableCommand, DeleteTableCommand, ResourceNotFoundException } from '@aws-sdk/client-dynamodb';

export const TEST_TABLE = `token-derby-test-${process.pid}-${Date.now()}`;

process.env.DYNAMODB_ENDPOINT = 'http://localhost:8000';
process.env.AWS_REGION = 'local';
process.env.AWS_ACCESS_KEY_ID = 'fake';
process.env.AWS_SECRET_ACCESS_KEY = 'fake';
process.env.TABLE_NAME = TEST_TABLE;
process.env.TOKEN_DERBY_MAX_RATE = '1000000000';

const client = new DynamoDBClient({
  endpoint: process.env.DYNAMODB_ENDPOINT,
  region: 'local',
  credentials: { accessKeyId: 'fake', secretAccessKey: 'fake' },
});

beforeAll(async () => {
  await client.send(new CreateTableCommand({
    TableName: TEST_TABLE,
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: 'S' },
      { AttributeName: 'sk', AttributeType: 'S' },
      { AttributeName: 'join_code', AttributeType: 'S' },
      { AttributeName: 'admin_code', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'pk', KeyType: 'HASH' },
      { AttributeName: 'sk', KeyType: 'RANGE' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'JoinCodeIndex',
        KeySchema: [{ AttributeName: 'join_code', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'AdminCodeIndex',
        KeySchema: [{ AttributeName: 'admin_code', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  }));
});

afterAll(async () => {
  try {
    await client.send(new DeleteTableCommand({ TableName: TEST_TABLE }));
  } catch (e) {
    if (!(e instanceof ResourceNotFoundException)) throw e;
  }
});
