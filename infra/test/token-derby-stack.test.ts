import { describe, it, expect, beforeAll } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { TokenDerbyStack } from '../lib/token-derby-stack';
import { CONFIG } from '../lib/env-config';

// A synthetic account: cdk.context.json is gitignored, so the cached hosted-zone
// answer cannot be relied on. Priming the same key keeps synthesis offline.
const ACCOUNT = '123456789012';
const REGION = 'eu-west-2';
const HOSTED_ZONE_CONTEXT = {
  [`hosted-zone:account=${ACCOUNT}:domainName=tokenderby.co.uk:region=${REGION}`]: {
    Id: '/hostedzone/ZTESTTESTTESTTEST',
    Name: 'tokenderby.co.uk.',
  },
  [`hosted-zone:account=${ACCOUNT}:domainName=mauricode.co.uk:region=${REGION}`]: {
    Id: '/hostedzone/ZLEGACYTESTTESTTE',
    Name: 'mauricode.co.uk.',
  },
  // Skip the esbuild bundle of every handler; env vars are unaffected by it.
  'aws:cdk:bundling-stacks': [],
};

const synth = () => {
  const app = new cdk.App({ context: HOSTED_ZONE_CONTEXT });
  const config = CONFIG;
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

describe('organisation name index', () => {
  it('indexes the lower-cased org name for case-insensitive lookups', () => {
    const template = synth();
    const tables = Object.values(template.findResources('AWS::DynamoDB::Table')) as any[];
    const gsis = tables.flatMap((t) => t.Properties.GlobalSecondaryIndexes ?? []);
    const index = gsis.find((g: any) => g.IndexName === 'OrgNameKeyIndex');
    expect(index?.KeySchema).toEqual([{ AttributeName: 'org_name_key', KeyType: 'HASH' }]);
  });

  it('no longer carries the exact-name index', () => {
    const tables = Object.values(synth().findResources('AWS::DynamoDB::Table')) as any[];
    const names = tables.flatMap((t) => (t.Properties.GlobalSecondaryIndexes ?? []).map((g: any) => g.IndexName));
    expect(names).not.toContain('OrgNameIndex');
  });
});

describe('the synthesised prod stack', () => {
  let prod: Template;
  beforeAll(() => { prod = synth(); });

  it('provisions the handlers that need a table', () => {
    // Guards the filter itself: an empty list would make every check below vacuous.
    expect(appFunctions(prod).length).toBeGreaterThan(40);
  });

  // Without this env var Google sign-in derives redirect_uri from the Host
  // CloudFront rewrites, which is the account-takeover path this branch closed.
  it('gives every handler SITE_ORIGIN pointing at the APP domain', () => {
    const fns = appFunctions(prod);
    for (const fn of fns) {
      expect(fn.env.SITE_ORIGIN, `${fn.id} is missing SITE_ORIGIN`)
        .toBe('https://app.tokenderby.co.uk');
    }
    expect(fns.every((f) => f.env.SITE_ORIGIN === 'https://app.tokenderby.co.uk')).toBe(true);
  });

  it('never points SITE_ORIGIN at the admin domain', () => {
    for (const fn of appFunctions(prod)) {
      expect(String(fn.env.SITE_ORIGIN)).not.toContain(CONFIG.adminDomain);
      expect(String(fn.env.SITE_ORIGIN)).not.toContain('admin.');
    }
  });

  it('gives the three Google auth handlers SITE_ORIGIN by name', () => {
    const byPrefix = (prefix: string) => appFunctions(prod).filter((f) => f.id.startsWith(prefix));
    for (const prefix of ['AuthGoogleStartFn', 'AuthLinkStartFn', 'AuthGoogleCallbackFn']) {
      const matched = byPrefix(prefix);
      expect(matched, `no ${prefix} in the template`).toHaveLength(1);
      expect(matched[0]!.env.SITE_ORIGIN).toBe('https://app.tokenderby.co.uk');
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
  beforeAll(() => { prod = synth(); });

  // Every CLI-login handler wired via makeFn/addRoutes. Checked by
  // function-logical-id prefix (not just "a route with this key exists") so a
  // route wired to the wrong Lambda fails here rather than passing silently.
  const NEW_ROUTES: Array<{ routeKey: string; fnPrefix: string }> = [
    { routeKey: 'POST /api/auth/cli/start', fnPrefix: 'AuthCliStartFn' },
    { routeKey: 'POST /api/auth/cli/approve', fnPrefix: 'AuthCliApproveFn' },
    { routeKey: 'POST /api/auth/cli/poll', fnPrefix: 'AuthCliPollFn' },
    { routeKey: 'GET /api/devices', fnPrefix: 'ListDevicesFn' },
    { routeKey: 'POST /api/devices', fnPrefix: 'RegisterDeviceFn' },
    { routeKey: 'DELETE /api/devices/me', fnPrefix: 'LogoutDeviceFn' },
    { routeKey: 'DELETE /api/devices/{device_id}', fnPrefix: 'RevokeDeviceFn' },
  ];

  it('wires each CLI-login route to its own handler', () => {
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

  // POST /api/devices is the one genuinely new API surface on this branch, and
  // it shares its path with the GET that already existed. A route key is
  // method-plus-path, so the two coexist — but only if both are declared and
  // each keeps its own integration. Collapsing them onto one Lambda would make
  // `link` register nothing while still answering 200 to the account view.
  it('keeps GET and POST /api/devices on separate handlers', () => {
    const getFn = routeTargetFunctionLogicalId(prod, 'GET /api/devices');
    const postFn = routeTargetFunctionLogicalId(prod, 'POST /api/devices');
    expect(getFn.startsWith('ListDevicesFn'), `GET -> ${getFn}, expected ListDevicesFn`).toBe(true);
    expect(postFn.startsWith('RegisterDeviceFn'), `POST -> ${postFn}, expected RegisterDeviceFn`).toBe(true);
    expect(getFn).not.toBe(postFn);
  });

  it('gives every CLI-login handler SITE_ORIGIN', () => {
    const fns = appFunctions(prod);
    // Guards the prefix filters below the same way the top-level count guard
    // does: an empty match per prefix would make its own SITE_ORIGIN check vacuous.
    const prefixes = ['AuthCliStartFn', 'AuthCliApproveFn', 'AuthCliPollFn', 'RegisterDeviceFn', 'ListDevicesFn', 'LogoutDeviceFn', 'RevokeDeviceFn'];
    for (const prefix of prefixes) {
      const matched = fns.filter((f) => f.id.startsWith(prefix));
      expect(matched, `no ${prefix} in the template`).toHaveLength(1);
      expect(matched[0]!.env.SITE_ORIGIN).toBe('https://app.tokenderby.co.uk');
    }
  });
});

describe('org access control routes', () => {
  let prod: Template;
  beforeAll(() => { prod = synth(); });

  // Every Phase 3 handler wired via makeFn/addRoutes. Checked by
  // function-logical-id prefix (not just "a route with this key exists") so a
  // route wired to the wrong Lambda fails here rather than passing silently —
  // these three were unreachable in every deployed stack until this route.
  const NEW_ROUTES: Array<{ routeKey: string; fnPrefix: string }> = [
    { routeKey: 'PUT /api/organisations/{org_name}/access', fnPrefix: 'SetOrgAccessFn' },
    { routeKey: 'POST /api/organisations/{org_name}/join-token/rotate', fnPrefix: 'RotateOrgJoinTokenFn' },
    { routeKey: 'DELETE /api/organisations/{org_name}/members/{user_id}', fnPrefix: 'RemoveOrgMemberFn' },
  ];

  it('wires each org access control route to its own handler', () => {
    for (const { routeKey, fnPrefix } of NEW_ROUTES) {
      const fnLogicalId = routeTargetFunctionLogicalId(prod, routeKey);
      expect(fnLogicalId.startsWith(fnPrefix), `${routeKey} -> ${fnLogicalId}, expected prefix ${fnPrefix}`).toBe(true);
    }
  });

  // The omission guard: rotation is its own POST endpoint precisely because a
  // retried PUT must never mint a second token. If rotation were folded back
  // onto the access route, or its integration pointed at set-org-access, a
  // retried rotate would silently resolve to the settings handler instead.
  it('keeps join-token/rotate on its own handler, distinct from PUT .../access', () => {
    const rotateFn = routeTargetFunctionLogicalId(prod, 'POST /api/organisations/{org_name}/join-token/rotate');
    const accessFn = routeTargetFunctionLogicalId(prod, 'PUT /api/organisations/{org_name}/access');
    expect(rotateFn.startsWith('RotateOrgJoinTokenFn'), `rotate -> ${rotateFn}`).toBe(true);
    expect(accessFn.startsWith('SetOrgAccessFn'), `access -> ${accessFn}`).toBe(true);
    expect(rotateFn).not.toBe(accessFn);
  });

  // DELETE .../members/{user_id} overlaps in path shape with GET .../members.
  // If remove-org-member were ever forgotten, or wired to list-org-members,
  // this would need to fail rather than pass on a RouteKey-only check.
  it('keeps GET .../members and DELETE .../members/{user_id} on separate handlers', () => {
    const listFn = routeTargetFunctionLogicalId(prod, 'GET /api/organisations/{org_name}/members');
    const removeFn = routeTargetFunctionLogicalId(prod, 'DELETE /api/organisations/{org_name}/members/{user_id}');
    expect(listFn.startsWith('ListOrgMembersFn'), `GET .../members -> ${listFn}, expected ListOrgMembersFn`).toBe(true);
    expect(removeFn.startsWith('RemoveOrgMemberFn'), `DELETE .../members/{user_id} -> ${removeFn}, expected RemoveOrgMemberFn`).toBe(true);
    expect(listFn).not.toBe(removeFn);
  });

  it('gives every org access control handler SITE_ORIGIN', () => {
    const fns = appFunctions(prod);
    // Guards the prefix filters above the same way the top-level count guard
    // does: an empty match per prefix would make its own SITE_ORIGIN check vacuous.
    const prefixes = ['SetOrgAccessFn', 'RotateOrgJoinTokenFn', 'RemoveOrgMemberFn'];
    for (const prefix of prefixes) {
      const matched = fns.filter((f) => f.id.startsWith(prefix));
      expect(matched, `no ${prefix} in the template`).toHaveLength(1);
      expect(matched[0]!.env.SITE_ORIGIN).toBe('https://app.tokenderby.co.uk');
    }
  });
});

describe('admin claim redemptions route', () => {
  let prod: Template;
  beforeAll(() => { prod = synth(); });

  it('wires GET /api/admin/claims/{code}/redemptions to its own handler', () => {
    const fnLogicalId = routeTargetFunctionLogicalId(prod, 'GET /api/admin/claims/{code}/redemptions');
    expect(fnLogicalId.startsWith('AdminListClaimRedemptionsFn'), `redemptions route -> ${fnLogicalId}`).toBe(true);
  });
});

describe('CloudFront must not swallow API errors', () => {
  // The SPA deep-link fallback used to be `errorResponses: 403/404 → 200
  // /index.html`, which CloudFront applies to the WHOLE distribution — /api/*
  // included. A CLAIM_NOT_FOUND (404) reached the CLI as `200 text/html`, so it
  // saw the site shell where it expected JSON. SPA routing now happens in a
  // viewer-request function on the site behaviour only, leaving /api/* alone.
  it('rewrites no error status on any distribution', () => {
    const distributions = synth().findResources('AWS::CloudFront::Distribution');

    expect(Object.keys(distributions).length).toBeGreaterThan(0);
    for (const [id, resource] of Object.entries(distributions)) {
      const rewrites = resource.Properties?.DistributionConfig?.CustomErrorResponses ?? [];
      expect(rewrites, `${id} still rewrites an error status`).toEqual([]);
    }
  });

  it('attaches the SPA rewrite to the app and admin behaviours but not to /api/auth/*', () => {
    const distributions = synth().findResources('AWS::CloudFront::Distribution');
    const byDomain = (domain: string) => {
      const found = Object.values(distributions).find(
        (r: any) => r.Properties.DistributionConfig.Aliases?.includes(domain),
      ) as any;
      expect(found, `no distribution for ${domain}`).toBeDefined();
      return found.Properties.DistributionConfig;
    };

    for (const domain of [CONFIG.appDomain, CONFIG.adminDomain]) {
      expect(byDomain(domain).DefaultCacheBehavior.FunctionAssociations, `${domain} has no SPA rewrite`).toBeDefined();
    }

    const authBehaviour = (byDomain(CONFIG.appDomain).CacheBehaviors ?? [])
      .find((b: any) => b.PathPattern === '/api/auth/*');
    expect(authBehaviour, 'app has no /api/auth/* behaviour').toBeDefined();
    expect(authBehaviour.FunctionAssociations, 'app rewrites /api/auth/* requests').toBeUndefined();
  });
});

describe('domains', () => {
  let distributions: Record<string, any>;
  beforeAll(() => { distributions = synth().findResources('AWS::CloudFront::Distribution'); });

  const configFor = (domain: string) => {
    const found = Object.values(distributions).find(
      (r: any) => r.Properties.DistributionConfig.Aliases?.includes(domain),
    ) as any;
    expect(found, `no distribution for ${domain}`).toBeDefined();
    return found.Properties.DistributionConfig;
  };

  it('serves every host from exactly one distribution', () => {
    const aliases = Object.values(distributions).flatMap((r: any) => r.Properties.DistributionConfig.Aliases ?? []);
    const expected = [
      CONFIG.appDomain, CONFIG.apiDomain, CONFIG.adminDomain, CONFIG.marketDomain, ...CONFIG.apexDomains,
      CONFIG.legacySiteDomain, CONFIG.legacyAdminDomain,
    ];
    expect([...aliases].sort()).toEqual([...expected].sort());
  });

  it('proxies the api host to the gateway with nothing else on it', () => {
    const api = configFor(CONFIG.apiDomain);
    expect(api.DefaultCacheBehavior.FunctionAssociations).toHaveLength(1);
    expect(api.CacheBehaviors ?? []).toEqual([]);
  });

  // Published CLIs hardcode token-derby.mauricode.co.uk/api.
  it('keeps /api/* on the legacy site host for older CLIs', () => {
    const legacy = configFor(CONFIG.legacySiteDomain);
    const api = (legacy.CacheBehaviors ?? []).find((b: any) => b.PathPattern === '/api/*');
    expect(api, 'legacy site lost its /api/* behaviour').toBeDefined();
    expect(api.FunctionAssociations).toBeUndefined();
  });

  it('does not proxy the API from the admin host', () => {
    expect(configFor(CONFIG.adminDomain).CacheBehaviors ?? []).toEqual([]);
  });

  it('serves the market host from the site bucket with the SPA rewrite and no API behaviour', () => {
    const market = configFor(CONFIG.marketDomain);
    const app = configFor(CONFIG.appDomain);
    expect(market.Origins[0].DomainName).toEqual(app.Origins[0].DomainName);
    expect(market.DefaultCacheBehavior.FunctionAssociations).toBeDefined();
    expect(market.DefaultRootObject).toBe('index.html');
    expect(market.CacheBehaviors ?? []).toEqual([]);
  });

  it('puts the market host on the shared certificate and in DNS', () => {
    const template = synth();
    const json = JSON.stringify(template.toJSON());
    expect(json).toContain(CONFIG.marketDomain);
    const records = Object.values(template.findResources('AWS::Route53::RecordSet')) as any[];
    expect(records.some((r) => String(r.Properties.Name).startsWith(CONFIG.marketDomain))).toBe(true);
    const certs = Object.values(template.findResources('AWS::CloudFormation::CustomResource')) as any[];
    expect(certs.some((c) => (c.Properties.SubjectAlternativeNames ?? []).includes(CONFIG.marketDomain))).toBe(true);
  });
});
