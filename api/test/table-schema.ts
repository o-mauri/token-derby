import type { CreateTableCommandInput } from '@aws-sdk/client-dynamodb';

export function tableSchema(TableName: string): CreateTableCommandInput {
  return {
    TableName,
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: 'S' },
      { AttributeName: 'sk', AttributeType: 'S' },
      { AttributeName: 'join_code', AttributeType: 'S' },
      { AttributeName: 'admin_code', AttributeType: 'S' },
      { AttributeName: 'org_name', AttributeType: 'S' },
      { AttributeName: 'org_join_token', AttributeType: 'S' },
      { AttributeName: 'member_user_id', AttributeType: 'S' },
      { AttributeName: 'org_id', AttributeType: 'S' },
      { AttributeName: 'start_time', AttributeType: 'S' },
      { AttributeName: 'schedule_marker', AttributeType: 'S' },
      { AttributeName: 'league_marker', AttributeType: 'S' },
      { AttributeName: 'slack_marker', AttributeType: 'S' },
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
      {
        IndexName: 'OrgNameIndex',
        KeySchema: [{ AttributeName: 'org_name', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'OrgJoinTokenIndex',
        KeySchema: [{ AttributeName: 'org_join_token', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'OrgMembershipIndex',
        KeySchema: [{ AttributeName: 'member_user_id', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'OrgRacesIndex',
        KeySchema: [
          { AttributeName: 'org_id', KeyType: 'HASH' },
          { AttributeName: 'start_time', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'SchedulesIndex',
        KeySchema: [
          { AttributeName: 'schedule_marker', KeyType: 'HASH' },
          { AttributeName: 'org_id', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'LeaguesIndex',
        KeySchema: [
          { AttributeName: 'league_marker', KeyType: 'HASH' },
          { AttributeName: 'org_id', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'SlackOrgsIndex',
        KeySchema: [
          { AttributeName: 'slack_marker', KeyType: 'HASH' },
          { AttributeName: 'org_id', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  };
}
