import { answerLists } from '../testing/answer';
import { openAdmin } from '../testing/harness';

const page = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-page="user"]')!;

async function openUser(id = 'u1') {
  const p = await openAdmin(`/users/${id}`);
  answerLists(p.http);
  await p.settle();
  return p;
}

describe('User page', () => {
  it('shows the loader until the users arrive', async () => {
    const p = await openAdmin('/users/u1');
    expect(p.el().querySelector('[data-page="user"] td-loader')).not.toBeNull();
    answerLists(p.http);
    await p.settle();
    expect(p.el().querySelector('[data-page="user"] td-loader')).toBeNull();
    expect(page(p.el()).querySelector('.jockey .name')?.textContent?.trim()).toBe('Omar');
  });

  it('puts the user in the breadcrumb', async () => {
    const p = await openUser();
    expect([...p.el().querySelectorAll('td-crumbs .part')].map((x) => x.textContent?.trim())).toEqual(['Admin', 'Users', 'Omar']);
  });

  it('shows not-found for an unknown id', async () => {
    const p = await openUser('nope');
    expect(p.el().querySelector('td-not-found')?.textContent).toContain('nope');
  });

  it('renames the jockey', async () => {
    const p = await openUser();
    await p.click('.jockey button.edit');
    const input = page(p.el()).querySelector<HTMLInputElement>('.jockey input')!;
    await p.type(input, '  ');
    expect(page(p.el()).querySelector<HTMLButtonElement>('.jockey button.save')!.disabled).toBe(true);
    await p.type(input, 'Omar M');
    await p.click('.jockey button.save');
    const req = p.http.expectOne('/api/admin/users/u1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ display_name: 'Omar M' });
    req.flush({ user_id: 'u1', display_name: 'Omar M' });
    await p.settle();
    expect(page(p.el()).querySelector('.jockey .name')?.textContent?.trim()).toBe('Omar M');
  });

  it('renames a horse', async () => {
    const p = await openUser();
    await p.click('.horse button.edit');
    await p.type(page(p.el()).querySelector<HTMLInputElement>('.horse input')!, 'Gallop');
    await p.click('.horse button.save');
    const req = p.http.expectOne('/api/admin/users/u1/horses/h1');
    expect(req.request.body).toEqual({ name: 'Gallop' });
    req.flush({ ...(await import('../testing/fixtures')).USERS[0]!.horses[0]!, name: 'Gallop' });
    await p.settle();
    expect(page(p.el()).querySelector('.horse .name')?.textContent?.trim()).toBe('Gallop');
  });

  it('draws each horse wearing its equipped hat', async () => {
    const p = await openUser();
    expect(page(p.el()).querySelector('td-horse .horse-hat-cowboy_hat')).not.toBeNull();
  });

  it('removes the hat shown, by its stored position, after confirming', async () => {
    const p = await openUser();
    await p.click('.horse button.hats-toggle');
    const hatRows = [...page(p.el()).querySelectorAll('.hat')];
    expect(hatRows.map((r) => r.querySelector('.hat-name')?.textContent?.trim())).toEqual(['Cowboy Hat', 'Party Hat']);
    await p.click(hatRows[0]!.querySelector('button.remove')!);
    expect(p.el().querySelector('td-confirm .box')?.textContent).toContain('Remove Cowboy Hat from Gallopz?');
    await p.click('td-confirm button.confirm');
    const req = p.http.expectOne('/api/admin/users/u1/horses/h1/hats/1');
    expect(req.request.method).toBe('DELETE');
  });

  it('sends nothing when a remove is cancelled', async () => {
    const p = await openUser();
    await p.click('.horse button.hats-toggle');
    await p.click(page(p.el()).querySelector('.hat button.remove')!);
    await p.click('td-confirm button.cancel');
    p.http.expectNone((r) => r.url.includes('/hats/'));
  });

  it('sends one request however fast Confirm is clicked', async () => {
    const p = await openUser();
    await p.click('.horse button.delete');
    const confirm = p.el().querySelector<HTMLButtonElement>('td-confirm button.confirm')!;
    confirm.click();
    confirm.click();
    await p.settle();
    expect(p.http.match('/api/admin/users/u1/horses/h1').length).toBe(1);
  });

  it('deletes a horse after confirming', async () => {
    const p = await openUser();
    await p.click('.horse button.delete');
    expect(p.el().querySelector('td-confirm .box')?.textContent).toContain('Delete Gallopz?');
    await p.click('td-confirm button.confirm');
    p.http.expectOne('/api/admin/users/u1/horses/h1').flush({ deleted: true });
    await p.settle();
    expect(page(p.el()).querySelector('.horse')).toBeNull();
    expect(page(p.el()).querySelector('.no-horses')?.textContent).toContain('No horses.');
  });

  it('shows a failed change next to the control and keeps the data', async () => {
    const p = await openUser();
    await p.click('.horse button.delete');
    await p.click('td-confirm button.confirm');
    p.http.expectOne('/api/admin/users/u1/horses/h1').flush({ code: 'INTERNAL', message: 'Database down' }, { status: 500, statusText: 'Err' });
    await p.settle();
    expect(page(p.el()).querySelector('.horse')).not.toBeNull();
    expect(page(p.el()).querySelector('.horse .error')?.textContent).toContain('Database down');
  });

  it('shows the stats, with average finish', async () => {
    const p = await openUser();
    const chips = [...page(p.el()).querySelectorAll('.horse .stat')].map((c) => c.textContent?.replace(/\s+/g, ' ').trim());
    expect(chips).toEqual(['Races 30', 'Wins 4', 'Podiums 9', 'Tokens 1.23M', 'Avg finish 2.5', 'XP 900']);
  });
});
