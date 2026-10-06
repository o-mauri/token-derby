import type { AdminClaim } from '@token-derby/shared';
import { answerLists } from '../testing/answer';
import { openAdmin } from '../testing/harness';

const CLAIMS: AdminClaim[] = [
  { code: 'ABCD1234', item_type: 'hat', entries: [{ hat_id: 'party_hat' }], max_redemptions: 5, redeemed_count: 2, created_at: '2026-10-01T00:00:00Z', expires_at: '2099-11-01T00:00:00Z' },
  { code: 'WXYZ9876', item_type: 'hat', entries: [{ hat_id: 'flat_cap' }], max_redemptions: 1, redeemed_count: 0, created_at: '2026-09-01T00:00:00Z', expires_at: '2099-11-01T00:00:00Z' },
];
const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];

async function openClaims() {
  const p = await openAdmin('/claims');
  answerLists(p.http);
  await p.settle();
  const page = () => p.el().querySelector<HTMLElement>('[data-page="claims"]')!;
  const entries = () => [...page().querySelectorAll('.entry')];
  const pick = async (entry: Element, which: 'hat' | 'variant', label: string) => {
    entry.querySelector<HTMLElement>(`td-select.${which} button[aria-haspopup]`)!.click();
    await p.settle();
    options().find((o) => o.textContent?.trim() === label)!.click();
    await p.settle();
  };
  return { ...p, page, entries, pick };
}

describe('Claims page', () => {
  it('shows the loader until the claims arrive, then lists them with status', async () => {
    const p = await openClaims();
    expect(p.page().querySelector('.past td-loader')).not.toBeNull();
    p.http.expectOne('/api/admin/claims').flush({ claims: CLAIMS });
    await p.settle();
    expect(p.page().querySelector('.past td-loader')).toBeNull();
    const cells = [...p.page().querySelectorAll('.past tbody tr')].map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent?.replace(/\s+/g, ' ').trim()));
    expect(cells[0]!.slice(0, 2)).toEqual(['ABCD-1234', 'Party Hat']);
    expect(cells[0]![4]).toContain('2 / 5 redeemed');
  });

  it('says when there are no claim tokens yet', async () => {
    const p = await openClaims();
    p.http.expectOne('/api/admin/claims').flush({ claims: [] });
    await p.settle();
    expect(p.page().querySelector('.past .empty')?.textContent).toContain('No claim tokens yet.');
  });

  it('adds and removes pack rows, always keeping one', async () => {
    const p = await openClaims();
    p.http.expectOne('/api/admin/claims').flush({ claims: [] });
    await p.settle();
    expect(p.entries().length).toBe(1);
    expect(p.entries()[0]!.querySelector<HTMLButtonElement>('button.remove')!.disabled).toBe(true);
    await p.click('button.add');
    expect(p.entries().length).toBe(2);
    await p.click(p.entries()[1]!.querySelector('button.remove')!);
    expect(p.entries().length).toBe(1);
  });

  it('hides the variant for an animated hat', async () => {
    const p = await openClaims();
    p.http.expectOne('/api/admin/claims').flush({ claims: [] });
    await p.settle();
    expect(p.entries()[0]!.querySelector('td-select.variant')).not.toBeNull();
    await p.pick(p.entries()[0]!, 'hat', 'Legendary · Rainbow Crown');
    expect(p.entries()[0]!.querySelector('td-select.variant')).toBeNull();
  });

  it('generates a claim from the pack and shows its code once', async () => {
    const p = await openClaims();
    p.http.expectOne('/api/admin/claims').flush({ claims: [] });
    await p.settle();
    await p.pick(p.entries()[0]!, 'hat', 'Common · Party Hat');
    await p.pick(p.entries()[0]!, 'variant', '#2');
    await p.click('button.add');
    await p.pick(p.entries()[1]!, 'hat', 'Common · Flat Cap');
    const generate = p.page().querySelector<HTMLButtonElement>('button.generate')!;
    generate.click();
    generate.click();
    await p.settle();
    const reqs = p.http.match((r) => r.method === 'POST' && r.url === '/api/admin/claims');
    expect(reqs.length).toBe(1);
    expect(reqs[0]!.request.body).toEqual({
      item_type: 'hat', entries: [{ hat_id: 'party_hat', variant: 1 }, { hat_id: 'flat_cap' }], max_redemptions: 1, expires_in_days: 30,
    });
    reqs[0]!.flush({ code: 'NEWC0DE1', expires_at: '2026-11-05T00:00:00Z' });
    await p.settle();
    expect(p.page().querySelector('td-copy-field')?.textContent).toContain('NEWC-0DE1');
    expect(p.page().querySelector('.result')?.textContent).toContain('anyone holding it can redeem it');
    p.http.expectOne((r) => r.method === 'GET' && r.url === '/api/admin/claims');
  });

  it('shows a failed generate next to the button', async () => {
    const p = await openClaims();
    p.http.expectOne('/api/admin/claims').flush({ claims: [] });
    await p.settle();
    await p.click('button.generate');
    p.http.expectOne((r) => r.method === 'POST').flush({ code: 'BAD_REQUEST', message: 'Unknown hat' }, { status: 400, statusText: 'Bad' });
    await p.settle();
    expect(p.page().querySelector('.generator .error')?.textContent).toContain('Unknown hat');
  });

  it('shows who redeemed a claim, and hides them again', async () => {
    const p = await openClaims();
    p.http.expectOne('/api/admin/claims').flush({ claims: CLAIMS });
    await p.settle();
    await p.click('.past button.who');
    p.http.expectOne('/api/admin/claims/ABCD1234/redemptions').flush({ redemptions: [
      { user_id: 'u1', user_name: 'Omar', horse_id: 'h1', horse_name: 'Gallopz', redeemed_at: '2026-10-02T00:00:00Z', outcome: 'hat', hat_id: 'party_hat' },
    ] });
    await p.settle();
    expect(p.page().querySelector('.redemptions')?.textContent).toContain('Omar on Gallopz — Party Hat');
    await p.click('.past button.who');
    expect(p.page().querySelector('.redemptions')).toBeNull();
  });
});

describe('Claims limits', () => {
  it('refuses a blank or out-of-range count instead of changing it', async () => {
    const p = await openClaims();
    p.http.expectOne('/api/admin/claims').flush({ claims: [] });
    await p.settle();
    const field = (label: string) => [...p.page().querySelectorAll('td-text-input')].find((t) => t.textContent?.includes(label))!.querySelector('input')!;
    await p.type(field('Expires (days)'), '');
    expect(p.page().querySelector<HTMLButtonElement>('button.generate')!.disabled).toBe(true);
    expect(p.page().querySelector('.generator .limit')?.textContent).toContain('Expires must be 1–365 days.');
    await p.type(field('Expires (days)'), '30');
    await p.type(field('Max claims'), '1000');
    expect(p.page().querySelector<HTMLButtonElement>('button.generate')!.disabled).toBe(true);
    expect(p.page().querySelector('.generator .limit')?.textContent).toContain('Max claims must be 1–500.');
    p.page().querySelector<HTMLButtonElement>('button.generate')!.click();
    await p.settle();
    p.http.expectNone((r) => r.method === 'POST');
  });
});
