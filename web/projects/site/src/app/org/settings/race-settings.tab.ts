import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import type { ModifierId, ModifierSetting, ModifierSettings } from '@token-derby/shared';
import { MODIFIERS, MODIFIER_IDS } from '@token-derby/shared';
import { Button, Confirm, Loader, ModifierCard } from '@token-derby/ui';
import { OrgData } from '../org-data';
import { DraftRegistry } from './drafts';
import { OrgOwner } from './org-owner';
import { OrgSettingsApi } from './org-settings-api';
import { persistRequest, storedModifiers } from './race-settings-model';
import { settingsErrorText } from './settings-errors';

/** The race modifiers (stamina and friends): each on or off, with its tuning. Saved together. */
@Component({
  selector: 'site-race-settings-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Confirm, Loader, ModifierCard],
  host: { 'data-tab': 'race-settings' },
  template: `
    <div class="column">
      @if (!loaded()) {
        <div class="loading"><td-loader /></div>
      } @else {
        @if (error(); as message) { <p class="error" role="alert">{{ message }}</p> }
        @for (m of modifiers; track m.id) {
          <td-modifier-card [modifier]="m.def" [value]="draft()[m.id]" (valueChange)="set(m.id, $event)" />
        }
        <div class="row bar">
          @if (saved()) { <span class="saved" role="status">Saved.</span> }
          <button type="button" class="reset danger-link" (click)="confirmReset.set(true)">Reset to defaults</button>
          <button td-button type="button" class="save" [disabled]="!dirty() || busy()" (click)="save()">Save</button>
        </div>
      }
    </div>
    <td-confirm [open]="confirmReset()" message="Reset every race setting?" detail="All modifiers go back to their defaults." confirmLabel="Reset"
      tone="danger" (confirm)="reset()" (cancel)="confirmReset.set(false)" />
  `,
  styleUrl: './settings-tab.scss',
  styles: `.bar { justify-content: flex-end; } .danger-link { background: none; border: 0; font: inherit; color: var(--td-error); cursor: pointer; text-decoration: underline dotted; }`,
})
export class RaceSettingsTab {
  private readonly api = inject(OrgSettingsApi);
  private readonly owner = inject(OrgOwner);
  private readonly drafts = inject(DraftRegistry);
  private readonly name = inject(OrgData).name;

  protected readonly modifiers = MODIFIER_IDS.map((id) => ({ id, def: MODIFIERS[id] }));
  private readonly stored = signal<ModifierSettings>({});
  protected readonly draft = signal<ModifierSettings>({});
  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmReset = signal(false);
  protected readonly dirty = computed(() => JSON.stringify(persistRequest(this.draft())) !== JSON.stringify(persistRequest(this.stored())));

  constructor() {
    void this.load();
    effect(() => this.drafts.set('Race settings', this.dirty()));
    inject(DestroyRef).onDestroy(() => this.drafts.set('Race settings', false));
  }

  protected set(id: ModifierId, value: ModifierSetting): void {
    this.draft.update((d) => ({ ...d, [id]: value }));
    this.saved.set(false);
  }

  protected save(): Promise<void> {
    return this.write(persistRequest(this.draft()));
  }

  protected reset(): Promise<void> {
    this.confirmReset.set(false);
    return this.write({});
  }

  private async write(body: Parameters<OrgSettingsApi['setRaceSettings']>[1]): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const res = await this.api.setRaceSettings(this.name()!, body);
      this.adopt(storedModifiers(res.settings));
      this.saved.set(true);
    } catch (e) {
      this.error.set(settingsErrorText(e, this.owner.org()?.org_name ?? ''));
    } finally {
      this.busy.set(false);
    }
  }

  private adopt(m: ModifierSettings): void {
    this.stored.set(m);
    this.draft.set(m);
  }

  private async load(): Promise<void> {
    try {
      this.adopt(storedModifiers((await this.api.raceSettings(this.name()!)).settings));
    } catch (e) {
      this.error.set(settingsErrorText(e, this.owner.org()?.org_name ?? ''));
    } finally {
      this.loaded.set(true);
    }
  }
}
