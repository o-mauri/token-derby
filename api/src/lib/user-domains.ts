import type { UserRecord } from '../db/users.js';
import { normaliseDomain } from '../db/org-domains.js';

/** The domain of a user's email, only when the address is verified — an
 *  unverified address proves nothing about the domain. */
export function verifiedEmailDomain(user: UserRecord): string | null {
  if (!user.email || user.email_verified !== true) return null;
  const domain = user.email.split('@')[1];
  return domain ? normaliseDomain(domain) : null;
}

// The `hd` claim wins over the email address because it is the domain Google
// asserts the account belongs to, whereas the address can sit on a secondary
// domain of the same Workspace.
export function joinDomainFor(user: UserRecord): string | null {
  if (user.hd) return normaliseDomain(user.hd);
  return verifiedEmailDomain(user);
}

/** Every domain this user can prove they belong to. Both are proofs, so both
 *  count — unlike joinDomainFor, which has to pick one destination. */
export function provenDomains(user: UserRecord | null): Set<string> {
  const out = new Set<string>();
  if (!user) return out;
  if (user.hd) out.add(normaliseDomain(user.hd));
  const email_domain = verifiedEmailDomain(user);
  if (email_domain) out.add(email_domain);
  return out;
}
