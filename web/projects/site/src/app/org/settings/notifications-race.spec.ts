import { MODIFIERS } from '@token-derby/shared';
import { openSettings } from './settings-test-kit';

async function raceSettings() {
  const s = await openSettings('/org/Acme/settings/race-settings');
  await s.answerOrg();
  s.http.expectOne('/api/organisations/Acme/race-settings').flush({ settings: null });
  await s.settle();
  return s;
}

describe('Race settings tab', () => {
  it('shows a card per modifier and saves a switched-on one', async () => {
    const s = await raceSettings();
    expect(s.el().querySelectorAll('td-modifier-card')).toHaveLength(Object.keys(MODIFIERS).length);
    await s.click('td-modifier-card td-toggle button');
    await s.click('button.save');
    const req = s.http.expectOne('/api/organisations/Acme/race-settings');
    expect(req.request.body).toEqual({ modifiers: { stamina: { enabled: true } } });
    req.flush({ settings: { org_id: 'o', modifiers: { stamina: { enabled: true } }, updated_at: '', updated_by_user_id: 'u1' } });
    await s.settle();
    expect(s.el().querySelector('.saved')).not.toBeNull();
  });

  it('resets to defaults after confirming', async () => {
    const s = await raceSettings();
    await s.click('button.reset');
    await s.click('td-confirm button.confirm');
    const req = s.http.expectOne('/api/organisations/Acme/race-settings');
    expect(req.request.body).toEqual({});
  });
});

async function notifications(slack: object = { configured: false, channel_id: null, messages: null, digest: null }, webhook: string | null = null) {
  const s = await openSettings('/org/Acme/settings/notifications');
  await s.answerOrg();
  s.http.expectOne('/api/organisations/Acme/webhook').flush({ webhook_url: webhook });
  s.http.expectOne('/api/organisations/Acme/slack').flush(slack);
  await s.settle();
  const type = async (sel: string, v: string) => {
    const box = s.el().querySelector<HTMLInputElement>(`${sel} input`)!;
    box.value = v;
    box.dispatchEvent(new Event('input'));
    await s.settle();
  };
  return { ...s, type };
}

describe('Notifications tab', () => {
  it('shows a new webhook secret once', async () => {
    const s = await notifications();
    await s.type('td-text-input.webhook-url', 'https://x.test/h');
    await s.click('button.save-webhook');
    const req = s.http.expectOne('/api/organisations/Acme/webhook');
    expect(req.request.body).toEqual({ url: 'https://x.test/h' });
    req.flush({ webhook_url: 'https://x.test/h', webhook_secret: 'whsec_1' });
    await s.settle();
    expect(s.el().querySelector('td-copy-field')?.textContent).toContain('whsec_1');
    expect(s.el().querySelector('.once')?.textContent).toContain('Shown once. Copy it now.');
  });

  it('never shows the secret again after leaving', async () => {
    const s = await notifications(undefined, 'https://x.test/h');
    await s.router().navigateByUrl('/org/Acme/settings');
    await s.settle();
    s.http.match(() => true).forEach((r) => r.flush({ members: [] }));
    await s.router().navigateByUrl('/org/Acme/settings/notifications');
    await s.settle();
    s.http.expectOne('/api/organisations/Acme/webhook').flush({ webhook_url: 'https://x.test/h' });
    s.http.expectOne('/api/organisations/Acme/slack').flush({ configured: false, channel_id: null, messages: null, digest: null });
    await s.settle();
    expect(s.el().querySelector('.once')).toBeNull();
    expect(s.el().querySelector<HTMLInputElement>('td-text-input.webhook-url input')?.value).toBe('https://x.test/h');
  });

  it('shows the server reason for a refused webhook', async () => {
    const s = await notifications();
    await s.type('td-text-input.webhook-url', 'http://nope');
    await s.click('button.save-webhook');
    s.http.expectOne('/api/organisations/Acme/webhook').flush({ code: 'BAD_REQUEST', message: 'url must be https' }, { status: 400, statusText: 'x' });
    await s.settle();
    expect(s.el().querySelector('.error')?.textContent).toContain('url must be https');
  });

  it('keeps a stored Slack token when the box is left blank, and sends the digest only when it is on', async () => {
    const s = await notifications({ configured: true, channel_id: 'C1', messages: { race_created: true, race_ended: true, league_season_ended: true, weekly_digest: false, release_published: false }, digest: null });
    expect(s.el().querySelector<HTMLInputElement>('td-text-input.slack-token input')?.placeholder).toContain('leave blank to keep');
    await s.click('button.save-slack');
    const req = s.http.expectOne('/api/organisations/Acme/slack');
    expect('bot_token' in req.request.body).toBe(false);
    expect('digest' in req.request.body).toBe(false);
    req.flush({ ok: true });
    await s.settle();
    await s.click('td-toggle.weekly_digest button');
    await s.click('button.save-slack');
    expect(s.http.expectOne('/api/organisations/Acme/slack').request.body.digest).toEqual({ weekday: 5, time_local: '15:00', tz: 'Europe/London' });
  });

  it('removes Slack after confirming', async () => {
    const s = await notifications({ configured: true, channel_id: 'C1', messages: { race_created: true, race_ended: true, league_season_ended: true, weekly_digest: false, release_published: false }, digest: null });
    await s.click('button.remove-slack');
    await s.click('td-confirm button.confirm');
    expect(s.http.expectOne('/api/organisations/Acme/slack').request.method).toBe('DELETE');
  });
});
