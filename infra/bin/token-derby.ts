#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { TokenDerbyStack } from '../lib/token-derby-stack';
import { CONFIG } from '../lib/env-config';

const app = new cdk.App();

new TokenDerbyStack(app, CONFIG.stackId, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'eu-west-2',
  },
  crossRegionReferences: true,
  config: CONFIG,
});
