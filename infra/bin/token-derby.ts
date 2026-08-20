#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { TokenDerbyStack } from '../lib/token-derby-stack';
import { ENV_CONFIGS } from '../lib/env-config';

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
