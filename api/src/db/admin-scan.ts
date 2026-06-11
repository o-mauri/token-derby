import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import {
  USER_PK_PREFIX,
  ORG_PK_PREFIX,
  MEMBER_SK_PREFIX,
  parseStableHorseId,
} from './keys.js';
import type { AdminUser, AdminOrg, AdminOrgMember, StableHorse } from '@token-derby/shared';

// Paginates the full LastEvaluatedKey chain. NB: multi-page pagination is not
// exercised by the test suite (would require >1MB of seed data on DynamoDB Local).
async function scanByPkPrefix(prefix: string): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const out = await ddb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: 'begins_with(pk, :p)',
      ExpressionAttributeValues: { ':p': prefix },
      ExclusiveStartKey,
    }));
    items.push(...(out.Items ?? []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

export async function scanUsersWithHorses(): Promise<AdminUser[]> {
  const items = await scanByPkPrefix(USER_PK_PREFIX);
  const byUser = new Map<string, AdminUser>();

  const ensure = (user_id: string): AdminUser => {
    let u = byUser.get(user_id);
    if (!u) {
      u = { user_id, display_name: '', created_at: '', horses: [] };
      byUser.set(user_id, u);
    }
    return u;
  };

  for (const it of items) {
    const pk = String(it.pk ?? '');
    const sk = String(it.sk ?? '');
    const user_id = pk.slice(USER_PK_PREFIX.length);
    if (!user_id) continue;

    if (sk === 'META') {
      const u = ensure(user_id);
      u.display_name = String(it.display_name ?? '');
      u.created_at = String(it.created_at ?? '');
      // NB: secret_token_hash deliberately ignored — never serialised.
    } else if (parseStableHorseId(sk)) {
      // The StableHorse type is the full safe contract for a stable-horse row —
      // it carries no secrets, so spreading the remaining attributes is safe.
      // pk/sk are internal; heartbeat_token is defensively dropped (race-horse
      // rows carry it, stable-horse rows don't) so it can never leak here.
      const { pk: _pk, sk: _sk, heartbeat_token: _hb, ...rest } = it;
      ensure(user_id).horses.push(rest as StableHorse);
    }
    // STABLE_HORSE_NAME# sentinels fall through and are ignored.
  }

  const users = [...byUser.values()].filter(u => u.created_at !== '');
  for (const u of users) u.horses.sort((a, b) => a.name.localeCompare(b.name));
  users.sort((a, b) => a.display_name.localeCompare(b.display_name));
  return users;
}

export async function scanOrganisations(): Promise<AdminOrg[]> {
  const items = await scanByPkPrefix(ORG_PK_PREFIX);
  const byOrg = new Map<string, AdminOrg>();
  const membersByOrg = new Map<string, AdminOrgMember[]>();

  const ensure = (org_id: string): AdminOrg => {
    let o = byOrg.get(org_id);
    if (!o) {
      o = { org_id, org_name: '', created_at: '', creator_user_id: '', creator_user_name: '', members: [] };
      byOrg.set(org_id, o);
    }
    return o;
  };

  for (const it of items) {
    const pk = String(it.pk ?? '');
    const sk = String(it.sk ?? '');
    const org_id = pk.slice(ORG_PK_PREFIX.length);
    if (!org_id) continue;

    if (sk === 'META') {
      const o = ensure(org_id);
      o.org_name = String(it.org_name ?? '');
      o.created_at = String(it.created_at ?? '');
      o.creator_user_id = String(it.creator_user_id ?? '');
      o.creator_user_name = String(it.creator_user_name ?? '');
      // org_join_token / webhook_secret deliberately ignored.
    } else if (sk.startsWith(MEMBER_SK_PREFIX)) {
      const list = membersByOrg.get(org_id) ?? [];
      list.push({
        user_id: String(it.member_user_id ?? ''),
        user_name: String(it.user_name ?? ''),
        joined_at: String(it.joined_at ?? ''),
      });
      membersByOrg.set(org_id, list);
    }
    // SCHEDULE rows fall through and are ignored.
  }

  for (const [org_id, members] of membersByOrg) {
    members.sort((a, b) => a.user_name.localeCompare(b.user_name));
    ensure(org_id).members = members;
  }

  const orgs = [...byOrg.values()].filter(o => o.org_name !== '');
  orgs.sort((a, b) => a.org_name.localeCompare(b.org_name));
  return orgs;
}
