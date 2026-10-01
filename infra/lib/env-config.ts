export interface EnvConfig {
  stackId: string;
  zoneDomain: string;
  appDomain: string;
  apiDomain: string;
  adminDomain: string;
  /** Bare and www hosts, both redirected to appDomain. */
  apexDomains: string[];
  legacyZoneDomain: string;
  /** Old site host: redirects to appDomain, but keeps /api/* for published CLIs. */
  legacySiteDomain: string;
  legacyAdminDomain: string;
  tableName: string;
  apiName: string;
  ssmPrefix: string;
  authSsmPrefix: string;
}

/** The real deployed configuration. Exported here rather than inlined in the
 *  stack so tests can synthesise exactly what gets deployed. */
export const CONFIG: EnvConfig = {
  stackId: 'TokenDerbyStack',
  zoneDomain: 'tokenderby.co.uk',
  appDomain: 'app.tokenderby.co.uk',
  apiDomain: 'api.tokenderby.co.uk',
  adminDomain: 'admin.tokenderby.co.uk',
  apexDomains: ['tokenderby.co.uk', 'www.tokenderby.co.uk'],
  legacyZoneDomain: 'mauricode.co.uk',
  legacySiteDomain: 'token-derby.mauricode.co.uk',
  legacyAdminDomain: 'admin.token-derby.mauricode.co.uk',
  tableName: 'token-derby',
  apiName: 'token-derby-api',
  ssmPrefix: '/token-derby/admin',
  authSsmPrefix: '/token-derby/auth',
};
