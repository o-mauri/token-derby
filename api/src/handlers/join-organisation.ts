import type { ApiHandler } from '../lib/http.js';
import type { JoinOrganisationRequest, JoinOrganisationResponse } from '@token-derby/shared';
import {
  getOrganisationByJoinToken, getOrganisationById, addMember, isMember,
} from '../db/organisations.js';
import { resolveOrgDomain, normaliseDomain } from '../db/org-domains.js';
import { getUserById, type UserRecord } from '../db/users.js';
import { ok, err, parseJson } from '../lib/http.js';
import { readCliVersion, meetsMinimumCliVersion, versionMismatchMessage } from '../lib/version.js';
import { resolveCaller } from '../lib/auth.js';

// The `hd` claim wins over the email address because it is the domain Google
// asserts the account belongs to, whereas the address can sit on a secondary
// domain of the same Workspace. Only a verified address is trusted as a
// fallback — an unverified one proves nothing about the domain.
function joinDomainFor(user: UserRecord): string | null {
  if (user.hd) return normaliseDomain(user.hd);
  return verifiedEmailDomain(user);
}

function verifiedEmailDomain(user: UserRecord): string | null {
  if (!user.email || user.email_verified !== true) return null;
  const domain = user.email.split('@')[1];
  return domain ? normaliseDomain(domain) : null;
}

export const handler: ApiHandler = async (event) => {
  const caller_version = readCliVersion(event);
  if (caller_version && !meetsMinimumCliVersion(caller_version)) {
    return err('VERSION_MISMATCH', versionMismatchMessage());
  }

  const auth = await resolveCaller(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const body = parseJson<JoinOrganisationRequest>(event.body);
  const raw = body?.join_token;
  // A supplied-but-blank token is a malformed request, not a request to join by
  // domain: silently falling through would land the caller in whichever org
  // owns their domain instead of the one they meant.
  if (raw !== undefined && raw !== null && (typeof raw !== 'string' || raw.trim() === '')) {
    return err('BAD_REQUEST', 'join_token must be a non-empty string when supplied');
  }
  const join_token = typeof raw === 'string' ? raw.trim() : '';

  const user = await getUserById(auth.user_id);
  if (!user) return err('USER_NOT_FOUND', 'Unknown user');

  let org;
  if (join_token) {
    org = await getOrganisationByJoinToken(join_token);
    if (!org) return err('ORG_NOT_FOUND', 'No organisation matches that join token');
    // Checked after the lookup because the flag lives on the org row the token
    // resolves to — there is nothing to consult before that read.
    if (!org.join_token_enabled) {
      return err('JOIN_TOKEN_DISABLED', 'That organisation has turned off joining by token');
    }
  } else {
    const domain = joinDomainFor(user);
    if (!domain) {
      return err('EMAIL_REQUIRED', 'Supply a join token, or link a Google account to join by email domain');
    }
    const org_id = await resolveOrgDomain(domain);
    // A claim row exists only while an org has domain join enabled, so an
    // absent row means there is simply no org to join for this domain.
    if (!org_id) return err('ORG_NOT_FOUND', `No organisation accepts members from ${domain}`);
    org = await getOrganisationById(org_id);
    if (!org) return err('ORG_NOT_FOUND', `No organisation accepts members from ${domain}`);
  }

  // Idempotent — re-joining is a no-op that still returns the org info so the CLI
  // can tell the user which org they're in. Placed ahead of the eligibility
  // gates below on purpose: those decide who may *become* a member, and an org
  // turning on a restriction must not start failing the join command for the
  // members it already has. Nothing is written on this path either way.
  if (await isMember(org.org_id, auth.user_id)) {
    return ok<JoinOrganisationResponse>({ org_id: org.org_id, org_name: org.org_name });
  }

  // Applies to the token route as well as the domain route — a restriction that
  // anyone holding the token could skip past would be a suggestion, not a gate.
  if (org.restrict_to_allowed_domains) {
    const domain = verifiedEmailDomain(user);
    if (!domain) {
      return err('EMAIL_REQUIRED', 'That organisation only admits verified email addresses from its allowed domains');
    }
    if (!org.allowed_domains.includes(domain)) {
      return err('DOMAIN_NOT_ALLOWED', `That organisation does not admit members from ${domain}`);
    }
  }

  await addMember(org.org_id, auth.user_id, new Date().toISOString());

  const response: JoinOrganisationResponse = { org_id: org.org_id, org_name: org.org_name };
  return ok(response);
};
