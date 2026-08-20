import { describe, it, expect, beforeAll } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { TokenDerbyStack } from '../lib/token-derby-stack';
import { ENV_CONFIGS } from '../lib/env-config';

// A synthetic account: cdk.context.json is gitignored, so the cached hosted-zone
// answer cannot be relied on. Priming the same key keeps synthesis offline.
const ACCOUNT = '123456789012';
const REGION = 'eu-west-2';
const HOSTED_ZONE_CONTEXT = {
  [`hosted-zone:account=${ACCOUNT}:domainName=mauricode.co.uk:region=${REGION}`]: {
    Id: '/hostedzone/ZTESTTESTTESTTEST',
    Name: 'mauricode.co.uk.',
  },
  // Skip the esbuild bundle of every handler; env vars are unaffected by it.
  'aws:cdk:bundling-stacks': [],
};

const synth = (env: 'prod' | 'staging') => {
  const app = new cdk.App({ context: HOSTED_ZONE_CONTEXT });
  const config = ENV_CONFIGS[env];
  return Template.fromStack(new TokenDerbyStack(app, config.stackId, {
    env: { account: ACCOUNT, region: REGION },
    crossRegionReferences: true,
    config,
  }));
};

/** Only the handlers this repo ships: CDK's own helper lambdas (certificate
 *  requestor, bucket deployment, auto-delete) carry no TABLE_NAME. */
function appFunctions(template: Template) {
  return Object.entries(template.findResources('AWS::Lambda::Function'))
    .filter(([, r]) => (r as any).Properties?.Environment?.Variables?.TABLE_NAME !== undefined)
    .map(([id, r]) => ({ id, env: (r as any).Properties.Environment.Variables as Record<string, unknown> }));
}

describe('the synthesised prod stack', () => {
  let prod: Template;
  beforeAll(() => { prod = synth('prod'); });

  it('provisions the handlers that need a table', () => {
    // Guards the filter itself: an empty list would make every check below vacuous.
    expect(appFunctions(prod).length).toBeGreaterThan(40);
  });

  // Without this env var Google sign-in derives redirect_uri from the Host
  // CloudFront rewrites, which is the account-takeover path this branch closed.
  it('gives every handler SITE_ORIGIN pointing at the SITE domain', () => {
    const fns = appFunctions(prod);
    for (const fn of fns) {
      expect(fn.env.SITE_ORIGIN, `${fn.id} is missing SITE_ORIGIN`)
        .toBe('https://token-derby.mauricode.co.uk');
    }
    expect(fns.every((f) => f.env.SITE_ORIGIN === 'https://token-derby.mauricode.co.uk')).toBe(true);
  });

  it('never points SITE_ORIGIN at the admin domain', () => {
    for (const fn of appFunctions(prod)) {
      expect(String(fn.env.SITE_ORIGIN)).not.toContain(ENV_CONFIGS.prod.adminDomain);
      expect(String(fn.env.SITE_ORIGIN)).not.toContain('admin.');
    }
  });

  it('gives the three Google auth handlers SITE_ORIGIN by name', () => {
    const byPrefix = (prefix: string) => appFunctions(prod).filter((f) => f.id.startsWith(prefix));
    for (const prefix of ['AuthGoogleStartFn', 'AuthLinkStartFn', 'AuthGoogleCallbackFn']) {
      const matched = byPrefix(prefix);
      expect(matched, `no ${prefix} in the template`).toHaveLength(1);
      expect(matched[0]!.env.SITE_ORIGIN).toBe('https://token-derby.mauricode.co.uk');
    }
  });
});

describe('the synthesised staging stack', () => {
  it('gives every handler SITE_ORIGIN pointing at its own site domain', () => {
    const fns = appFunctions(synth('staging'));
    expect(fns.length).toBeGreaterThan(40);
    for (const fn of fns) {
      expect(fn.env.SITE_ORIGIN, `${fn.id} is missing SITE_ORIGIN`)
        .toBe('https://token-derby-staging.mauricode.co.uk');
    }
  });
});
