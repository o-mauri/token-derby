import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { renderClaims } from '../src/render/claims.js';
import { HATS } from '@token-derby/shared';
import type { AdminClaim } from '@token-derby/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const realStylesheet = readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

const LEGENDARY = HATS.find(h => h.rarity === 'legendary')!;
const COMMON = HATS.find(h => h.rarity === 'common')!;

function deps(overrides: Partial<Parameters<typeof renderClaims>[1]> = {}) {
  return {
    fetchClaims: vi.fn(async () => ({ claims: [] as AdminClaim[] })),
    createClaim: vi.fn(async () => ({
      code: 'ABCDEFGHJKLM', item_type: 'hat' as const,
      hat_id: COMMON.id, variant: 0, expires_at: '2026-09-17T00:00:00.000Z',
    })),
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
    const opt = [...root.querySelectorAll<HTMLOptionElement>('.claim-hat option')]
      .find(o => o.value === 'contributor_cap');
    expect(opt).toBeDefined();
    expect(opt!.textContent).toContain('(exclusive)');
  });

  it('hides the variant select for a legendary hat', async () => {
    const root = document.createElement('div');
    renderClaims(root, deps());
    await flush();
    const hatSel = root.querySelector<HTMLSelectElement>('.claim-hat')!;
    const variantWrap = root.querySelector<HTMLElement>('.claim-variant-wrap')!;
    hatSel.value = LEGENDARY.id;
    hatSel.dispatchEvent(new Event('change'));
    expect(variantWrap.hidden).toBe(true);
    hatSel.value = COMMON.id;
    hatSel.dispatchEvent(new Event('change'));
    expect(variantWrap.hidden).toBe(false);
  });

  it('populates variant options from the chosen hat', async () => {
    const root = document.createElement('div');
    renderClaims(root, deps());
    await flush();
    const hatSel = root.querySelector<HTMLSelectElement>('.claim-hat')!;
    hatSel.value = COMMON.id;
    hatSel.dispatchEvent(new Event('change'));
    const variantSel = root.querySelector<HTMLSelectElement>('.claim-variant')!;
    expect(variantSel.options).toHaveLength((COMMON as any).variants.length);
  });

  it('posts the chosen hat and variant, omitting variant for legendary', async () => {
    const root = document.createElement('div');
    const d = deps();
    renderClaims(root, d);
    await flush();
    const hatSel = root.querySelector<HTMLSelectElement>('.claim-hat')!;
    hatSel.value = LEGENDARY.id;
    hatSel.dispatchEvent(new Event('change'));
    root.querySelector<HTMLButtonElement>('.claim-generate')!.click();
    await flush();
    expect(d.createClaim).toHaveBeenCalledWith(
      expect.objectContaining({ item_type: 'hat', hat_id: LEGENDARY.id, expires_in_days: 30 }),
    );
    expect(d.createClaim.mock.calls[0]![0]).not.toHaveProperty('variant');
  });

  it('shows the minted code grouped for copying', async () => {
    const root = document.createElement('div');
    renderClaims(root, deps());
    await flush();
    root.querySelector<HTMLButtonElement>('.claim-generate')!.click();
    await flush();
    expect(root.querySelector<HTMLInputElement>('.claim-code')!.value).toBe('ABCD-EFGH-JKLM');
  });

  it('renders redemption status and escapes names', async () => {
    const claims: AdminClaim[] = [
      {
        code: 'ABCDEFGHJKLM', item_type: 'hat', hat_id: COMMON.id, variant: 0,
        created_at: '2026-08-01T00:00:00.000Z', expires_at: '2099-01-01T00:00:00.000Z',
        redeemed_at: '2026-08-02T00:00:00.000Z', redeemed_by: 'u-1',
        redeemed_by_name: '<script>x</script>', redeemed_horse_id: 'sh-1',
        redeemed_horse_name: '<img src=x onerror=alert(1)>', outcome: 'hat',
      },
      {
        code: 'MLKJHGFEDCBA', item_type: 'hat', hat_id: COMMON.id, variant: 0,
        created_at: '2026-08-01T00:00:00.000Z', expires_at: '2099-01-01T00:00:00.000Z',
      },
      {
        code: 'AAAABBBBCCCC', item_type: 'hat', hat_id: COMMON.id, variant: 0,
        created_at: '2020-01-01T00:00:00.000Z', expires_at: '2020-02-01T00:00:00.000Z',
      },
    ];
    const root = document.createElement('div');
    renderClaims(root, deps({ fetchClaims: vi.fn(async () => ({ claims })) }));
    await flush();
    const html = root.innerHTML;
    expect(html).toContain('outstanding');
    expect(html).toContain('expired');
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
      code: 'ABCDEFGHJKLM', item_type: 'hat', hat_id: COMMON.id, variant: 0,
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
      const variantWrap = root.querySelector<HTMLElement>('.claim-variant-wrap')!;
      hatSel.value = LEGENDARY.id;
      hatSel.dispatchEvent(new Event('change'));
      expect(variantWrap.hidden).toBe(true);
      expect(getComputedStyle(variantWrap).display).toBe('none');

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
