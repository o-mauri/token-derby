export interface EnvConfig {
  stackId: string;
  siteDomain: string;
  adminDomain: string;
  tableName: string;
  apiName: string;
  ssmPrefix: string;
  authSsmPrefix: string;
}

/** The real deployed configuration. Exported here rather than inlined in the
 *  stack so tests can synthesise exactly what gets deployed. */
export const CONFIG: EnvConfig = {
  stackId: 'TokenDerbyStack',
  siteDomain: 'token-derby.mauricode.co.uk',
  adminDomain: 'admin.token-derby.mauricode.co.uk',
  tableName: 'token-derby',
  apiName: 'token-derby-api',
  ssmPrefix: '/token-derby/admin',
  authSsmPrefix: '/token-derby/auth',
};
