import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { renderClaims } from '../src/render/claims.js';
import { HATS } from '@token-derby/shared';
import type { AdminClaim, CreateClaimRequest } from '@token-derby/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const realStylesheet = readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

const LEGENDARY = HATS.find(h => h.rarity === 'legendary')!;
const COMMON = HATS.find(h => h.rarity === 'common')!;

function deps(overrides: Partial<Parameters<typeof renderClaims>[1]> = {}) {
  return {
    fetchClaims: vi.fn(async () => ({ claims: [] as AdminClaim[] })),
    createClaim: vi.fn(async () => ({
      code: 'ABCDEFGHJKLM', item_type: 'hat' as const,
      entries: [{ hat_id: COMMON.id, variant: 0 }],
      max_redemptions: 1,
      expires_at: '2026-09-17T00:00:00.000Z',
    })),
    fetchRedemptions: vi.fn(async () => ({ redemptions: [] })),
    onUnauthorized: vi.fn(),
    ...overrides,
  };
}

async function flush() { await new Promise(r => setTimeout(r, 0)); }

describe('renderClaims exclusive label', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('marks a non-rollable hat with (exclusive) in its option label', async () => {
    const spy = vi.spyOn(HATS, 'filter');
    spy.mockImplementation((fn: any) => [{ ...COMMON, rollable: false }].filter(fn));
    const root = document.createElement('div');
    renderClaims(root, deps());
    await flush();
    expect(root.innerHTML).toContain('(exclusive)');
  });

  it('does not mark a rollable hat with (exclusive)', async () => {
    const spy = vi.spyOn(HATS, 'filter');
    spy.mockImplementation((fn: any) => [{ ...COMMON, rollable: true }].filter(fn));
    const root = document.createElement('div');
    renderClaims(root, deps());
    await flush();
    expect(root.innerHTML).not.toContain('(exclusive)');
  });
});

describe('renderClaims', () => {
  it('lists every hat in the select, exclusives included', async () => {
    const root = document.createElement('div');
    renderClaims(root, deps());
    await flush();
    const select = root.querySelector<HTMLSelectElement>('.claim-hat')!;
    expect(select.options).toHaveLength(HATS.length);
  });

  it('labels the real claim-only hat as exclusive', async () => {
    const root = document.createElement('div');
    renderClaims(root, deps());
    await flush();
    const opt = Array.from(root.querySelectorAll<HTMLOptionElement>('.claim-hat option'))
      .find(o => o.value === 'contributor_cap');
    expect(opt).toBeDefined();
    expect(opt!.textContent).toContain('(exclusive)');
  });

  it('hides the variant select for a legendary hat', async () => {
    const root = document.createElement('div');
    renderClaims(root, deps());
    await flush();
    const hatSel = root.querySelector<HTMLSelectElement>('.claim-hat')!;
    const variantSel = root.querySelector<HTMLSelectElement>('.claim-variant')!;
    hatSel.value = LEGENDARY.id;
    hatSel.dispatchEvent(new Event('change'));
    expect(variantSel.hidden).toBe(true);
    hatSel.value = COMMON.id;
    hatSel.dispatchEvent(new Event('change'));
    expect(variantSel.hidden).toBe(false);
  });

  it('populates variant options from the chosen hat, with Any first', async () => {
    const root = document.createElement('div');
    renderClaims(root, deps());
    await flush();
    const hatSel = root.querySelector<HTMLSelectElement>('.claim-hat')!;
    hatSel.value = COMMON.id;
    hatSel.dispatchEvent(new Event('change'));
    const variantSel = root.querySelector<HTMLSelectElement>('.claim-variant')!;
    expect(variantSel.options).toHaveLength((COMMON as any).variants.length + 1);
    expect(variantSel.options[0]!.value).toBe('');
    expect(variantSel.options[0]!.textContent).toBe('Any');
  });

  it('shows the minted code grouped for copying', async () => {
    const root = document.createElement('div');
    renderClaims(root, deps());
    await flush();
    root.querySelector<HTMLButtonElement>('.claim-generate')!.click();
    await flush();
    expect(root.querySelector<HTMLInputElement>('.claim-code')!.value).toBe('ABCD-EFGH-JKLM');
  });

  it('shows claim status text for outstanding, spent and expired claims', async () => {
    const claims: AdminClaim[] = [
      {
        code: 'ABCDEFGHJKLM', item_type: 'hat', entries: [{ hat_id: COMMON.id, variant: 0 }],
        max_redemptions: 5, redeemed_count: 2,
        created_at: '2026-08-01T00:00:00.000Z', expires_at: '2099-01-01T00:00:00.000Z',
      },
      {
        code: 'MLKJHGFEDCBA', item_type: 'hat', entries: [{ hat_id: COMMON.id, variant: 0 }],
        max_redemptions: 1, redeemed_count: 1,
        created_at: '2026-08-01T00:00:00.000Z', expires_at: '2099-01-01T00:00:00.000Z',
      },
      {
        code: 'AAAABBBBCCCC', item_type: 'hat', entries: [{ hat_id: COMMON.id, variant: 0 }],
        max_redemptions: 5, redeemed_count: 0,
        created_at: '2020-01-01T00:00:00.000Z', expires_at: '2020-02-01T00:00:00.000Z',
      },
    ];
    const root = document.createElement('div');
    renderClaims(root, deps({ fetchClaims: vi.fn(async () => ({ claims })) }));
    await flush();
    const html = root.innerHTML;
    expect(html).toContain('2 / 5 redeemed');
    expect(html).toContain('1 / 1 · spent');
    expect(html).toContain('0 / 5 · expired');
  });

  it('escapes redeemer and horse names in the drill-down', async () => {
    const fetchRedemptions = vi.fn(async () => ({ redemptions: [{
      user_id: 'u-1', user_name: '<script>x</script>', horse_id: 'sh-1',
      horse_name: '<img src=x onerror=alert(1)>', redeemed_at: '2026-08-02T00:00:00.000Z',
      outcome: 'hat' as const, hat_id: COMMON.id, variant: 0,
    }] }));
    const root = document.createElement('div');
    renderClaims(root, deps({
      fetchRedemptions,
      fetchClaims: vi.fn(async () => ({ claims: [{
        code: 'ABCDEFGHJKLM', item_type: 'hat' as const, entries: [{ hat_id: COMMON.id, variant: 0 }],
        max_redemptions: 5, redeemed_count: 1,
        created_at: '2026-08-01T00:00:00.000Z', expires_at: '2099-01-01T00:00:00.000Z',
      }] })),
    }));
    await flush();
    root.querySelector<HTMLButtonElement>('.claim-drill')!.click();
    await flush();
    const html = root.querySelector('.claim-detail')!.innerHTML;
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('reports an unauthorized listing', async () => {
    const root = document.createElement('div');
    const d = deps({ fetchClaims: vi.fn(async () => { throw { status: 401 }; }) });
    renderClaims(root, d);
    await flush();
    expect(d.onUnauthorized).toHaveBeenCalled();
  });

  it('disables Generate while a mint is in flight so a second click mints only once', async () => {
    const root = document.createElement('div');
    let resolveCreate!: (v: unknown) => void;
    const createClaim = vi.fn(() => new Promise((resolve) => { resolveCreate = resolve; }));
    const d = deps({ createClaim: createClaim as any });
    renderClaims(root, d);
    await flush();
    const btn = root.querySelector<HTMLButtonElement>('.claim-generate')!;
    btn.click();
    btn.click();
    await flush();
    expect(createClaim).toHaveBeenCalledTimes(1);
    resolveCreate({
      code: 'ABCDEFGHJKLM', item_type: 'hat',
      entries: [{ hat_id: COMMON.id, variant: 0 }], max_redemptions: 1,
      expires_at: '2026-09-17T00:00:00.000Z',
    });
    await flush();
    expect(btn.hasAttribute('disabled')).toBe(false);
  });

  it('actually hides [hidden] elements under the real stylesheet (computed style, not just the property)', async () => {
    // happy-dom resolves getComputedStyle from injected <style> rules, so this
    // loads the real stylesheet — an author `display` on a class rule can
    // otherwise beat the UA `[hidden] { display: none }` default silently.
    const styleEl = document.createElement('style');
    styleEl.textContent = realStylesheet;
    document.head.appendChild(styleEl);
    const root = document.createElement('div');
    document.body.appendChild(root);
    try {
      renderClaims(root, deps());
      await flush();

      const resultEl = root.querySelector<HTMLElement>('.claim-result')!;
      expect(resultEl.hidden).toBe(true);
      expect(getComputedStyle(resultEl).display).toBe('none');

      const hatSel = root.querySelector<HTMLSelectElement>('.claim-hat')!;
      const variantSel = root.querySelector<HTMLSelectElement>('.claim-variant')!;
      hatSel.value = LEGENDARY.id;
      hatSel.dispatchEvent(new Event('change'));
      expect(variantSel.hidden).toBe(true);
      expect(getComputedStyle(variantSel).display).toBe('none');

      root.querySelector<HTMLButtonElement>('.claim-generate')!.click();
      await flush();
      expect(resultEl.hidden).toBe(false);
      expect(getComputedStyle(resultEl).display).toBe('flex');
    } finally {
      styleEl.remove();
      root.remove();
    }
  });

  it('does not resubmit the form (and wipe the shown code) on implicit submit', async () => {
    const root = document.createElement('div');
    renderClaims(root, deps());
    await flush();
    root.querySelector<HTMLButtonElement>('.claim-generate')!.click();
    await flush();
    const form = root.querySelector<HTMLFormElement>('.claim-form')!;
    const submitted = form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(submitted).toBe(false);
    expect(root.querySelector<HTMLInputElement>('.claim-code')!.value).toBe('ABCD-EFGH-JKLM');
  });
});

describe('pack builder', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  function mounted(overrides: Partial<Parameters<typeof renderClaims>[1]> = {}) {
    const root = document.createElement('div');
    renderClaims(root, deps(overrides));
    return root;
  }

  it('starts with a single entry row', () => {
    expect(mounted().querySelectorAll('.claim-entry')).toHaveLength(1);
  });

  it('adds and removes entry rows', () => {
    const root = mounted();
    root.querySelector<HTMLButtonElement>('.claim-entry-add')!.click();
    expect(root.querySelectorAll('.claim-entry')).toHaveLength(2);
    root.querySelectorAll<HTMLButtonElement>('.claim-entry-remove')[1]!.click();
    expect(root.querySelectorAll('.claim-entry')).toHaveLength(1);
  });

  it('never removes the last entry row', () => {
    const root = mounted();
    root.querySelector<HTMLButtonElement>('.claim-entry-remove')!.click();
    expect(root.querySelectorAll('.claim-entry')).toHaveLength(1);
  });

  it('sends every entry and the redemption limit', async () => {
    const createClaim = vi.fn(async (_body: CreateClaimRequest) => ({
      code: 'ABCDEFGHJKLM', item_type: 'hat' as const,
      entries: [], max_redemptions: 1, expires_at: '2026-09-17T00:00:00.000Z',
    }));
    const root = mounted({ createClaim });
    root.querySelector<HTMLButtonElement>('.claim-entry-add')!.click();
    root.querySelector<HTMLInputElement>('.claim-max')!.value = '25';
    root.querySelector<HTMLButtonElement>('.claim-generate')!.click();
    await flush();
    expect(createClaim.mock.calls[0]![0].entries).toHaveLength(2);
    expect(createClaim.mock.calls[0]![0].max_redemptions).toBe(25);
  });

  it('omits the variant when the entry is set to Any', async () => {
    const createClaim = vi.fn(async (_body: CreateClaimRequest) => ({
      code: 'ABCDEFGHJKLM', item_type: 'hat' as const,
      entries: [], max_redemptions: 1, expires_at: '2026-09-17T00:00:00.000Z',
    }));
    const root = mounted({ createClaim });
    root.querySelector<HTMLSelectElement>('.claim-variant')!.value = '';
    root.querySelector<HTMLButtonElement>('.claim-generate')!.click();
    await flush();
    expect(createClaim.mock.calls[0]![0].entries[0]!.variant).toBeUndefined();
  });

  it('skips an empty rarity rather than rendering a bare optgroup', () => {
    // Drives the catalog down to commons, so every other rarity is empty and
    // the renderer must omit those groups rather than show an empty header.
    const spy = vi.spyOn(HATS, 'filter');
    spy.mockImplementation((fn: any) => [COMMON].filter(fn));
    const labels = Array.from(mounted().querySelectorAll('optgroup')).map(g => g.getAttribute('label'));
    expect(labels).toEqual(['common']);
  });

  it('renders the optgroup for a rarity once it has a hat', () => {
    const spy = vi.spyOn(HATS, 'filter');
    spy.mockImplementation((fn: any) =>
      [...HATS, { ...COMMON, id: 'test_limited', rarity: 'limited' }].filter(fn));
    const labels = Array.from(mounted().querySelectorAll('optgroup')).map(g => g.getAttribute('label'));
    expect(labels).toContain('limited');
  });

  it('shows a pack summary and the redemption tally in the list', async () => {
    const root = mounted({
      fetchClaims: vi.fn(async () => ({ claims: [{
        code: 'ABCDEFGHJKLM', item_type: 'hat' as const,
        entries: [{ hat_id: COMMON.id, variant: 0 }, { hat_id: LEGENDARY.id }],
        max_redemptions: 10, redeemed_count: 3,
        created_at: '2026-09-01T00:00:00.000Z', expires_at: '2026-12-01T00:00:00.000Z',
      }] })),
    });
    await flush();
    const text = root.querySelector('.claim-list')!.textContent!;
    expect(text).toContain('Pack of 2');
    expect(text).toContain('3 / 10');
  });

  it('names the single hat rather than calling it a pack of one', async () => {
    const root = mounted({
      fetchClaims: vi.fn(async () => ({ claims: [{
        code: 'ABCDEFGHJKLM', item_type: 'hat' as const,
        entries: [{ hat_id: COMMON.id, variant: 0 }],
        max_redemptions: 1, redeemed_count: 0,
        created_at: '2026-09-01T00:00:00.000Z', expires_at: '2026-12-01T00:00:00.000Z',
      }] })),
    });
    await flush();
    const text = root.querySelector('.claim-list')!.textContent!;
    expect(text).toContain(`${COMMON.name} #1`);
    expect(text).not.toContain('Pack of');
  });

  it('loads redemptions on demand when the tally is drilled into', async () => {
    const fetchRedemptions = vi.fn(async () => ({ redemptions: [{
      user_id: 'u-1', user_name: 'Omar', horse_id: 'sh-1', horse_name: 'Thunderbolt',
      redeemed_at: '2026-09-02T00:00:00.000Z', outcome: 'hat' as const,
      hat_id: COMMON.id, variant: 0,
    }] }));
    const root = mounted({
      fetchRedemptions,
      fetchClaims: vi.fn(async () => ({ claims: [{
        code: 'ABCDEFGHJKLM', item_type: 'hat' as const,
        entries: [{ hat_id: COMMON.id, variant: 0 }],
        max_redemptions: 5, redeemed_count: 1,
        created_at: '2026-09-01T00:00:00.000Z', expires_at: '2026-12-01T00:00:00.000Z',
      }] })),
    });
    await flush();
    expect(fetchRedemptions).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>('.claim-drill')!.click();
    await flush();
    expect(fetchRedemptions).toHaveBeenCalledWith('ABCDEFGHJKLM');
    expect(root.querySelector('.claim-detail')!.textContent).toContain('Thunderbolt');
    expect(root.querySelector('.claim-detail')!.textContent).toContain(`${COMMON.name} #1`);
  });
});
