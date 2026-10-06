import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type { League, RaceSchedule } from '@token-derby/shared';
import {
  Button, ChipGroup, Confirm, DivisionLadder, type LadderValue, Loader, Segmented, Select, type TdOption, TextInput,
} from '@token-derby/ui';
import { OrgData } from '../org-data';
import { DraftRegistry } from './drafts';
import { OrgOwner } from './org-owner';
import { OrgSettingsApi } from './org-settings-api';
import {
  type LeagueForm, type RacingMode, type ScheduleForm, currentMode, leagueError, leagueFormFrom, leagueRequest, scheduleError,
  scheduleFormFrom, scheduleRequest, scheduleSummary, timeZones,
} from './racing-model';
import { settingsErrorText } from './settings-errors';

const MODES: TdOption<RacingMode>[] = [{ value: 'off', label: 'Off' }, { value: 'schedule', label: 'Weekly schedule' }, { value: 'league', label: 'League' }];
const DAYS: TdOption<number>[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => ({ value: i + 1, label }));
const LABEL: Record<RacingMode, string> = { off: 'racing', schedule: 'weekly schedule', league: 'league' };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type Ask = { message: string; detail: string; confirmLabel: string; run: () => Promise<void> };

/** How the org races: off, a weekly schedule, or a league. Saving one mode over the other replaces it, after asking. */
@Component({
  selector: 'site-racing-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, ChipGroup, Confirm, DivisionLadder, Loader, NgTemplateOutlet, Segmented, Select, TextInput],
  host: { 'data-tab': 'racing' },
  templateUrl: './racing.tab.html',
  styleUrls: ['./settings-tab.scss', './racing.tab.scss'],
})
export class RacingTab {
  private readonly api = inject(OrgSettingsApi);
  private readonly owner = inject(OrgOwner);
  private readonly drafts = inject(DraftRegistry);
  private readonly name = inject(OrgData).name;
  private readonly browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';

  protected readonly modes = MODES;
  protected readonly days = DAYS;
  protected readonly zones: TdOption<string>[] = timeZones(this.browserTz).map((z) => ({ value: z, label: z.replace(/_/g, ' ') }));

  protected readonly loaded = signal(false);
  protected readonly loadFailed = signal(false);
  private readonly serverSchedule = signal<RaceSchedule | null>(null);
  private readonly serverLeague = signal<League | null>(null);
  protected readonly serverMode = computed(() => currentMode(this.serverSchedule(), this.serverLeague()));
  protected readonly mode = signal<RacingMode>('off');
  protected readonly schedule = signal<ScheduleForm>(scheduleFormFrom(null, this.browserTz));
  protected readonly league = signal<LeagueForm>(leagueFormFrom(null, this.browserTz));

  protected readonly scheduleProblem = computed(() => scheduleError(this.schedule()));
  protected readonly leagueProblem = computed(() => leagueError(this.league()));
  protected readonly summary = computed(() => scheduleSummary(this.schedule()));
  protected readonly ladder = computed<LadderValue>(() => ({ divisions: this.league().divisions, boundaries: this.league().boundaries }));
  private readonly scheduleDirty = computed(() => !same(scheduleRequest(this.schedule()), scheduleRequest(scheduleFormFrom(this.serverSchedule(), this.browserTz))));
  private readonly leagueDirty = computed(() => !same(leagueRequest(this.league()), leagueRequest(leagueFormFrom(this.serverLeague(), this.browserTz))));
  protected readonly canSaveSchedule = computed(() => !this.scheduleProblem() && (this.scheduleDirty() || this.serverMode() !== 'schedule') && !this.busy());
  protected readonly canSaveLeague = computed(() => !this.leagueProblem() && (this.leagueDirty() || this.serverMode() !== 'league') && !this.busy());
  // A running league keeps its divisions and season length until the season ends.
  protected readonly nextSeason = computed(() => {
    const l = this.serverLeague();
    if (!l || this.mode() !== 'league') return false;
    const now = leagueFormFrom(l, this.browserTz);
    const f = this.league();
    return !same([f.divisions, f.boundaries, f.races_per_season], [now.divisions, now.boundaries, now.races_per_season]);
  });

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);
  protected readonly ask = signal<Ask | null>(null);
  protected readonly org = computed(() => this.owner.org()?.org_name ?? '');

  constructor() {
    void this.load();
    effect(() => {
      const m = this.mode();
      const dirty = this.loaded() && ((m === 'schedule' && this.scheduleDirty()) || (m === 'league' && this.leagueDirty()));
      this.drafts.set('Racing', dirty);
    });
    inject(DestroyRef).onDestroy(() => this.drafts.set('Racing', false));
  }

  protected patchSchedule(patch: Partial<ScheduleForm>): void {
    this.schedule.update((f) => ({ ...f, ...patch }));
    this.league.update((f) => ({ ...f, ...patch }));
    this.saved.set(false);
  }

  protected patchLeague(patch: Partial<LeagueForm>): void {
    this.league.update((f) => ({ ...f, ...patch }));
    this.saved.set(false);
  }

  protected setLadder(v: LadderValue): void {
    this.patchLeague({ divisions: v.divisions.map((d) => ({ ...d })), boundaries: [...v.boundaries] });
  }

  protected num(v: string | number | null): number | null {
    return v === null || v === '' ? null : Math.trunc(Number(v));
  }

  protected saveSchedule(): void {
    this.confirmReplace('schedule', () => this.api.setSchedule(this.name()!, scheduleRequest(this.schedule())));
  }

  protected saveLeague(): void {
    this.confirmReplace('league', () => this.api.setLeague(this.name()!, leagueRequest(this.league())));
  }

  protected turnOff(): void {
    const was = this.serverMode();
    this.ask.set({
      message: 'Turn off racing?',
      detail: `This deletes ${this.org()}'s ${LABEL[was]}. Past races and standings stay.`,
      confirmLabel: 'Turn off',
      run: () => this.run(() => this.removeMode(was)),
    });
  }

  protected removeCurrent(): void {
    const was = this.serverMode();
    this.ask.set({
      message: `Delete the ${LABEL[was]}?`,
      detail: `${this.org()} stops racing until you set up a schedule or league again. Past races and standings stay.`,
      confirmLabel: 'Delete',
      run: () => this.run(() => this.removeMode(was)),
    });
  }

  private confirmReplace(target: 'schedule' | 'league', save: () => Promise<unknown>): void {
    const was = this.serverMode();
    if (was === 'off' || was === target) {
      void this.run(save);
      return;
    }
    this.ask.set({
      message: 'Replace the current setup?',
      detail: `This replaces ${this.org()}'s ${LABEL[was]} with a ${LABEL[target]}.`,
      confirmLabel: 'Replace',
      run: () => this.run(async () => {
        await this.removeMode(was);
        await save();
      }),
    });
  }

  private removeMode(mode: RacingMode): Promise<void> {
    if (mode === 'schedule') return this.api.deleteSchedule(this.name()!);
    if (mode === 'league') return this.api.deleteLeague(this.name()!);
    return Promise.resolve();
  }

  protected async confirmed(): Promise<void> {
    const a = this.ask();
    this.ask.set(null);
    await a?.run();
  }

  // Every change reloads both, so the page always shows what the server really has, even after a half-done switch.
  private async run(step: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(false);
    try {
      await step();
      this.saved.set(true);
    } catch (e) {
      this.error.set(settingsErrorText(e, this.org()));
    } finally {
      this.busy.set(false);
      await this.load(this.error() === null);
    }
  }

  private async load(adoptMode = true): Promise<void> {
    try {
      const [s, l] = await Promise.all([this.api.schedule(this.name()!), this.api.league(this.name()!)]);
      this.serverSchedule.set(s.schedule);
      this.serverLeague.set(l.league);
      if (adoptMode || !this.loaded()) {
        this.mode.set(currentMode(s.schedule, l.league));
        this.schedule.set(scheduleFormFrom(s.schedule ?? l.league, this.browserTz));
        this.league.set(leagueFormFrom(l.league, this.browserTz));
      }
      this.loaded.set(true);
    } catch {
      this.loadFailed.set(true);
    }
  }
}
