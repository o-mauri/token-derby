import { answerLists } from '../testing/answer';
import { ORGS } from '../testing/fixtures';
import { openAdmin } from '../testing/harness';

const rows = (el: HTMLElement) => [...el.querySelectorAll('[data-page="organisations"] tbody tr')];

describe('Organisations page', () => {
  it('shows the loader until the organisations arrive, then the table', async () => {
    const p = await openAdmin('/organisations');
    expect(p.el().querySelector('[data-page="organisations"] td-loader')).not.toBeNull();
    answerLists(p.http, undefined, [...ORGS, { ...ORGS[0]!, org_id: 'o2', org_name: 'acme', members: [] }]);
    await p.settle();
    expect(p.el().querySelector('[data-page="organisations"] td-loader')).toBeNull();
    const cells = rows(p.el()).map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent?.replace(/\s+/g, ' ').trim()));
    expect(cells.map((c) => c[0])).toEqual(['acme', 'Stackone']);
    expect(cells[1]).toEqual(['Stackone', 'Omar, dana (2)', 'Omar', '2026-05-14']);
  });

  it('links each organisation to its public page, in a new tab', async () => {
    const p = await openAdmin('/organisations');
    answerLists(p.http);
    await p.settle();
    const a = rows(p.el())[0]!.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('/org/Stackone');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
  });

  it('says so when the organisations fail to load, and retries', async () => {
    const p = await openAdmin('/organisations');
    p.http.expectOne('/api/admin/organisations').flush({ code: 'INTERNAL', message: 'x' }, { status: 500, statusText: 'Err' });
    answerLists(p.http);
    await p.settle();
    expect(p.el().querySelector('.failed')?.textContent).toContain("Couldn't load organisations.");
    await p.click('.failed button');
    answerLists(p.http);
    await p.settle();
    expect(rows(p.el()).length).toBe(1);
  });
});
