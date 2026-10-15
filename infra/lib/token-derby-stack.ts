import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { HttpApi, HttpMethod, CorsHttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as path from 'path';
import type { EnvConfig } from './env-config';
import { SPA_REWRITE_CODE } from './spa-rewrite';
import { API_PREFIX_CODE, redirectCode } from './edge-functions';

interface TokenDerbyStackProps extends cdk.StackProps {
  config: EnvConfig;
}

export class TokenDerbyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: TokenDerbyStackProps) {
    super(scope, id, props);
    const { config } = props;
    const APP_DOMAIN = config.appDomain;
    const API_DOMAIN = config.apiDomain;
    const ADMIN_DOMAIN = config.adminDomain;
    const TABLE_NAME = config.tableName;

    // ── Route 53 + ACM (certs must live in us-east-1 for CloudFront) ───
    const zone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: config.zoneDomain,
    });

    const domainCertificate = new acm.DnsValidatedCertificate(this, 'DomainCertificate', {
      domainName: APP_DOMAIN,
      subjectAlternativeNames: [API_DOMAIN, ADMIN_DOMAIN, ...config.apexDomains],
      hostedZone: zone,
      region: 'us-east-1',
    }) as unknown as acm.ICertificate;

    // Legacy mauricode.co.uk hosts, kept alive as redirects.
    const legacyZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: config.legacyZoneDomain,
    });

    const certificate = new acm.DnsValidatedCertificate(this, 'Certificate', {
      domainName: config.legacySiteDomain,
      hostedZone: legacyZone,
      region: 'us-east-1',
    });

    const adminCertificate = new acm.DnsValidatedCertificate(this, 'AdminCertificate', {
      domainName: config.legacyAdminDomain,
      hostedZone: legacyZone,
      region: 'us-east-1',
    });

    // ── DynamoDB single table ──────────────────────────────────────────
    const table = new dynamodb.Table(this, 'TokenDerbyTable', {
      tableName: TABLE_NAME,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      timeToLiveAttribute: 'ttl',
    });

    table.addGlobalSecondaryIndex({
      indexName: 'JoinCodeIndex',
      partitionKey: { name: 'join_code', type: dynamodb.AttributeType.STRING },
    });

    table.addGlobalSecondaryIndex({
      indexName: 'AdminCodeIndex',
      partitionKey: { name: 'admin_code', type: dynamodb.AttributeType.STRING },
    });

    // Org names are looked up case-insensitively, by their lower-cased key.
    table.addGlobalSecondaryIndex({
      indexName: 'OrgNameKeyIndex',
      partitionKey: { name: 'org_name_key', type: dynamodb.AttributeType.STRING },
    });

    table.addGlobalSecondaryIndex({
      indexName: 'OrgJoinTokenIndex',
      partitionKey: { name: 'org_join_token', type: dynamodb.AttributeType.STRING },
    });

    table.addGlobalSecondaryIndex({
      indexName: 'OrgMembershipIndex',
      partitionKey: { name: 'member_user_id', type: dynamodb.AttributeType.STRING },
    });

    table.addGlobalSecondaryIndex({
      indexName: 'OrgRacesIndex',
      partitionKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'start_time', type: dynamodb.AttributeType.STRING },
    });

    table.addGlobalSecondaryIndex({
      indexName: 'SchedulesIndex',
      partitionKey: { name: 'schedule_marker', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
    });

    table.addGlobalSecondaryIndex({
      indexName: 'LeaguesIndex',
      partitionKey: { name: 'league_marker', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
    });

    // Sparse — only Slack-configured org meta rows carry `slack_marker`, so the
    // per-minute digest sweep queries a handful of entries instead of scanning
    // the whole table.
    table.addGlobalSecondaryIndex({
      indexName: 'SlackOrgsIndex',
      partitionKey: { name: 'slack_marker', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
    });

    // ── Winner sprite bucket (public, content-addressed) ────────────────
    const spriteBucket = new s3.Bucket(this, 'WinnerSprites', {
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: true,
        ignorePublicAcls: true,
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      }),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    spriteBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      principals: [new iam.AnyPrincipal()],
      resources: [spriteBucket.arnForObjects('winners/*')],
    }));

    // ── Lambda factory ─────────────────────────────────────────────────
    const apiDir = path.resolve(__dirname, '..', '..', 'api', 'src', 'handlers');
    // CloudFront replaces the viewer Host with the API Gateway domain, so the
    // OAuth redirect_uri cannot be derived from the request. App domain: the
    // org manager and its /api/auth/* proxy (which holds the state cookie) live there.
    const commonEnv = {
      TABLE_NAME,
      NODE_OPTIONS: '--enable-source-maps',
      ADMIN_SSM_PREFIX: config.ssmPrefix,
      AUTH_SSM_PREFIX: config.authSsmPrefix,
      SITE_ORIGIN: `https://${APP_DOMAIN}`,
    };

    const makeFn = (name: string, fileBase: string, opts?: { timeout?: cdk.Duration }) => {
      const fn = new NodejsFunction(this, name, {
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: path.join(apiDir, `${fileBase}.ts`),
        handler: 'handler',
        timeout: opts?.timeout ?? cdk.Duration.seconds(10),
        memorySize: 256,
        environment: commonEnv,
        bundling: {
          target: 'node22',
          sourceMap: true,
          externalModules: ['@aws-sdk/*'],
        },
      });
      table.grantReadWriteData(fn);
      return fn;
    };

    const createRaceFn = makeFn('CreateRaceFn', 'create-race');
    const getRaceFn = makeFn('GetRaceFn', 'get-race');
    const getSeriesFn = makeFn('GetSeriesFn', 'get-series');
    const joinRaceFn = makeFn('JoinRaceFn', 'join-race');
    const heartbeatFn = makeFn('HeartbeatFn', 'heartbeat');
    const endRaceFn = makeFn('EndRaceFn', 'end-race');

    // race.ended fires from finaliseRace, invoked by get-race, heartbeat, and
    // end-race — those are the only handlers that render/upload a winner sprite.
    for (const fn of [getRaceFn, heartbeatFn, endRaceFn]) {
      spriteBucket.grantPut(fn);
      fn.addEnvironment('SPRITE_BUCKET', spriteBucket.bucketName);
    }
    const createOrgFn = makeFn('CreateOrgFn', 'create-organisation');
    const joinOrgFn = makeFn('JoinOrgFn', 'join-organisation');
    const listOrgsFn = makeFn('ListOrgsFn', 'list-organisations');
    const getOrgFn = makeFn('GetOrgFn', 'get-organisation');
    const listOrgRacesFn = makeFn('ListOrgRacesFn', 'list-org-races');
    const getOrgLeaderboardFn = makeFn('GetOrgLeaderboardFn', 'get-org-leaderboard');
    const setOrgWebhookFn = makeFn('SetOrgWebhookFn', 'set-org-webhook');
    const getOrgWebhookFn = makeFn('GetOrgWebhookFn', 'get-org-webhook');
    const deleteOrgWebhookFn = makeFn('DeleteOrgWebhookFn', 'delete-org-webhook');
    const setOrgSlackFn = makeFn('SetOrgSlackFn', 'set-org-slack');
    const getOrgSlackFn = makeFn('GetOrgSlackFn', 'get-org-slack');
    const deleteOrgSlackFn = makeFn('DeleteOrgSlackFn', 'delete-org-slack');
    const setOrgScheduleFn = makeFn('SetOrgScheduleFn', 'set-org-schedule');
    const getOrgScheduleFn = makeFn('GetOrgScheduleFn', 'get-org-schedule');
    const setOrgRaceSettingsFn = makeFn('SetOrgRaceSettingsFn', 'set-org-race-settings');
    const getOrgRaceSettingsFn = makeFn('GetOrgRaceSettingsFn', 'get-org-race-settings');
    const deleteOrgScheduleFn = makeFn('DeleteOrgScheduleFn', 'delete-org-schedule');
    const setOrgLeagueFn = makeFn('SetOrgLeagueFn', 'set-org-league');
    const getOrgLeagueFn = makeFn('GetOrgLeagueFn', 'get-org-league');
    const deleteOrgLeagueFn = makeFn('DeleteOrgLeagueFn', 'delete-org-league');
    const getOrgLeagueStandingsFn = makeFn('GetOrgLeagueStandingsFn', 'get-org-league-standings');
    const createWebSessionFn = makeFn('CreateWebSessionFn', 'create-web-session');
    const exchangeWebSessionFn = makeFn('ExchangeWebSessionFn', 'exchange-web-session');
    const deleteWebSessionFn = makeFn('DeleteWebSessionFn', 'delete-web-session');
    const deleteAllWebSessionsFn = makeFn('DeleteAllWebSessionsFn', 'delete-all-web-sessions');
    const authGoogleStartFn = makeFn('AuthGoogleStartFn', 'auth-google-start');
    const authLinkStartFn = makeFn('AuthLinkStartFn', 'auth-link-start');
    const authGoogleCallbackFn = makeFn('AuthGoogleCallbackFn', 'auth-google-callback');
    const listOrgMembersFn = makeFn('ListOrgMembersFn', 'list-org-members');
    const setOrgAccessFn = makeFn('SetOrgAccessFn', 'set-org-access');
    const rotateOrgJoinTokenFn = makeFn('RotateOrgJoinTokenFn', 'rotate-org-join-token');
    const removeOrgMemberFn = makeFn('RemoveOrgMemberFn', 'remove-org-member');
    const scheduleTickFn = makeFn('ScheduleTickFn', 'schedule-tick', { timeout: cdk.Duration.seconds(120) });

    const authCliStartFn = makeFn('AuthCliStartFn', 'auth-cli-start');
    const authCliApproveFn = makeFn('AuthCliApproveFn', 'auth-cli-approve');
    const authCliPollFn = makeFn('AuthCliPollFn', 'auth-cli-poll');
    const listDevicesFn = makeFn('ListDevicesFn', 'list-devices');
    const registerDeviceFn = makeFn('RegisterDeviceFn', 'register-device');
    const revokeDeviceFn = makeFn('RevokeDeviceFn', 'revoke-device');
    const logoutDeviceFn = makeFn('LogoutDeviceFn', 'logout-device');

    new events.Rule(this, 'ScheduleTickRule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
      targets: [new eventsTargets.LambdaFunction(scheduleTickFn)],
    });

    // League fixtures are materialised by the same ScheduleTick Lambda above
    // (it iterates leagues too) — no separate tick Lambda/rule.

    // Series points expire via DynamoDB TTL (the `ttl` attribute stamped at write
    // time in api/src/db/series.ts) — no maintenance sweep Lambda needed.

    const initJockeyFn = makeFn('InitJockeyFn', 'init-jockey');
    const getJockeyFn = makeFn('GetJockeyFn', 'get-jockey');
    const updateJockeyFn = makeFn('UpdateJockeyFn', 'update-jockey');
    const listStableFn = makeFn('ListStableFn', 'list-stable');
    const createStableHorseFn = makeFn('CreateStableHorseFn', 'create-stable-horse');
    const updateStableHorseFn = makeFn('UpdateStableHorseFn', 'update-stable-horse');
    const deleteStableHorseFn = makeFn('DeleteStableHorseFn', 'delete-stable-horse');
    const rollHatFn = makeFn('RollHatFn', 'roll-hat');
    const equipHatFn = makeFn('EquipHatFn', 'equip-hat');

    const adminLoginFn = makeFn('AdminLoginFn', 'admin-login');
    const adminListUsersFn = makeFn('AdminListUsersFn', 'admin-list-users');
    const adminListOrgsFn = makeFn('AdminListOrgsFn', 'admin-list-organisations');
    const adminRenameUserFn = makeFn('AdminRenameUserFn', 'admin-rename-user');
    const adminRenameHorseFn = makeFn('AdminRenameHorseFn', 'admin-rename-horse');
    const adminRemoveHatFn = makeFn('AdminRemoveHatFn', 'admin-remove-hat');
    const adminDeleteHorseFn = makeFn('AdminDeleteHorseFn', 'admin-delete-horse');
    const adminAnnounceReleaseFn = makeFn('AdminAnnounceReleaseFn', 'admin-announce-release', { timeout: cdk.Duration.seconds(60) });

    const adminCreateClaimFn = makeFn('AdminCreateClaimFn', 'admin-create-claim');
    const adminListClaimsFn = makeFn('AdminListClaimsFn', 'admin-list-claims');
    const adminListClaimRedemptionsFn = makeFn('AdminListClaimRedemptionsFn', 'admin-list-claim-redemptions');
    const getClaimFn = makeFn('GetClaimFn', 'get-claim');
    const redeemClaimFn = makeFn('RedeemClaimFn', 'redeem-claim');

    const adminSsmArn = `arn:aws:ssm:${this.region}:${this.account}:parameter${config.ssmPrefix}/*`;
    for (const fn of [adminLoginFn, adminListUsersFn, adminListOrgsFn, adminRenameUserFn, adminRenameHorseFn, adminRemoveHatFn, adminDeleteHorseFn, adminAnnounceReleaseFn, adminCreateClaimFn, adminListClaimsFn, adminListClaimRedemptionsFn]) {
      fn.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [adminSsmArn],
      }));
    }

    const authSsmArn = `arn:aws:ssm:${this.region}:${this.account}:parameter${config.authSsmPrefix}/*`;
    for (const fn of [authGoogleStartFn, authLinkStartFn, authGoogleCallbackFn]) {
      fn.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [authSsmArn],
      }));
    }

    // ── HTTP API Gateway ───────────────────────────────────────────────
    const httpApi = new HttpApi(this, 'TokenDerbyApi', {
      apiName: config.apiName,
      corsPreflight: {
        // The API serves public, read-only race data and authenticates writes
        // with per-request secret tokens (never cookies), so there are no
        // credentialed cross-origin requests to protect. Allow any origin so
        // anyone can build their own read-only viewer against it. Safe with
        // allowCredentials unset (false): the gateway returns a literal `*`.
        allowOrigins: ['*'],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.PUT, CorsHttpMethod.DELETE, CorsHttpMethod.OPTIONS],
        allowHeaders: ['content-type', 'authorization', 'x-user-id', 'x-user-token', 'x-cli-version'],
      },
    });

    httpApi.addRoutes({ path: '/api/races', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('CreateRaceInt', createRaceFn) });
    httpApi.addRoutes({ path: '/api/races/{join_code}', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('GetRaceInt', getRaceFn) });
    httpApi.addRoutes({ path: '/api/races/{join_code}/series', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('GetSeriesInt', getSeriesFn) });
    httpApi.addRoutes({ path: '/api/races/{join_code}/join', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('JoinRaceInt', joinRaceFn) });
    httpApi.addRoutes({ path: '/api/races/{join_code}/horses/{horse_id}/heartbeat', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('HeartbeatInt', heartbeatFn) });
    httpApi.addRoutes({ path: '/api/races/admin/{admin_code}', methods: [HttpMethod.DELETE], integration: new HttpLambdaIntegration('EndRaceInt', endRaceFn) });
    httpApi.addRoutes({ path: '/api/organisations', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('CreateOrgInt', createOrgFn) });
    httpApi.addRoutes({ path: '/api/organisations', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('ListOrgsInt', listOrgsFn) });
    httpApi.addRoutes({ path: '/api/organisations/join', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('JoinOrgInt', joinOrgFn) });
    httpApi.addRoutes({ path: '/api/organisations/{org_name}', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('GetOrgInt', getOrgFn) });
    httpApi.addRoutes({ path: '/api/organisations/{org_name}/races', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('ListOrgRacesInt', listOrgRacesFn) });
    httpApi.addRoutes({ path: '/api/organisations/{org_name}/leaderboard', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('GetOrgLeaderboardInt', getOrgLeaderboardFn) });
    httpApi.addRoutes({
      path: '/api/organisations/{org_name}/webhook',
      methods: [HttpMethod.PUT],
      integration: new HttpLambdaIntegration('SetOrgWebhookInt', setOrgWebhookFn),
    });
    httpApi.addRoutes({
      path: '/api/organisations/{org_name}/webhook',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetOrgWebhookInt', getOrgWebhookFn),
    });
    httpApi.addRoutes({
      path: '/api/organisations/{org_name}/webhook',
      methods: [HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('DeleteOrgWebhookInt', deleteOrgWebhookFn),
    });
    httpApi.addRoutes({
      path: '/api/organisations/{org_name}/slack',
      methods: [HttpMethod.PUT],
      integration: new HttpLambdaIntegration('SetOrgSlackInt', setOrgSlackFn),
    });
    httpApi.addRoutes({
      path: '/api/organisations/{org_name}/slack',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetOrgSlackInt', getOrgSlackFn),
    });
    httpApi.addRoutes({
      path: '/api/organisations/{org_name}/slack',
      methods: [HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('DeleteOrgSlackInt', deleteOrgSlackFn),
    });
    httpApi.addRoutes({
      path: '/api/organisations/{org_name}/schedule',
      methods: [HttpMethod.PUT],
      integration: new HttpLambdaIntegration('SetOrgScheduleInt', setOrgScheduleFn),
    });
    httpApi.addRoutes({
      path: '/api/organisations/{org_name}/schedule',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetOrgScheduleInt', getOrgScheduleFn),
    });
    httpApi.addRoutes({
      path: '/api/organisations/{org_name}/schedule',
      methods: [HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('DeleteOrgScheduleInt', deleteOrgScheduleFn),
    });
    httpApi.addRoutes({
      path: '/api/organisations/{org_name}/race-settings',
      methods: [HttpMethod.PUT],
      integration: new HttpLambdaIntegration('SetOrgRaceSettingsInt', setOrgRaceSettingsFn),
    });
    httpApi.addRoutes({
      path: '/api/organisations/{org_name}/race-settings',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetOrgRaceSettingsInt', getOrgRaceSettingsFn),
    });
    httpApi.addRoutes({
      path: '/api/organisations/{org_name}/league',
      methods: [HttpMethod.PUT],
      integration: new HttpLambdaIntegration('SetOrgLeagueInt', setOrgLeagueFn),
    });
    httpApi.addRoutes({
      path: '/api/organisations/{org_name}/league',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetOrgLeagueInt', getOrgLeagueFn),
    });
    httpApi.addRoutes({
      path: '/api/organisations/{org_name}/league',
      methods: [HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('DeleteOrgLeagueInt', deleteOrgLeagueFn),
    });
    httpApi.addRoutes({
      path: '/api/organisations/{org_name}/league/standings',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetOrgLeagueStandingsInt', getOrgLeagueStandingsFn),
    });
    httpApi.addRoutes({ path: '/api/organisations/{org_name}/members', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('ListOrgMembersInt', listOrgMembersFn) });
    httpApi.addRoutes({ path: '/api/organisations/{org_name}/access', methods: [HttpMethod.PUT], integration: new HttpLambdaIntegration('SetOrgAccessInt', setOrgAccessFn) });
    // Own endpoint, not a flag on the PUT above: a PUT is retryable, and a
    // retried rotation must not mint a second token. API Gateway prefers a
    // static segment over a path variable regardless of declaration order, so
    // this is never at risk of being swallowed by a broader {org_name}/...
    // pattern here (unlike scripts/local-api.ts, where order matters).
    httpApi.addRoutes({ path: '/api/organisations/{org_name}/join-token/rotate', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('RotateOrgJoinTokenInt', rotateOrgJoinTokenFn) });
    httpApi.addRoutes({ path: '/api/organisations/{org_name}/members/{user_id}', methods: [HttpMethod.DELETE], integration: new HttpLambdaIntegration('RemoveOrgMemberInt', removeOrgMemberFn) });
    httpApi.addRoutes({ path: '/api/web-sessions', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('CreateWebSessionInt', createWebSessionFn) });
    httpApi.addRoutes({ path: '/api/web-sessions/exchange', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('ExchangeWebSessionInt', exchangeWebSessionFn) });
    httpApi.addRoutes({ path: '/api/web-sessions', methods: [HttpMethod.DELETE], integration: new HttpLambdaIntegration('DeleteWebSessionInt', deleteWebSessionFn) });
    httpApi.addRoutes({ path: '/api/web-sessions/all', methods: [HttpMethod.DELETE], integration: new HttpLambdaIntegration('DeleteAllWebSessionsInt', deleteAllWebSessionsFn) });
    httpApi.addRoutes({ path: '/api/auth/google/start', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('AuthGoogleStartInt', authGoogleStartFn) });
    httpApi.addRoutes({ path: '/api/auth/link/start', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('AuthLinkStartInt', authLinkStartFn) });
    httpApi.addRoutes({ path: '/api/auth/google/callback', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('AuthGoogleCallbackInt', authGoogleCallbackFn) });
    httpApi.addRoutes({ path: '/api/auth/cli/start', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('AuthCliStartInt', authCliStartFn) });
    httpApi.addRoutes({ path: '/api/auth/cli/approve', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('AuthCliApproveInt', authCliApproveFn) });
    httpApi.addRoutes({ path: '/api/auth/cli/poll', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('AuthCliPollInt', authCliPollFn) });
    httpApi.addRoutes({ path: '/api/devices', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('ListDevicesInt', listDevicesFn) });
    // Distinct from the GET above: a route key is method-plus-path, so the two
    // coexist on the same path. This is the CLI's direct registration, used by
    // `link` to trade a legacy account-level credential for a device one.
    httpApi.addRoutes({ path: '/api/devices', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('RegisterDeviceInt', registerDeviceFn) });
    // Static beats variable in API Gateway route selection, so declaration
    // order here is not what keeps these distinct — but both must exist:
    // dropping /devices/me would silently fall through to {device_id} with
    // device_id="me", leaving a live credential un-revoked on logout.
    httpApi.addRoutes({ path: '/api/devices/me', methods: [HttpMethod.DELETE], integration: new HttpLambdaIntegration('LogoutDeviceInt', logoutDeviceFn) });
    httpApi.addRoutes({ path: '/api/devices/{device_id}', methods: [HttpMethod.DELETE], integration: new HttpLambdaIntegration('RevokeDeviceInt', revokeDeviceFn) });
    httpApi.addRoutes({ path: '/api/jockey/init', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('InitJockeyInt', initJockeyFn) });
    httpApi.addRoutes({ path: '/api/jockey/me', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('GetJockeyInt', getJockeyFn) });
    httpApi.addRoutes({ path: '/api/jockey/me', methods: [HttpMethod.PUT], integration: new HttpLambdaIntegration('UpdateJockeyInt', updateJockeyFn) });
    httpApi.addRoutes({ path: '/api/jockey/me/horses', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('ListStableInt', listStableFn) });
    httpApi.addRoutes({ path: '/api/jockey/me/horses', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('CreateStableHorseInt', createStableHorseFn) });
    httpApi.addRoutes({ path: '/api/jockey/me/horses/{stable_horse_id}', methods: [HttpMethod.PUT], integration: new HttpLambdaIntegration('UpdateStableHorseInt', updateStableHorseFn) });
    httpApi.addRoutes({ path: '/api/jockey/me/horses/{stable_horse_id}', methods: [HttpMethod.DELETE], integration: new HttpLambdaIntegration('DeleteStableHorseInt', deleteStableHorseFn) });
    httpApi.addRoutes({ path: '/api/jockey/me/horses/{stable_horse_id}/roll',  methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('RollHatInt',  rollHatFn) });
    httpApi.addRoutes({ path: '/api/jockey/me/horses/{stable_horse_id}/equip', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('EquipHatInt', equipHatFn) });

    httpApi.addRoutes({ path: '/api/admin/login', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('AdminLoginInt', adminLoginFn) });
    httpApi.addRoutes({ path: '/api/admin/users', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('AdminListUsersInt', adminListUsersFn) });
    httpApi.addRoutes({ path: '/api/admin/organisations', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('AdminListOrgsInt', adminListOrgsFn) });
    httpApi.addRoutes({ path: '/api/admin/users/{user_id}', methods: [HttpMethod.PUT], integration: new HttpLambdaIntegration('AdminRenameUserInt', adminRenameUserFn) });
    httpApi.addRoutes({ path: '/api/admin/users/{user_id}/horses/{stable_horse_id}', methods: [HttpMethod.PUT], integration: new HttpLambdaIntegration('AdminRenameHorseInt', adminRenameHorseFn) });
    httpApi.addRoutes({ path: '/api/admin/users/{user_id}/horses/{stable_horse_id}/hats/{index}', methods: [HttpMethod.DELETE], integration: new HttpLambdaIntegration('AdminRemoveHatInt', adminRemoveHatFn) });
    httpApi.addRoutes({ path: '/api/admin/users/{user_id}/horses/{stable_horse_id}', methods: [HttpMethod.DELETE], integration: new HttpLambdaIntegration('AdminDeleteHorseInt', adminDeleteHorseFn) });
    httpApi.addRoutes({ path: '/api/admin/releases', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('AdminAnnounceReleaseInt', adminAnnounceReleaseFn) });
    httpApi.addRoutes({ path: '/api/admin/claims', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('AdminCreateClaimInt', adminCreateClaimFn) });
    httpApi.addRoutes({ path: '/api/admin/claims', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('AdminListClaimsInt', adminListClaimsFn) });
    httpApi.addRoutes({ path: '/api/admin/claims/{code}/redemptions', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('AdminListClaimRedemptionsInt', adminListClaimRedemptionsFn) });
    httpApi.addRoutes({ path: '/api/claims/{code}', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('GetClaimInt', getClaimFn) });
    httpApi.addRoutes({ path: '/api/claims/{code}/redeem', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('RedeemClaimInt', redeemClaimFn) });

    // API throttling (rate-limit guardrails, not hard security)
    const defaultStage = httpApi.defaultStage!.node.defaultChild as apigatewayv2.CfnStage;
    defaultStage.defaultRouteSettings = {
      throttlingBurstLimit: 50,
      throttlingRateLimit: 20,
    };

    // ── Static site bucket (populated in Plan 3) ──────────────────────
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ── CloudFront ─────────────────────────────────────────────────────
    const apiUrl = cdk.Fn.select(1, cdk.Fn.split('://', httpApi.url!));
    const apiGatewayDomain = cdk.Fn.select(0, cdk.Fn.split('/', apiUrl));
    const apiOrigin = new origins.HttpOrigin(apiGatewayDomain, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    });

    const apiBehaviour = (functionAssociations?: cloudfront.FunctionAssociation[]): cloudfront.BehaviorOptions => ({
      origin: apiOrigin,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      functionAssociations,
    });

    const viewerRequest = (id: string, code: string): cloudfront.FunctionAssociation[] => [{
      function: new cloudfront.Function(this, id, {
        code: cloudfront.FunctionCode.fromInline(code),
        runtime: cloudfront.FunctionRuntime.JS_2_0,
      }),
      eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
    }];

    // Rewrites SPA deep links to the shell. See spa-rewrite.ts for why this
    // replaces a distribution-wide errorResponses block, and spa-rewrite.test.ts
    // for the guard on the rule it uses.
    const spaRewriteAssociation = viewerRequest('SpaRewriteFn', SPA_REWRITE_CODE);

    // Redirect-only distributions answer at the edge; this origin is never reached.
    const redirectOrigin = new origins.HttpOrigin(APP_DOMAIN);

    // app.: the site, plus /api/auth/* so the Google flow's state cookie is
    // set and read on the same origin as the org manager.
    const appDistribution = new cloudfront.Distribution(this, 'AppDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: spaRewriteAssociation,
      },
      additionalBehaviors: { '/api/auth/*': apiBehaviour() },
      domainNames: [APP_DOMAIN],
      certificate: domainCertificate,
      defaultRootObject: 'index.html',
    });

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(path.resolve(__dirname, '..', '..', 'site', 'dist'))],
      destinationBucket: siteBucket,
      distribution: appDistribution,
      distributionPaths: ['/*'],
      cacheControl: [
        s3deploy.CacheControl.setPublic(),
        s3deploy.CacheControl.maxAge(cdk.Duration.seconds(0)),
        s3deploy.CacheControl.mustRevalidate(),
      ],
    });

    const appRecord = new route53.ARecord(this, 'AppAliasRecord', {
      zone,
      recordName: APP_DOMAIN,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(appDistribution)),
    });

    // api.: the gateway without the /api prefix.
    const apiDistribution = new cloudfront.Distribution(this, 'ApiDistribution', {
      defaultBehavior: apiBehaviour(viewerRequest('ApiPrefixFn', API_PREFIX_CODE)),
      domainNames: [API_DOMAIN],
      certificate: domainCertificate,
    });

    new route53.ARecord(this, 'ApiAliasRecord', {
      zone,
      recordName: API_DOMAIN,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(apiDistribution)),
    });

    // admin.: static only, it calls api. directly.
    const adminBucket = new s3.Bucket(this, 'AdminSiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const adminAppDistribution = new cloudfront.Distribution(this, 'AdminAppDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(adminBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: spaRewriteAssociation,
      },
      domainNames: [ADMIN_DOMAIN],
      certificate: domainCertificate,
      defaultRootObject: 'index.html',
    });

    new s3deploy.BucketDeployment(this, 'DeployAdminSite', {
      sources: [s3deploy.Source.asset(path.resolve(__dirname, '..', '..', 'admin', 'dist'))],
      destinationBucket: adminBucket,
      distribution: adminAppDistribution,
      distributionPaths: ['/*'],
      cacheControl: [
        s3deploy.CacheControl.setPublic(),
        s3deploy.CacheControl.maxAge(cdk.Duration.seconds(0)),
        s3deploy.CacheControl.mustRevalidate(),
      ],
    });

    const adminRecord = new route53.ARecord(this, 'AdminAppAliasRecord', {
      zone,
      recordName: ADMIN_DOMAIN,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(adminAppDistribution)),
    });

    // Bare and www hosts → app.
    const apexDistribution = new cloudfront.Distribution(this, 'ApexRedirectDistribution', {
      defaultBehavior: {
        origin: redirectOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        functionAssociations: viewerRequest('ApexRedirectFn', redirectCode(APP_DOMAIN)),
      },
      domainNames: config.apexDomains,
      certificate: domainCertificate,
    });

    config.apexDomains.forEach((domain, i) => {
      new route53.ARecord(this, i === 0 ? 'ApexAliasRecord' : 'WwwAliasRecord', {
        zone,
        recordName: domain,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(apexDistribution)),
      });
    });

    // ── Legacy mauricode.co.uk hosts ───────────────────────────────────
    // Pages 301 to the new hosts; /api/* stays because published CLIs
    // hardcode token-derby.mauricode.co.uk/api. Each waits for its new
    // host's record so the redirect never points at a name that isn't live.
    const legacyDistribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: redirectOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        functionAssociations: viewerRequest('LegacySiteRedirectFn', redirectCode(APP_DOMAIN)),
      },
      additionalBehaviors: { '/api/*': apiBehaviour() },
      domainNames: [config.legacySiteDomain],
      certificate: certificate as unknown as acm.ICertificate,
    });
    legacyDistribution.node.addDependency(appRecord);

    new route53.ARecord(this, 'AliasRecord', {
      zone: legacyZone,
      recordName: config.legacySiteDomain,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(legacyDistribution)),
    });

    const legacyAdminDistribution = new cloudfront.Distribution(this, 'AdminDistribution', {
      defaultBehavior: {
        origin: redirectOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        functionAssociations: viewerRequest('LegacyAdminRedirectFn', redirectCode(ADMIN_DOMAIN)),
      },
      domainNames: [config.legacyAdminDomain],
      certificate: adminCertificate as unknown as acm.ICertificate,
    });
    legacyAdminDistribution.node.addDependency(adminRecord);

    new route53.ARecord(this, 'AdminAliasRecord', {
      zone: legacyZone,
      recordName: config.legacyAdminDomain,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(legacyAdminDistribution)),
    });

    // ── Outputs ────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${APP_DOMAIN}` });
    new cdk.CfnOutput(this, 'ApiUrl', { value: `https://${API_DOMAIN}` });
    new cdk.CfnOutput(this, 'AdminSiteUrl', { value: `https://${ADMIN_DOMAIN}` });
    new cdk.CfnOutput(this, 'ApiGatewayUrl', { value: httpApi.url! });
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'DistributionId', { value: appDistribution.distributionId });
    new cdk.CfnOutput(this, 'AdminDistributionId', { value: adminAppDistribution.distributionId });
  }
}
