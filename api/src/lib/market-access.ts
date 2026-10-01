// Not-joined runners reveal who usually races when, so only org members see them.
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { MarketSnapshot, Race } from '@token-derby/shared';
import { bearerToken } from './admin-auth.js';
import { getWebSession } from '../db/web-sessions.js';
import { isMember } from '../db/organisations.js';

export async function canSeeNotJoined(event: APIGatewayProxyEventV2, race: Race): Promise<boolean> {
  if (!race.org_id) return false;
  const token = bearerToken(event);
  if (!token) return false;
  try {
    const session = await getWebSession(token);
    return !!session && (await isMember(race.org_id, session.user_id));
  } catch {
    return false;
  }
}

export function visibleSnapshot(snap: MarketSnapshot, showAll: boolean): MarketSnapshot {
  if (showAll) return snap;
  return { ...snap, prices: snap.prices.filter((p) => p.joined !== false), not_joined: [] };
}
