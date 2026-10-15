import { answerLists } from '../testing/answer';
import { openAdmin } from '../testing/harness';

const rows = (el: HTMLElement) => [...el.querySelectorAll('[data-page="users"] tbody tr')];
const filterBox = (el: HTMLElement) => el.querySelector<HTMLInputElement>('[data-page="users"] td-text-input input')!;

describe('Users page', () => {
  it('shows the loader until the users arrive, then the table', async () => {
    const p = await openAdmin('/users');
    expect(p.el().querySelector('[data-page="users"] td-loader')).not.toBeNull();
    answerLists(p.http);
    await p.settle();
    expect(p.el().querySelector('[data-page="users"] td-loader')).toBeNull();
    expect(rows(p.el()).length).toBe(2);
  });

  it('lists users by name ignoring case, with totals over their horses', async () => {
    const p = await openAdmin('/users');
    answerLists(p.http);
    await p.settle();
    const cells = rows(p.el()).map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent?.trim()));
    expect(cells.map((c) => c[0])).toEqual(['dana', 'Omar']);
    expect(cells[0]![1]).toBe('—');
    expect(cells[1]!.slice(1, 7)).toEqual(['omar@stackone.com', '1', '30', '4', '9', '900']);
  });

  it('links each user to their page', async () => {
    const p = await openAdmin('/users');
    answerLists(p.http);
    await p.settle();
    expect(rows(p.el())[0]!.querySelector('a')?.getAttribute('href')).toBe('/users/u2');
  });

  it('filters by name or email as you type, treating symbols as text', async () => {
    const p = await openAdmin('/users');
    answerLists(p.http);
    await p.settle();
    await p.type(filterBox(p.el()), 'STACKONE');
    expect(rows(p.el()).length).toBe(1);
    await p.type(filterBox(p.el()), '(');
    expect(rows(p.el()).length).toBe(0);
    expect(p.el().querySelector('.empty')?.textContent).toContain('No users match "("');
  });

  it('says so when the users fail to load, and retries', async () => {
    const p = await openAdmin('/users');
    p.http.expectOne('/api/admin/users').flush({ code: 'INTERNAL', message: 'x' }, { status: 500, statusText: 'Err' });
    answerLists(p.http);
    await p.settle();
    expect(p.el().querySelector('.failed')?.textContent).toContain("Couldn't load users.");
    await p.click('.failed button');
    expect(p.el().querySelector('[data-page="users"] td-loader')).not.toBeNull();
    answerLists(p.http);
    await p.settle();
    expect(rows(p.el()).length).toBe(2);
  });
});
