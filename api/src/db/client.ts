import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const endpoint = process.env.DYNAMODB_ENDPOINT;

export const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    ...(endpoint ? { endpoint } : {}),
    region: process.env.AWS_REGION ?? 'eu-west-2',
  }),
  {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  },
);

export const TABLE = process.env.TABLE_NAME ?? 'token-derby';
