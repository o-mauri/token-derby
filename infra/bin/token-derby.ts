#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { TokenDerbyStack } from '../lib/token-derby-stack';

const app = new cdk.App();

new TokenDerbyStack(app, 'TokenDerbyStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'eu-west-2',
  },
  crossRegionReferences: true,
});
