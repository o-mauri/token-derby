import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

export type AuthConfig = {
  clientId: string;
  clientSecret: string;
  stateSecret: string;
};

// Evaluated once at module load — must be set before this module is imported.
const PREFIX = process.env.AUTH_SSM_PREFIX ?? '/token-derby/auth';

const defaultClient = new SSMClient({
  region: process.env.AWS_REGION ?? 'eu-west-2',
});

let cache: AuthConfig | null = null;

// Test-only: clear the module-level cache between cases.
export function __resetAuthConfigCacheForTests(): void {
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

export async function loadAuthConfig(
  client: SSMClient = defaultClient,
): Promise<AuthConfig> {
  if (cache) return cache;
  // Local harness only: DYNAMODB_ENDPOINT is the local-run marker (db/client.ts
  // reads it too) and Lambda never sets it, so deployed code always uses SSM.
  const fromEnv = Boolean(process.env.DYNAMODB_ENDPOINT)
    && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.AUTH_STATE_SECRET;
  if (fromEnv) {
    cache = {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      stateSecret: process.env.AUTH_STATE_SECRET!,
    };
    return cache;
  }
  const [clientId, clientSecret, stateSecret] = await Promise.all([
    getParam(client, `${PREFIX}/google-client-id`),
    getParam(client, `${PREFIX}/google-client-secret`),
    getParam(client, `${PREFIX}/state-secret`),
  ]);
  cache = { clientId, clientSecret, stateSecret };
  return cache;
}
