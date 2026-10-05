import { ChangeDetectionStrategy, Component, TemplateRef, inject, input, viewChild } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { Button } from '../../button/button';
import { DialogFrame } from '../../dialog/dialog';
import { TdDialogService } from '../../dialog/dialog.service';
import { raceFixture } from '../race-chart/fixture';
import { RaceGraphs } from './race-graphs';

const flat = raceFixture(8);
const league = raceFixture(9, 120, 3);

@Component({
  selector: 'sb-graphs-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, DialogFrame, RaceGraphs],
  template: `
    <button td-button size="sm" type="button" (click)="open()">Graphs</button>
    <ng-template #graphs>
      <td-dialog title="Race graphs">
        <td-race-graphs [series]="data().series" [horses]="data().horses" [divisionNames]="divisions()" [nowMs]="data().series.end_ms" />
      </td-dialog>
    </ng-template>
  `,
})
class GraphsDialogDemo {
  readonly data = input(flat);
  readonly divisions = input<string[] | null>(null);
  private readonly tpl = viewChild.required<TemplateRef<unknown>>('graphs');
  private readonly dialogs = inject(TdDialogService);
  protected open(): void { this.dialogs.open(this.tpl(), { label: 'Race graphs' }); }
}

const meta: Meta<RaceGraphs> = {
  title: 'Race/Graphs/Graphs dialog',
  component: RaceGraphs,
  parameters: { layout: 'padded' },
  args: { series: flat.series, horses: flat.horses, divisionNames: null, failed: false, nowMs: flat.series.end_ms },
  render: (args) => ({ props: args, template: `<div style="height:560px;display:flex;flex-direction:column"><td-race-graphs [series]="series" [horses]="horses" [divisionNames]="divisionNames" [failed]="failed" [nowMs]="nowMs" /></div>` }),
};
export default meta;

/** Press Graphs: the real dialog, as the race header opens it. Escape, the ✕ or the backdrop close it. */
export const InDialog: StoryObj = { render: () => ({ moduleMetadata: { imports: [GraphsDialogDemo] }, template: `<sb-graphs-dialog />` }) };
/** League races add a division filter; colours stay with each horse whatever the filter. */
export const LeagueInDialog: StoryObj = {
  render: () => ({ moduleMetadata: { imports: [GraphsDialogDemo] }, props: { league, divisions: ['Premier', 'Championship', 'League One'] }, template: `<sb-graphs-dialog [data]="league" [divisions]="divisions" />` }),
};
export const Content: StoryObj<RaceGraphs> = {};
export const Loading: StoryObj<RaceGraphs> = { args: { series: null } };
export const Failed: StoryObj<RaceGraphs> = { args: { failed: true } };
