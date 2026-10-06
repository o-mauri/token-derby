import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AccountMenu } from './account-menu';

async function render(meLink: unknown[] | null = null) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const f = TestBed.createComponent(AccountMenu);
  f.componentRef.setInput('name', 'omar');
  f.componentRef.setInput('meLink', meLink);
  f.componentRef.setInput('accountLink', null);
  let signedOut = 0;
  f.componentInstance.signOut.subscribe(() => signedOut++);
  await f.whenStable();
  const el = f.nativeElement as HTMLElement;
  const open = async () => { el.querySelector<HTMLButtonElement>('button.trigger')!.click(); await f.whenStable(); };
  // The menu renders in a CDK overlay, outside the host.
  const items = () => [...document.body.querySelectorAll<HTMLElement>('[cdkmenuitem], .item')];
  const item = (label: string) => items().find((i) => i.textContent?.includes(label))!;
  return { el, open, items, item, signedOut: () => signedOut };
}

describe('AccountMenu', () => {
  it('shows your name and initial on the trigger', async () => {
    const { el } = await render();
    expect(el.querySelector('.trigger .name')?.textContent?.trim()).toBe('omar');
    expect(el.querySelector('.trigger .initial')?.textContent?.trim()).toBe('O');
  });

  it('opens to My page, Account and Sign out', async () => {
    const m = await render();
    await m.open();
    expect(m.items().map((i) => i.textContent?.replace('Soon', '').trim())).toEqual(['My page', 'Account', 'Sign out']);
  });

  it('greys pages that do not exist yet', async () => {
    const m = await render(null);
    await m.open();
    const me = m.item('My page');
    expect(me.tagName).toBe('BUTTON');
    expect(me.hasAttribute('disabled') || me.getAttribute('aria-disabled') === 'true').toBe(true);
    expect(me.textContent).toContain('Soon');
  });

  it('links to your page once it exists', async () => {
    const m = await render(['/me']);
    await m.open();
    expect(m.item('My page').getAttribute('href')).toBe('/me');
  });

  it('emits sign out', async () => {
    const m = await render();
    await m.open();
    m.item('Sign out').click();
    expect(m.signedOut()).toBe(1);
  });
});
