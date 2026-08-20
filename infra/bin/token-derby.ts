#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { TokenDerbyStack } from '../lib/token-derby-stack';
import type { EnvConfig, EnvName } from '../lib/env-config';

const ENV_CONFIGS: Record<EnvName, EnvConfig> = {
  prod: {
    stackId: 'TokenDerbyStack',
    siteDomain: 'token-derby.mauricode.co.uk',
    adminDomain: 'admin.token-derby.mauricode.co.uk',
    tableName: 'token-derby',
    apiName: 'token-derby-api',
    ssmPrefix: '/token-derby/admin',
    authSsmPrefix: '/token-derby/auth',
    disposable: false,
  },
  staging: {
    stackId: 'TokenDerbyStack-staging',
    siteDomain: 'token-derby-staging.mauricode.co.uk',
    adminDomain: 'admin.token-derby-staging.mauricode.co.uk',
    tableName: 'token-derby-staging',
    apiName: 'token-derby-api-staging',
    ssmPrefix: '/token-derby-staging/admin',
    authSsmPrefix: '/token-derby-staging/auth',
    disposable: true,
  },
};

const app = new cdk.App();

const envArg = (app.node.tryGetContext('env') as string | undefined) ?? 'prod';
if (envArg !== 'prod' && envArg !== 'staging') {
  throw new Error(`Unknown -c env=${envArg}. Valid values: prod, staging`);
}
const config = ENV_CONFIGS[envArg];

new TokenDerbyStack(app, config.stackId, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'eu-west-2',
  },
  crossRegionReferences: true,
  config,
});
