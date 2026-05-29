import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as initJockeyHandler } from '../../src/handlers/init-jockey.js';
import { handler as createStableHorseHandler } from '../../src/handlers/create-stable-horse.js';
import type { HorseColors, StableHorse } from '@token-derby/shared';

export type TestUser = { user_id: string; display_name: string; secret_token: string };

const DEFAULT_COLORS: HorseColors = { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' };

export async function makeUser(display_name: string, cliVersion = '2.6.0'): Promise<TestUser> {
  const event: APIGatewayProxyEventV2 = {
    version: '2.0',
    routeKey: 'POST /jockey/init',
    rawPath: '/jockey/init',
    rawQueryString: '',
    headers: { 'content-type': 'application/json', 'x-cli-version': cliVersion },
    requestContext: {} as any,
    body: JSON.stringify({ display_name }),
    isBase64Encoded: false,
  };
  const res: any = await initJockeyHandler(event);
  if (res.statusCode !== 200) {
    throw new Error(`init-jockey failed: ${res.statusCode} ${res.body}`);
  }
  return JSON.parse(res.body);
}

export async function makeHorse(
  user: TestUser,
  name: string,
  colors: HorseColors = DEFAULT_COLORS,
): Promise<StableHorse> {
  const event: APIGatewayProxyEventV2 = {
    version: '2.0',
    routeKey: 'POST /jockey/me/horses',
    rawPath: '/jockey/me/horses',
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      'x-cli-version': '2.6.0',
      'x-user-id': user.user_id,
      'x-user-token': user.secret_token,
    },
    requestContext: {} as any,
    body: JSON.stringify({ name, colors }),
    isBase64Encoded: false,
  };
  const res: any = await createStableHorseHandler(event);
  if (res.statusCode !== 200) {
    throw new Error(`create-stable-horse failed: ${res.statusCode} ${res.body}`);
  }
  return JSON.parse(res.body);
}

export function authHeaders(user: TestUser): Record<string, string> {
  return {
    'x-user-id': user.user_id,
    'x-user-token': user.secret_token,
  };
}
