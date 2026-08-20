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
