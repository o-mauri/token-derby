export type EnvName = 'prod' | 'staging';

export interface EnvConfig {
  stackId: string;
  siteDomain: string;
  adminDomain: string;
  tableName: string;
  apiName: string;
  ssmPrefix: string;
  authSsmPrefix: string;
  disposable: boolean;
}

/** The real deployed configurations — `bin/token-derby.ts` picks one by `-c env`.
 *  Exported here so tests can synthesise the same stack that gets deployed. */
export const ENV_CONFIGS: Record<EnvName, EnvConfig> = {
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
