import type { UserRecord } from '../db/users.js';
import { normaliseDomain } from '../db/org-domains.js';

// Every function below only reads these three fields, so each accepts this
// narrower shape rather than a full UserRecord — a full UserRecord satisfies
// it structurally, and a caller that only fetched a projection (e.g. the
// members-linkage BatchGet) can pass its result straight through.
type DomainFields = Pick<UserRecord, 'email' | 'email_verified' | 'hd'>;

/** The domain of a user's email, only when the address is verified — an
 *  unverified address proves nothing about the domain. */
export function verifiedEmailDomain(user: DomainFields): string | null {
  if (!user.email || user.email_verified !== true) return null;
  const domain = user.email.split('@')[1];
  return domain ? normaliseDomain(domain) : null;
}

// The `hd` claim wins over the email address because it is the domain Google
// asserts the account belongs to, whereas the address can sit on a secondary
// domain of the same Workspace.
export function joinDomainFor(user: DomainFields): string | null {
  if (user.hd) return normaliseDomain(user.hd);
  return verifiedEmailDomain(user);
}

/** Whether the user has a verified Google account linked — the same test
 *  verifiedEmailDomain applies, but as a yes/no rather than the domain
 *  itself: callers that only need to disclose linkage, not the address. */
export function hasLinkedEmail(user: DomainFields | null): boolean {
  return !!user && !!user.email && user.email_verified === true;
}

/** Every domain this user can prove they belong to. Both are proofs, so both
 *  count — unlike joinDomainFor, which has to pick one destination. */
export function provenDomains(user: DomainFields | null): Set<string> {
  const out = new Set<string>();
  if (!user) return out;
  if (user.hd) out.add(normaliseDomain(user.hd));
  const email_domain = verifiedEmailDomain(user);
  if (email_domain) out.add(email_domain);
  return out;
}
