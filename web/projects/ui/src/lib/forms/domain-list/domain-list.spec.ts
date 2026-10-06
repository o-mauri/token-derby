import { TestBed } from '@angular/core/testing';
import { DomainList } from './domain-list';

async function render(value: string[]) {
  const f = TestBed.createComponent(DomainList);
  f.componentRef.setInput('label', 'Allowed domains');
  f.componentInstance.value.set(value);
  await f.whenStable();
  const el = f.nativeElement as HTMLElement;
  const add = async (text: string) => {
    const input = el.querySelector<HTMLInputElement>('input.add')!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await f.whenStable();
  };
  return { el, add, value: () => f.componentInstance.value(), f };
}

describe('DomainList', () => {
  it('shows a chip per domain', async () => {
    const { el } = await render(['acme.com']);
    expect([...el.querySelectorAll('.chip')].map((c) => c.textContent?.replace('✕', '').trim())).toEqual(['acme.com']);
  });

  it('adds a cleaned-up domain', async () => {
    const d = await render(['acme.com']);
    await d.add(' @Example.COM ');
    expect(d.value()).toEqual(['acme.com', 'example.com']);
    expect(d.el.querySelector<HTMLInputElement>('input.add')!.value).toBe('');
  });

  it('refuses something that is not a domain', async () => {
    const d = await render(['acme.com']);
    await d.add('bad domain');
    expect(d.value()).toEqual(['acme.com']);
    expect(d.el.querySelector('.error')?.textContent).toContain('Enter a domain like example.com');
  });

  it('ignores a domain it already has', async () => {
    const d = await render(['acme.com']);
    await d.add('ACME.com');
    expect(d.value()).toEqual(['acme.com']);
    expect(d.el.querySelector('.error')).toBeNull();
  });

  it('removes a domain', async () => {
    const d = await render(['acme.com', 'b.io']);
    d.el.querySelector<HTMLButtonElement>('button.remove[aria-label="Remove acme.com"]')!.click();
    await d.f.whenStable();
    expect(d.value()).toEqual(['b.io']);
  });
});
