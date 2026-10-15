import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { OrgLink } from '../models';
import { OrgList } from './org-list';

async function render(orgs: OrgLink[]) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const f = TestBed.createComponent(OrgList);
  f.componentRef.setInput('orgs', orgs);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}

describe('OrgList', () => {
  it('links every org to its page, in the order given', async () => {
    const el = await render([{ name: 'Acme' }, { name: 'Zed' }]);
    expect([...el.querySelectorAll('a.row')].map((a) => a.getAttribute('href'))).toEqual(['/org/Acme', '/org/Zed']);
  });

  it('shows each name with a chevron', async () => {
    const el = await render([{ name: 'Acme' }]);
    const text = el.querySelector('a.row')?.textContent ?? '';
    expect(text).toContain('Acme');
    expect(text).toContain('›');
  });

  it('renders no rows for no orgs', async () => {
    const el = await render([]);
    expect(el.querySelectorAll('.row')).toHaveLength(0);
  });
});
