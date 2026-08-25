import type { ApiHandler } from '../lib/http.js';
import type { SetOrgAccessRequest, SetOrgAccessResponse, OrgAccessSettings } from '@token-derby/shared';
import { ORG_NAME_PATTERN } from '@token-derby/shared';
import {
  getOrganisationByName, getOrganisationById, setOrgAccess, OrgAccessConflictError,
} from '../db/organisations.js';
import {
  claimOrgDomain, releaseOrgDomain, resolveOrgDomain, normaliseDomain, DomainAlreadyClaimedError,
} from '../db/org-domains.js';
import { getUserById } from '../db/users.js';
import { ok, err, parseJson } from '../lib/http.js';
import { provenDomains } from '../lib/user-domains.js';
import { resolveCaller } from '../lib/auth.js';

// Labels of alphanumerics and hyphens, at least one dot. Applied after
// normalisation, so it only ever sees lowercase. Junk in the allow-list is not
// merely untidy: every entry becomes a globally-unique DOMAIN# claim row, and
// "user@acme.com" pasted into the list would claim a key no email domain can
// ever match while blocking nothing.
const DOMAIN_RE = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

// Bounds the writes one request can trigger — each domain is a separate
// conditional put, and a rollback walks the same list again.
const MAX_ALLOWED_DOMAINS = 50;

type Validated = { settings: OrgAccessSettings } | { error: ReturnType<typeof err> };

function validate(body: SetOrgAccessRequest | null): Validated {
  if (!body || typeof body !== 'object') return { error: err('BAD_REQUEST', 'JSON body required') };
  for (const flag of ['join_token_enabled', 'domain_join_enabled', 'restrict_to_allowed_domains'] as const) {
    if (typeof body[flag] !== 'boolean') return { error: err('BAD_REQUEST', `${flag} (boolean) is required`) };
  }
  if (!Array.isArray(body.allowed_domains)) {
    return { error: err('BAD_REQUEST', 'allowed_domains (array of strings) is required') };
  }
  if (body.allowed_domains.length > MAX_ALLOWED_DOMAINS) {
    return { error: err('BAD_REQUEST', `allowed_domains may hold at most ${MAX_ALLOWED_DOMAINS} domains`) };
  }

  const seen = new Set<string>();
  const allowed_domains: string[] = [];
  for (const raw of body.allowed_domains) {
    if (typeof raw !== 'string') return { error: err('BAD_REQUEST', 'allowed_domains must contain only strings') };
    const domain = normaliseDomain(raw);
    if (!DOMAIN_RE.test(domain)) {
      return { error: err('BAD_REQUEST', `"${raw}" is not a valid domain — use the bare domain, e.g. acme.com`) };
    }
    // Deduped here rather than left to the claim loop: two spellings of one
    // domain would otherwise make the second claim look like a conflict with
    // ourselves.
    if (!seen.has(domain)) {
      seen.add(domain);
      allowed_domains.push(domain);
    }
  }

  // An empty allow-list satisfies nobody, so restricting against one locks out
  // every member including the owner, with no way back short of an admin.
  // Refused rather than stored: join-organisation cannot tell this state from a
  // deliberate freeze, so it has to be caught at the only place that creates it.
  if (body.restrict_to_allowed_domains && allowed_domains.length === 0) {
    return {
      error: err(
        'ALLOW_LIST_REQUIRED',
        'Add at least one allowed domain before restricting joins to allowed domains — an empty list would lock everyone out, including you',
      ),
    };
  }

  return {
    settings: {
      allowed_domains,
      join_token_enabled: body.join_token_enabled,
      domain_join_enabled: body.domain_join_enabled,
      restrict_to_allowed_domains: body.restrict_to_allowed_domains,
    },
  };
}

// Names the org rather than its id, because an id is not something an owner can
// act on — knowing it is "Acme" tells them who to ask.
async function describeHolder(org_id: string): Promise<string> {
  const holder = await getOrganisationById(org_id);
  return holder?.org_name ?? org_id;
}

// Re-claiming a domain this org already holds is success, not a conflict. That
// is what makes a re-submitted save idempotent, and what lets a request that
// died between the claims and the settings write heal on the next save instead
// of refusing with this org's own name as the thief.
async function claimUnlessOurs(domain: string, org_id: string): Promise<boolean> {
  try {
    await claimOrgDomain(domain, org_id);
    return true;
  } catch (e) {
    if (e instanceof DomainAlreadyClaimedError && e.org_id === org_id) return false;
    throw e;
  }
}

// Best-effort: a rollback that throws would replace the error the caller needs
// to see with a 500 and tell them nothing about what went wrong.
async function undoClaims(domains: string[], org_id: string): Promise<void> {
  for (const domain of domains) {
    try {
      await releaseOrgDomain(domain, org_id);
    } catch (e) {
      console.warn('org access rollback failed to release domain', {
        org_id, domain, error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

export const handler: ApiHandler = async (event) => {
  const auth = await resolveCaller(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const raw = event.pathParameters?.org_name;
  if (!raw) return err('BAD_REQUEST', 'org_name path parameter required');
  const org_name = decodeURIComponent(raw);
  if (!ORG_NAME_PATTERN.test(org_name)) return err('BAD_REQUEST', 'Invalid organisation name');

  const validated = validate(parseJson<SetOrgAccessRequest>(event.body));
  if ('error' in validated) return validated.error;
  const next = validated.settings;

  // The name lookup goes through a GSI, which is eventually consistent. Every
  // decision below is a read-modify-write input — ownership, the stored domain
  // list, access_rev — so the row itself is re-read strongly consistently.
  const named = await getOrganisationByName(org_name);
  if (!named) return err('ORG_NOT_FOUND', `No organisation named "${org_name}"`);
  const org = await getOrganisationById(named.org_id, { consistent: true });
  if (!org) return err('ORG_NOT_FOUND', `No organisation named "${org_name}"`);
  if (org.creator_user_id !== auth.user_id) {
    return err('NOT_ORG_OWNER', 'Only the organisation creator can change access settings');
  }

  // A DOMAIN# row routes *everyone* at that domain into this org, so claiming
  // one needs proof the creator belongs to it — format and org ownership say
  // nothing about who owns bigcorp.com. The allow-list cannot double as the
  // claim list: it is a restriction list, and two orgs may legitimately
  // restrict to the same partner domain without either owning it.
  const creator = await getUserById(org.creator_user_id);
  const provable = provenDomains(creator);
  const desired = next.domain_join_enabled
    ? next.allowed_domains.filter(d => provable.has(d))
    : [];

  // Refused rather than stored as a no-op: the toggle would otherwise report
  // success while claiming nothing, and the owner would believe auto-join is on.
  if (next.domain_join_enabled && desired.length === 0) {
    const own = [...provable];
    return err('DOMAIN_NOT_VERIFIED', own.length > 0
      ? `Automatic domain join only covers a domain you own — list ${own.join(' or ')} above, or turn it off`
      : 'Automatic domain join needs a domain you own — link a Google account on your work email first, then list that domain above');
  }

  // Reconciled against the desired state rather than against a diff of the
  // request: claiming is idempotent for a domain we already hold, so re-deriving
  // the full set costs a handful of conditional puts and repairs claim rows lost
  // to an earlier half-completed request.
  //
  // The release candidates are every domain this org could be holding a row
  // for — the stored list, the requested list, and the creator's own domains,
  // which is the only set this handler ever claims from. Derived from the stored
  // list alone (as it once was) a row for a domain absent from that list was in
  // no `stale` set and no later save could ever release it, leaving a live
  // auto-join route no stored setting authorises. releaseOrgDomain is
  // conditional on the org id, so a candidate we do not hold is a no-op and
  // another org's claim is untouchable.
  const candidates = new Set([...org.allowed_domains, ...next.allowed_domains, ...provable]);
  const stale = [...candidates].filter(d => !desired.includes(d));

  // Pre-flight every claim before writing anything. The conditional put in
  // claimOrgDomain is the real guarantee — this read only makes the ordinary
  // conflict (someone else has held the domain for weeks) refuse before the
  // first write, so the "nothing is written" promise does not lean on a
  // rollback succeeding.
  for (const domain of desired) {
    const holder = await resolveOrgDomain(domain);
    if (holder && holder !== org.org_id) {
      return err('DOMAIN_ALREADY_CLAIMED', `${domain} is already the auto-join domain for "${await describeHolder(holder)}"`);
    }
  }

  // Ordering, and what each residue costs if the process dies mid-request:
  //   claims -> releases -> settings.
  // Claims run first because they are the only step that can be refused, and a
  // refusal must leave the org exactly as it was — rolling back our own claims
  // is enough for that, whereas a refusal after a release would have already
  // revoked a domain the owner may still want.
  // Releases run before the settings write so that the surviving residue of a
  // crash is over-revocation (a domain stops auto-joining while the stored list
  // still names it) rather than under-revocation (the stored list drops a domain
  // whose claim row keeps letting people in). The claim row, not the flag, is
  // what join-organisation actually consults.
  const claimed: string[] = [];
  for (const domain of desired) {
    try {
      if (await claimUnlessOurs(domain, org.org_id)) claimed.push(domain);
    } catch (e) {
      // Lost a race against another org between the pre-flight and the put. Only
      // the rows this request created are released — a domain we already held is
      // not in `claimed`, so a rollback can never drop a claim we came in with.
      await undoClaims(claimed, org.org_id);
      if (e instanceof DomainAlreadyClaimedError) {
        return err('DOMAIN_ALREADY_CLAIMED', `${domain} is already the auto-join domain for "${await describeHolder(e.org_id)}"`);
      }
      throw e;
    }
  }

  try {
    for (const domain of stale) await releaseOrgDomain(domain, org.org_id);
    await setOrgAccess(org.org_id, next, org.access_rev);
  } catch (e) {
    await undoClaims(claimed, org.org_id);
    // An overlapping save landed between our read and our write, so the claim
    // rows we just made were reconciled against a snapshot that is no longer
    // the stored state. Refusing (and undoing) leaves over-revocation, which
    // the reconciliation above heals on the next save, rather than a live
    // route the winner's settings never authorised.
    if (e instanceof OrgAccessConflictError) {
      return err('ACCESS_CONFLICT', 'These settings changed in another window — reload and try again');
    }
    throw e;
  }

  const response: SetOrgAccessResponse = { access: next };
  return ok(response);
};
