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

/** Resolves `METHOD /path` to the logical id of the Lambda its integration
 *  targets, walking Route -> (Fn::Join ref) -> Integration -> (Fn::GetAtt)
 *  -> Function. This checks the actual wiring, not just that a route with
 *  the right RouteKey exists — a route pointed at the wrong handler is the
 *  failure this guards against, and a RouteKey-only check would miss it. */
function routeTargetFunctionLogicalId(template: Template, routeKey: string): string {
  const routes = Object.values(template.findResources('AWS::ApiGatewayV2::Route')) as any[];
  const matches = routes.filter((r) => r.Properties.RouteKey === routeKey);
  expect(matches, `expected exactly one route for ${routeKey}`).toHaveLength(1);
  const integrationRef = matches[0].Properties.Target['Fn::Join'][1][1].Ref as string;
  const integrations = template.findResources('AWS::ApiGatewayV2::Integration');
  const integration = (integrations as any)[integrationRef];
  expect(integration, `integration ${integrationRef} referenced by ${routeKey} not found`).toBeDefined();
  return integration.Properties.IntegrationUri['Fn::GetAtt'][0] as string;
}

describe('CLI login routes', () => {
  let prod: Template;
  beforeAll(() => { prod = synth('prod'); });

  // Six new handlers wired via makeFn/addRoutes. Checked by function-logical-id
  // prefix (not just "a route with this key exists") so a route wired to the
  // wrong Lambda fails here rather than passing silently.
  const NEW_ROUTES: Array<{ routeKey: string; fnPrefix: string }> = [
    { routeKey: 'POST /api/auth/cli/start', fnPrefix: 'AuthCliStartFn' },
    { routeKey: 'POST /api/auth/cli/approve', fnPrefix: 'AuthCliApproveFn' },
    { routeKey: 'POST /api/auth/cli/poll', fnPrefix: 'AuthCliPollFn' },
    { routeKey: 'GET /api/devices', fnPrefix: 'ListDevicesFn' },
    { routeKey: 'DELETE /api/devices/me', fnPrefix: 'LogoutDeviceFn' },
    { routeKey: 'DELETE /api/devices/{device_id}', fnPrefix: 'RevokeDeviceFn' },
  ];

  it('wires each of the six new routes to its own handler', () => {
    for (const { routeKey, fnPrefix } of NEW_ROUTES) {
      const fnLogicalId = routeTargetFunctionLogicalId(prod, routeKey);
      expect(fnLogicalId.startsWith(fnPrefix), `${routeKey} -> ${fnLogicalId}, expected prefix ${fnPrefix}`).toBe(true);
    }
  });

  // The omission guard: DELETE /api/devices/me and DELETE /api/devices/{device_id}
  // overlap in path shape. If /me were ever forgotten, or its integration
  // pointed at revoke-device, a logout would silently fall through to
  // revoke-device with device_id="me" and leave a live credential behind.
  it('keeps /api/devices/me and /api/devices/{device_id} distinct, each on its own handler', () => {
    const meFn = routeTargetFunctionLogicalId(prod, 'DELETE /api/devices/me');
    const idFn = routeTargetFunctionLogicalId(prod, 'DELETE /api/devices/{device_id}');
    expect(meFn.startsWith('LogoutDeviceFn'), `/devices/me -> ${meFn}, expected LogoutDeviceFn`).toBe(true);
    expect(idFn.startsWith('RevokeDeviceFn'), `/devices/{device_id} -> ${idFn}, expected RevokeDeviceFn`).toBe(true);
    expect(meFn).not.toBe(idFn);
  });

  it('gives the six new CLI-login handlers SITE_ORIGIN', () => {
    const fns = appFunctions(prod);
    // Guards the prefix filters below the same way the top-level count guard
    // does: an empty match per prefix would make its own SITE_ORIGIN check vacuous.
    const prefixes = ['AuthCliStartFn', 'AuthCliApproveFn', 'AuthCliPollFn', 'ListDevicesFn', 'LogoutDeviceFn', 'RevokeDeviceFn'];
    for (const prefix of prefixes) {
      const matched = fns.filter((f) => f.id.startsWith(prefix));
      expect(matched, `no ${prefix} in the template`).toHaveLength(1);
      expect(matched[0]!.env.SITE_ORIGIN).toBe('https://token-derby.mauricode.co.uk');
    }
  });
});
