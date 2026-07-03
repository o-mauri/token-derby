export const RACE_PK_PREFIX = 'RACE#';
export const HORSE_SK_PREFIX = 'HORSE#';
export const ORG_PK_PREFIX = 'ORG#';
export const MEMBER_SK_PREFIX = 'MEMBER#';
export const USER_PK_PREFIX = 'USER#';
export const STABLE_HORSE_SK_PREFIX = 'STABLE_HORSE#';
export const STABLE_HORSE_NAME_SK_PREFIX = 'STABLE_HORSE_NAME#';

export function raceMetaKey(race_id: string) {
  return { pk: `${RACE_PK_PREFIX}${race_id}`, sk: 'META' };
}

export function horseKey(race_id: string, horse_id: string) {
  return { pk: `${RACE_PK_PREFIX}${race_id}`, sk: `${HORSE_SK_PREFIX}${horse_id}` };
}

export function parseHorseId(sk: string): string | null {
  return sk.startsWith(HORSE_SK_PREFIX) ? sk.slice(HORSE_SK_PREFIX.length) : null;
}

export function orgMetaKey(org_id: string) {
  return { pk: `${ORG_PK_PREFIX}${org_id}`, sk: 'META' };
}

export function orgMemberKey(org_id: string, user_id: string) {
  return { pk: `${ORG_PK_PREFIX}${org_id}`, sk: `${MEMBER_SK_PREFIX}${user_id}` };
}

export function parseOrgId(pk: string): string | null {
  return pk.startsWith(ORG_PK_PREFIX) ? pk.slice(ORG_PK_PREFIX.length) : null;
}

export function parseMemberUserId(sk: string): string | null {
  return sk.startsWith(MEMBER_SK_PREFIX) ? sk.slice(MEMBER_SK_PREFIX.length) : null;
}

export function userMetaKey(user_id: string) {
  return { pk: `${USER_PK_PREFIX}${user_id}`, sk: 'META' };
}

export function stableHorseKey(user_id: string, stable_horse_id: string) {
  return { pk: `${USER_PK_PREFIX}${user_id}`, sk: `${STABLE_HORSE_SK_PREFIX}${stable_horse_id}` };
}

export function stableHorseNameKey(user_id: string, name: string) {
  return { pk: `${USER_PK_PREFIX}${user_id}`, sk: `${STABLE_HORSE_NAME_SK_PREFIX}${name}` };
}

export function parseStableHorseId(sk: string): string | null {
  return sk.startsWith(STABLE_HORSE_SK_PREFIX) ? sk.slice(STABLE_HORSE_SK_PREFIX.length) : null;
}

export const SCHEDULE_SK = 'SCHEDULE';

export function orgScheduleKey(org_id: string) {
  return { pk: `${ORG_PK_PREFIX}${org_id}`, sk: SCHEDULE_SK };
}

export const POINT_SK_PREFIX = 'POINT#';

// 12 digits comfortably exceeds any realistic per-race heartbeat count and
// keeps lexical sort order aligned with numeric seq.
function padSeq(seq: number): string {
  return String(seq).padStart(12, '0');
}

export function seriesPointPrefix(horse_id: string): string {
  return `${POINT_SK_PREFIX}${horse_id}#`;
}

export function seriesPointKey(race_id: string, horse_id: string, seq: number) {
  return {
    pk: `${RACE_PK_PREFIX}${race_id}`,
    sk: `${seriesPointPrefix(horse_id)}${padSeq(seq)}`,
  };
}

export const WEB_GRANT_PK_PREFIX = 'WEBGRANT#';
export const WEB_SESSION_PK_PREFIX = 'WEBSESSION#';

export function webGrantKey(code: string) {
  return { pk: `${WEB_GRANT_PK_PREFIX}${code}`, sk: 'META' };
}

export function webSessionKey(token: string) {
  return { pk: `${WEB_SESSION_PK_PREFIX}${token}`, sk: 'META' };
}
