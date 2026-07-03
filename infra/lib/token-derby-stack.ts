import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
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
import type { EnvConfig } from '../bin/token-derby';

const HOSTED_ZONE_DOMAIN = 'mauricode.co.uk';

interface TokenDerbyStackProps extends cdk.StackProps {
  config: EnvConfig;
}

export class TokenDerbyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: TokenDerbyStackProps) {
    super(scope, id, props);
    const { config } = props;
    const DOMAIN_NAME = config.siteDomain;
    const ADMIN_DOMAIN_NAME = config.adminDomain;
    const TABLE_NAME = config.tableName;

    // ── Route 53 + ACM (cert must live in us-east-1 for CloudFront) ────
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: HOSTED_ZONE_DOMAIN,
    });

    const certificate = new acm.DnsValidatedCertificate(this, 'Certificate', {
      domainName: DOMAIN_NAME,
      hostedZone,
      region: 'us-east-1',
    });

    const adminCertificate = new acm.DnsValidatedCertificate(this, 'AdminCertificate', {
      domainName: ADMIN_DOMAIN_NAME,
      hostedZone,
      region: 'us-east-1',
    });

    // ── DynamoDB single table ──────────────────────────────────────────
    const table = new dynamodb.Table(this, 'TokenDerbyTable', {
      tableName: TABLE_NAME,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: config.disposable ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
    });

    table.addGlobalSecondaryIndex({
      indexName: 'JoinCodeIndex',
      partitionKey: { name: 'join_code', type: dynamodb.AttributeType.STRING },
    });

    table.addGlobalSecondaryIndex({
      indexName: 'AdminCodeIndex',
      partitionKey: { name: 'admin_code', type: dynamodb.AttributeType.STRING },
    });

    table.addGlobalSecondaryIndex({
      indexName: 'OrgNameIndex',
      partitionKey: { name: 'org_name', type: dynamodb.AttributeType.STRING },
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

    // ── Lambda factory ─────────────────────────────────────────────────
    const apiDir = path.resolve(__dirname, '..', '..', 'api', 'src', 'handlers');
    const commonEnv = { TABLE_NAME, NODE_OPTIONS: '--enable-source-maps', ADMIN_SSM_PREFIX: config.ssmPrefix };

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
    const createOrgFn = makeFn('CreateOrgFn', 'create-organisation');
    const joinOrgFn = makeFn('JoinOrgFn', 'join-organisation');
    const listOrgsFn = makeFn('ListOrgsFn', 'list-organisations');
    const getOrgFn = makeFn('GetOrgFn', 'get-organisation');
    const listOrgRacesFn = makeFn('ListOrgRacesFn', 'list-org-races');
    const getOrgLeaderboardFn = makeFn('GetOrgLeaderboardFn', 'get-org-leaderboard');
    const setOrgWebhookFn = makeFn('SetOrgWebhookFn', 'set-org-webhook');
    const getOrgWebhookFn = makeFn('GetOrgWebhookFn', 'get-org-webhook');
    const deleteOrgWebhookFn = makeFn('DeleteOrgWebhookFn', 'delete-org-webhook');
    const setOrgScheduleFn = makeFn('SetOrgScheduleFn', 'set-org-schedule');
    const getOrgScheduleFn = makeFn('GetOrgScheduleFn', 'get-org-schedule');
    const deleteOrgScheduleFn = makeFn('DeleteOrgScheduleFn', 'delete-org-schedule');
    const scheduleTickFn = makeFn('ScheduleTickFn', 'schedule-tick', { timeout: cdk.Duration.seconds(120) });

    new events.Rule(this, 'ScheduleTickRule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
      targets: [new eventsTargets.LambdaFunction(scheduleTickFn)],
    });

    // Daily sweep that deletes race time-series points older than two weeks, so
    // the table stays small. Longer timeout: it does a full-table scan + batched
    // deletes. Older finished races keep their standings; only the graphs go.
    const pruneSeriesFn = makeFn('PruneSeriesFn', 'prune-series', { timeout: cdk.Duration.seconds(300) });

    new events.Rule(this, 'PruneSeriesRule', {
      schedule: events.Schedule.rate(cdk.Duration.days(1)),
      targets: [new eventsTargets.LambdaFunction(pruneSeriesFn)],
    });

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

    const adminSsmArn = `arn:aws:ssm:${this.region}:${this.account}:parameter${config.ssmPrefix}/*`;
    for (const fn of [adminLoginFn, adminListUsersFn, adminListOrgsFn, adminRenameUserFn, adminRenameHorseFn, adminRemoveHatFn, adminDeleteHorseFn]) {
      fn.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [adminSsmArn],
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

    // ── CloudFront with /api/* proxy to API Gateway ───────────────────
    const apiUrl = cdk.Fn.select(1, cdk.Fn.split('://', httpApi.url!));
    const apiDomain = cdk.Fn.select(0, cdk.Fn.split('/', apiUrl));
    const apiOrigin = new origins.HttpOrigin(apiDomain, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      domainNames: [DOMAIN_NAME],
      certificate: certificate as unknown as acm.ICertificate,
      defaultRootObject: 'index.html',
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(path.resolve(__dirname, '..', '..', 'site', 'dist'))],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
      cacheControl: [
        s3deploy.CacheControl.setPublic(),
        s3deploy.CacheControl.maxAge(cdk.Duration.seconds(0)),
        s3deploy.CacheControl.mustRevalidate(),
      ],
    });

    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: DOMAIN_NAME,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    });

    // ── Admin subdomain: its own bucket + CloudFront, /api/* → same API ──
    const adminBucket = new s3.Bucket(this, 'AdminSiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const adminDistribution = new cloudfront.Distribution(this, 'AdminDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(adminBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      domainNames: [ADMIN_DOMAIN_NAME],
      certificate: adminCertificate as unknown as acm.ICertificate,
      defaultRootObject: 'index.html',
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    new s3deploy.BucketDeployment(this, 'DeployAdminSite', {
      sources: [s3deploy.Source.asset(path.resolve(__dirname, '..', '..', 'admin', 'dist'))],
      destinationBucket: adminBucket,
      distribution: adminDistribution,
      distributionPaths: ['/*'],
      cacheControl: [
        s3deploy.CacheControl.setPublic(),
        s3deploy.CacheControl.maxAge(cdk.Duration.seconds(0)),
        s3deploy.CacheControl.mustRevalidate(),
      ],
    });

    new route53.ARecord(this, 'AdminAliasRecord', {
      zone: hostedZone,
      recordName: ADMIN_DOMAIN_NAME,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(adminDistribution)),
    });

    new cdk.CfnOutput(this, 'AdminSiteUrl', { value: `https://${ADMIN_DOMAIN_NAME}` });
    new cdk.CfnOutput(this, 'AdminDistributionId', { value: adminDistribution.distributionId });

    // ── Outputs ────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${DOMAIN_NAME}` });
    new cdk.CfnOutput(this, 'ApiGatewayUrl', { value: httpApi.url! });
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
  }
}
