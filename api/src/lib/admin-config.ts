import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

export type AdminConfig = {
  username: string;
  passwordHash: string;
  sessionSecret: string;
};

// Evaluated once at module load — must be set before the module is first imported.
const PREFIX = process.env.ADMIN_SSM_PREFIX ?? '/token-derby/admin';

const defaultClient = new SSMClient({
  region: process.env.AWS_REGION ?? 'eu-west-2',
});

let cache: AdminConfig | null = null;

// Test-only: clear the module-level cache between cases.
export function __resetAdminConfigCache(): void {
  cache = null;
}

async function getParam(client: SSMClient, name: string): Promise<string> {
  const { Parameter } = await client.send(
    new GetParameterCommand({ Name: name, WithDecryption: true }),
  );
  const value = Parameter?.Value;
  if (!value) throw new Error(`SSM parameter ${name} is empty`);
  return value;
}

export async function loadAdminConfig(
  client: SSMClient = defaultClient,
): Promise<AdminConfig> {
  if (cache) return cache;
  const [username, passwordHash, sessionSecret] = await Promise.all([
    getParam(client, `${PREFIX}/username`),
    getParam(client, `${PREFIX}/password-hash`),
    getParam(client, `${PREFIX}/session-secret`),
  ]);
  cache = { username, passwordHash, sessionSecret };
  return cache;
}
