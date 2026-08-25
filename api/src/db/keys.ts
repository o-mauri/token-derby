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

export const RACE_SETTINGS_SK = 'RACE_SETTINGS';

export function orgRaceSettingsKey(org_id: string) {
  return { pk: `${ORG_PK_PREFIX}${org_id}`, sk: RACE_SETTINGS_SK };
}

export const LEAGUE_SK = 'LEAGUE';

export function orgLeagueKey(org_id: string) {
  return { pk: `${ORG_PK_PREFIX}${org_id}`, sk: LEAGUE_SK };
}

export function orgLeagueSeasonKey(org_id: string, season: number) {
  return { pk: `${ORG_PK_PREFIX}${org_id}`, sk: `LEAGUE#SEASON#${season}` };
}

export function orgLeagueStandingKey(org_id: string, season: number, division: number, stable_horse_id: string) {
  return { pk: `${ORG_PK_PREFIX}${org_id}`, sk: `LEAGUE#SEASON#${season}#DIV#${division}#HORSE#${stable_horse_id}` };
}

export function orgLeagueStandingsPrefix(org_id: string, season: number) {
  return { pk: `${ORG_PK_PREFIX}${org_id}`, skPrefix: `LEAGUE#SEASON#${season}#DIV#` };
}

export function orgLeagueSeasonResultKey(org_id: string, season: number) {
  return { pk: `${ORG_PK_PREFIX}${org_id}`, sk: `LEAGUE#SEASON#${season}#RESULT` };
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

export const RELEASE_PK_PREFIX = 'RELEASE#';

export function releaseKey(component: string, version: string) {
  return { pk: `${RELEASE_PK_PREFIX}${component}#${version}`, sk: 'META' };
}

// Shares the release's partition so every recipient of a release can be read
// with one Query alongside its META row.
export function releaseOrgKey(component: string, version: string, org_id: string) {
  return { pk: `${RELEASE_PK_PREFIX}${component}#${version}`, sk: `ORG#${org_id}` };
}

export const CLAIM_PK_PREFIX = 'CLAIM#';

export function claimKey(code: string) {
  return { pk: `${CLAIM_PK_PREFIX}${code}`, sk: 'META' };
}

export const RATELIMIT_PK_PREFIX = 'RATELIMIT#';

export function rateLimitKey(bucket: string, subject: string, windowStart: number) {
  return { pk: `${RATELIMIT_PK_PREFIX}${bucket}#${subject}`, sk: `WINDOW#${windowStart}` };
}

export const AUTHREQ_PK_PREFIX = 'AUTHREQ#';

export function authRequestKey(state: string) {
  return { pk: `${AUTHREQ_PK_PREFIX}${state}`, sk: 'META' };
}

export const EMAIL_PK_PREFIX = 'EMAIL#';

export function emailClaimKey(email: string) {
  return { pk: `${EMAIL_PK_PREFIX}${email}`, sk: 'CLAIM' };
}

export const DOMAIN_PK_PREFIX = 'DOMAIN#';

export function orgDomainKey(domain: string) {
  return { pk: `${DOMAIN_PK_PREFIX}${domain}`, sk: 'CLAIM' };
}

export const DEVICE_SK_PREFIX = 'DEVICE#';

export function deviceKey(user_id: string, tokenHash: string) {
  return { pk: `${USER_PK_PREFIX}${user_id}`, sk: `${DEVICE_SK_PREFIX}${tokenHash}` };
}

export const CLIREQ_PK_PREFIX = 'CLIREQ#';
export const CLICODE_PK_PREFIX = 'CLICODE#';

export function cliAuthRequestKey(device_code: string) {
  return { pk: `${CLIREQ_PK_PREFIX}${device_code}`, sk: 'META' };
}

/** Pointer row: lets the approve page resolve a typed user_code to its device_code without a scan. */
export function cliAuthCodeKey(user_code: string) {
  return { pk: `${CLICODE_PK_PREFIX}${user_code}`, sk: 'META' };
}
