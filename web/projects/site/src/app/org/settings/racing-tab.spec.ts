import type { League, RaceSchedule } from '@token-derby/shared';
import { openSettings } from './settings-test-kit';

const stamp = { org_id: 'o', created_at: '', creator_user_id: 'u1', creator_user_name: 'Omar' };
const SCHEDULE = { weekdays: [1, 2, 3, 4, 5], start_local: '09:00', end_local: '17:30', tz: 'Europe/London', ...stamp } as RaceSchedule;
const LEAGUE = {
  ...SCHEDULE, divisions: [{ name: 'Premier', cap: 8 }, { name: 'Championship', cap: 8 }, { name: 'League One', cap: 8 }],
  boundaries: [2, 2], races_per_season: 10, current_season: 2, status: 'active',
} as League;

async function racing(schedule: RaceSchedule | null, league: League | null) {
  const s = await openSettings('/org/Acme/settings/racing');
  await s.answerOrg();
  s.http.expectOne('/api/organisations/Acme/schedule').flush({ schedule });
  s.http.expectOne('/api/organisations/Acme/league').flush({ league });
  await s.settle();
  const segment = async (label: string) => {
    const opt = [...s.el().querySelectorAll<HTMLElement>('td-segmented .segment')].find((b) => b.textContent?.trim() === label)!;
    opt.click();
    await s.settle();
  };
  return { ...s, segment };
}

describe('Racing tab', () => {
  it('opens on the league the org runs, with its ladder', async () => {
    const s = await racing(null, LEAGUE);
    expect(s.el().querySelectorAll('td-division-ladder .division')).toHaveLength(3);
  });

  it('replaces a league with a schedule after confirming: delete the league, then save the schedule', async () => {
    const s = await racing(null, LEAGUE);
    await s.segment('Weekly schedule');
    await s.click('button.save-schedule');
    expect(s.el().querySelector('td-confirm .box')?.textContent).toContain("This replaces Acme's league with a weekly schedule.");
    await s.click('td-confirm button.confirm');
    const del = s.http.expectOne('/api/organisations/Acme/league');
    expect(del.request.method).toBe('DELETE');
    del.flush({ ok: true });
    await s.settle();
    const put = s.http.expectOne('/api/organisations/Acme/schedule');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ weekdays: [1, 2, 3, 4, 5], start_local: '09:00', end_local: '17:30', tz: 'Europe/London' });
    put.flush({ schedule: SCHEDULE });
    await s.settle();
    s.http.match(() => true).forEach((r) => r.flush(r.request.url.endsWith('/schedule') ? { schedule: SCHEDULE } : { league: null }));
    await s.settle();
    expect(s.el().querySelector('.saved')).not.toBeNull();
  });

  it('shows the real state when the save fails after the old mode was deleted', async () => {
    const s = await racing(null, LEAGUE);
    await s.segment('Weekly schedule');
    await s.click('button.save-schedule');
    await s.click('td-confirm button.confirm');
    s.http.expectOne('/api/organisations/Acme/league').flush({ ok: true });
    await s.settle();
    s.http.expectOne('/api/organisations/Acme/schedule').flush({ code: 'BAD_REQUEST', message: 'tz must be a valid IANA zone' }, { status: 400, statusText: 'x' });
    await s.settle();
    expect(s.el().querySelector('.error')?.textContent).toContain('tz must be a valid IANA zone');
    s.http.expectOne('/api/organisations/Acme/schedule').flush({ schedule: null });
    s.http.expectOne('/api/organisations/Acme/league').flush({ league: null });
    await s.settle();
  });

  it('notes that shape changes to a running league wait for next season', async () => {
    const s = await racing(null, LEAGUE);
    expect(s.el().querySelector('.next-season')).toBeNull();
    const cap = s.el().querySelector('td-division-ladder td-text-input.cap input') as HTMLInputElement;
    cap.value = '10';
    cap.dispatchEvent(new Event('input'));
    await s.settle();
    expect(s.el().querySelector('.next-season')?.textContent).toContain('take effect next season');
  });

  it('turns racing off after confirming', async () => {
    const s = await racing(SCHEDULE, null);
    await s.segment('Off');
    await s.click('button.turn-off');
    await s.click('td-confirm button.confirm');
    expect(s.http.expectOne('/api/organisations/Acme/schedule').request.method).toBe('DELETE');
  });

  it('says so when nothing is set up', async () => {
    const s = await racing(null, null);
    expect(s.el().querySelector('.idle')?.textContent).toContain("Acme isn't racing.");
  });

  it('greys Save while the schedule has a problem', async () => {
    const s = await racing(SCHEDULE, null);
    expect(s.el().querySelector<HTMLButtonElement>('button.save-schedule')!.disabled).toBe(true);
    const end = [...s.el().querySelectorAll<HTMLInputElement>('td-text-input.end input')][0]!;
    end.value = '08:00';
    end.dispatchEvent(new Event('input'));
    await s.settle();
    expect(s.el().querySelector('.error')?.textContent).toContain('Races must finish after they start.');
    expect(s.el().querySelector<HTMLButtonElement>('button.save-schedule')!.disabled).toBe(true);
  });

  it('sums up the schedule', async () => {
    const s = await racing(SCHEDULE, null);
    expect(s.el().querySelector('.summary')?.textContent).toContain('Monday to Friday, 09:00–17:30 London time.');
  });
});
