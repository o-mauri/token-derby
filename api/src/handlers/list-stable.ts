import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { ListStableResponse } from '@token-derby/shared';
import { authenticate } from '../lib/auth.js';
import { listStableHorses } from '../db/stable.js';
import { ok, err } from '../lib/http.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const auth = await authenticate(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const horses = await listStableHorses(auth.user_id);
  horses.sort((a, b) => a.name.localeCompare(b.name));
  const response: ListStableResponse = { horses };
  return ok(response);
};
