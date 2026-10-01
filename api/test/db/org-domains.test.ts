import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { claimOrgDomain, releaseOrgDomain, resolveOrgDomain, DomainAlreadyClaimedError } from '../../src/db/org-domains.js';

const domain = () => `acme-${randomUUID()}.com`;

describe('org domain claims', () => {
  it('claims a domain for an org and resolves it back', async () => {
    const d = domain();
    await claimOrgDomain(d, 'org-1');
    expect(await resolveOrgDomain(d)).toBe('org-1');
  });

  it('returns null for an unclaimed domain', async () => {
    expect(await resolveOrgDomain(domain())).toBeNull();
  });

  it('refuses a domain another org already claimed, naming the holder', async () => {
    const d = domain();
    await claimOrgDomain(d, 'org-1');
    await expect(claimOrgDomain(d, 'org-2')).rejects.toThrow(DomainAlreadyClaimedError);
    // The conflict must be identifiable, or the handler cannot explain it.
    await expect(claimOrgDomain(d, 'org-2')).rejects.toMatchObject({ org_id: 'org-1' });
  });

  it('treats case and whitespace as the same domain', async () => {
    const d = domain();
    await claimOrgDomain(d, 'org-1');
    await expect(claimOrgDomain(`  ${d.toUpperCase()} `, 'org-2')).rejects.toThrow(DomainAlreadyClaimedError);
    expect(await resolveOrgDomain(`  ${d.toUpperCase()} `)).toBe('org-1');
  });

  it('will not let one org release another org claim', async () => {
    const d = domain();
    await claimOrgDomain(d, 'org-1');
    await releaseOrgDomain(d, 'org-2');
    expect(await resolveOrgDomain(d)).toBe('org-1');
  });

  it('lets the owning org release its own claim, freeing it for reuse', async () => {
    const d = domain();
    await claimOrgDomain(d, 'org-1');
    await releaseOrgDomain(d, 'org-1');
    expect(await resolveOrgDomain(d)).toBeNull();
    // Freed, so a different org can now claim it.
    await claimOrgDomain(d, 'org-2');
    expect(await resolveOrgDomain(d)).toBe('org-2');
  });

  it('releasing an unclaimed domain is a no-op, not an error', async () => {
    await expect(releaseOrgDomain(domain(), 'org-1')).resolves.toBeUndefined();
  });
});
