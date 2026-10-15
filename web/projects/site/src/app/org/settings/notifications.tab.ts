import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import type { GetOrgSlackResponse, OrgSlackDigest, OrgSlackMessages, SetOrgSlackRequest } from '@token-derby/shared';
import { Button, Confirm, CopyField, Loader, Select, type TdOption, TextInput, Toggle } from '@token-derby/ui';
import { OrgData } from '../org-data';
import { DraftRegistry } from './drafts';
import { OrgOwner } from './org-owner';
import { OrgSettingsApi } from './org-settings-api';
import { timeZones } from './racing-model';
import { settingsErrorText } from './settings-errors';

const MESSAGES: { key: keyof OrgSlackMessages; label: string }[] = [
  { key: 'race_created', label: 'A race is created' },
  { key: 'race_ended', label: 'A race ends' },
  { key: 'league_season_ended', label: 'A league season ends' },
  { key: 'weekly_digest', label: 'Weekly org update' },
  { key: 'release_published', label: 'A new Token Derby release' },
];
const DEFAULT_MESSAGES: OrgSlackMessages = { race_created: true, race_ended: true, league_season_ended: true, weekly_digest: false, release_published: false };
const DAYS: TdOption<number>[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((label, i) => ({ value: i + 1, label }));

type SlackForm = { token: string; channel: string; messages: OrgSlackMessages; digest: OrgSlackDigest };
type Ask = { message: string; detail: string; run: () => Promise<void> };

/** Where race news goes: a signed webhook and a Slack bot. */
@Component({
  selector: 'site-notifications-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Confirm, CopyField, Loader, Select, TextInput, Toggle],
  host: { 'data-tab': 'notifications' },
  templateUrl: './notifications.tab.html',
  styleUrl: './settings-tab.scss',
})
export class NotificationsTab {
  private readonly api = inject(OrgSettingsApi);
  private readonly owner = inject(OrgOwner);
  private readonly drafts = inject(DraftRegistry);
  private readonly name = inject(OrgData).name;
  private readonly browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';

  protected readonly messages = MESSAGES;
  protected readonly days = DAYS;
  protected readonly zones: TdOption<string>[] = timeZones(this.browserTz).map((z) => ({ value: z, label: z.replace(/_/g, ' ') }));
  protected readonly loaded = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly org = () => this.owner.org()?.org_name ?? '';
  protected readonly error = signal<string | null>(null);
  protected readonly ask = signal<Ask | null>(null);

  // Webhook: the secret lives only in this component, so it's gone once you leave.
  private readonly webhookServer = signal<string | null>(null);
  protected readonly webhookUrl = signal('');
  protected readonly secret = signal<string | null>(null);
  protected readonly webhookSaved = signal(false);
  private readonly webhookDirty = computed(() => this.webhookUrl().trim() !== (this.webhookServer() ?? ''));

  private readonly slackServer = signal<GetOrgSlackResponse | null>(null);
  protected readonly slack = signal<SlackForm>(this.slackForm(null));
  protected readonly slackSaved = signal(false);
  private readonly slackDirty = computed(() => JSON.stringify(this.slack()) !== JSON.stringify(this.slackForm(this.slackServer())));

  constructor() {
    void this.load();
    effect(() => this.drafts.set('Notifications', this.loaded() && (this.webhookDirty() || this.slackDirty())));
    inject(DestroyRef).onDestroy(() => this.drafts.set('Notifications', false));
  }

  protected configured = () => !!this.slackServer()?.configured;

  protected patchSlack(patch: Partial<SlackForm>): void {
    this.slack.update((f) => ({ ...f, ...patch }));
    this.slackSaved.set(false);
  }

  protected setMessage(key: keyof OrgSlackMessages, on: boolean): void {
    this.patchSlack({ messages: { ...this.slack().messages, [key]: on } });
  }

  protected setDigest(patch: Partial<OrgSlackDigest>): void {
    this.patchSlack({ digest: { ...this.slack().digest, ...patch } });
  }

  protected canSaveWebhook = () => this.webhookUrl().trim().length > 0 && this.webhookDirty();
  protected canSaveSlack = () => this.slack().channel.trim().length > 0 && (this.configured() || this.slack().token.trim().length > 0);

  protected async saveWebhook(): Promise<void> {
    await this.guard(async () => {
      const res = await this.api.setWebhook(this.name()!, this.webhookUrl().trim());
      this.webhookServer.set(res.webhook_url);
      this.webhookUrl.set(res.webhook_url);
      this.secret.set(res.webhook_secret);
      this.webhookSaved.set(true);
    });
  }

  protected removeWebhook(): void {
    this.ask.set({ message: 'Remove the webhook?', detail: 'Race events stop being sent to it.', run: () => this.guard(async () => {
      await this.api.deleteWebhook(this.name()!);
      this.webhookServer.set(null);
      this.webhookUrl.set('');
      this.secret.set(null);
    }) });
  }

  protected async saveSlack(): Promise<void> {
    const f = this.slack();
    const body: SetOrgSlackRequest = {
      channel_id: f.channel.trim(), messages: f.messages,
      ...(f.token.trim() ? { bot_token: f.token.trim() } : {}),
      ...(f.messages.weekly_digest ? { digest: f.digest } : {}),
    };
    await this.guard(async () => {
      await this.api.setSlack(this.name()!, body);
      const next: GetOrgSlackResponse = { configured: true, channel_id: body.channel_id, messages: body.messages, digest: body.digest ?? null };
      this.slackServer.set(next);
      this.slack.set(this.slackForm(next));
      this.slackSaved.set(true);
    });
  }

  protected removeSlack(): void {
    this.ask.set({ message: 'Remove the Slack bot?', detail: 'Token Derby stops posting to Slack. The bot token is deleted.', run: () => this.guard(async () => {
      await this.api.deleteSlack(this.name()!);
      const none: GetOrgSlackResponse = { configured: false, channel_id: null, messages: null, digest: null };
      this.slackServer.set(none);
      this.slack.set(this.slackForm(none));
    }) });
  }

  protected async confirmed(): Promise<void> {
    const a = this.ask();
    this.ask.set(null);
    await a?.run();
  }

  private slackForm(s: GetOrgSlackResponse | null): SlackForm {
    return {
      token: '',
      channel: s?.channel_id ?? '',
      messages: { ...(s?.messages ?? DEFAULT_MESSAGES) },
      digest: { ...(s?.digest ?? { weekday: 5, time_local: '15:00', tz: this.browserTz || 'Europe/London' }) },
    };
  }

  private async guard(step: () => Promise<void>): Promise<void> {
    this.error.set(null);
    try {
      await step();
    } catch (e) {
      this.error.set(settingsErrorText(e, this.owner.org()?.org_name ?? ''));
    }
  }

  private async load(): Promise<void> {
    try {
      const [w, s] = await Promise.all([this.api.webhook(this.name()!), this.api.slack(this.name()!)]);
      this.webhookServer.set(w.webhook_url);
      this.webhookUrl.set(w.webhook_url ?? '');
      this.slackServer.set(s);
      this.slack.set(this.slackForm(s));
    } catch {
      // No form on a failed load: saving over an unseen webhook would mint a new secret.
      this.loadFailed.set(true);
    } finally {
      this.loaded.set(true);
    }
  }
}
