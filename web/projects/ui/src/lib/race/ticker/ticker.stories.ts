import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { Button } from '../../button/button';
import type { TickerCell } from '../logic/ticker';
import { Ticker } from './ticker';

const order = (names: string[], lead: number): TickerCell[] =>
  names.map((horseName, i) => ({ kind: 'order', position: i + 1, horseName, isLeader: i === 0, valueText: i === 0 ? lead.toLocaleString() : `−${(i * 365 + 120).toLocaleString()}` }));

const ACHIEVEMENTS: TickerCell[] = [
  { kind: 'sectiongap' },
  { kind: 'achievement', item: { horseName: 'Embers', name: 'Stampede!', description: '10,000 tokens in a minute', xp: 50 } },
  { kind: 'sep' },
  { kind: 'achievement', item: { horseName: 'Pegasus', name: 'Pulled Away!', description: 'Climbed 3 places', xp: 25 } },
  { kind: 'sep' },
  { kind: 'achievement', item: { horseName: 'Misty', name: 'Hat drop', description: 'Found a Viking Helmet', xp: 10 } },
];

const LIVE = [...order(['Stormbringer', 'Pegasus', 'Cloudrunner', 'Embers', 'Thunderbolt', 'Misty'], 4280), ...ACHIEVEMENTS];

const LEAGUE: TickerCell[] = [
  { kind: 'label', text: 'Premier', groupClass: 'ticker-div-1' }, ...order(['Bolt', 'Fern', 'Quill'], 9120),
  { kind: 'groupsep' },
  { kind: 'label', text: 'Championship', groupClass: 'ticker-div-2' }, ...order(['Rook', 'Sable'], 5310),
  { kind: 'sectiongap', wide: true },
  { kind: 'label', text: 'Standings', groupClass: 'ticker-div-3' },
  { kind: 'standing', position: 1, horseName: 'Bolt', total: 54, gain: 25, isLeader: true },
  { kind: 'standing', position: 2, horseName: 'Fern', total: 47, gain: 18, isLeader: false },
  { kind: 'standing', position: 3, horseName: 'Quill', total: 31, gain: 0, isLeader: false },
];

const meta: Meta<Ticker> = {
  title: 'Race/Ticker',
  component: Ticker,
  parameters: { layout: 'fullscreen' },
  args: { cells: LIVE },
  render: (args) => ({ props: args, template: `<div style="padding-top:var(--td-space-8)"><td-ticker [cells]="cells" /></div>` }),
};
export default meta;

/** The live order (leader's tokens, then everyone's gap behind), then fresh achievements. Hover to pause. */
export const LiveOrder: StoryObj<Ticker> = {};
/** A league fixture: division-labelled order, then the projected standings with what this race would add. */
export const League: StoryObj<Ticker> = { args: { cells: LEAGUE } };
export const Empty: StoryObj<Ticker> = { args: { cells: [] } };

@Component({
  selector: 'sb-ticker-swap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Ticker, Button],
  template: `
    <div style="padding:var(--td-space-6);display:flex;gap:var(--td-space-5);align-items:center">
      <button td-button type="button" (click)="swap()">Queue a new batch</button>
      <span style="color:var(--td-text-muted);font-size:var(--td-text-sm)">Queued: {{ queued() }}</span>
    </div>
    <td-ticker [cells]="cells()" />
  `,
})
class TickerSwap {
  private readonly batches = [LIVE, LEAGUE];
  private i = 0;
  protected readonly cells = signal(LIVE);
  protected readonly queued = signal('live order');
  protected swap(): void {
    this.i = (this.i + 1) % this.batches.length;
    this.cells.set(this.batches[this.i]!);
    this.queued.set(this.i ? 'league' : 'live order');
  }
}

/** A new batch never cuts in: the current pass runs to its end, then the queued one takes over. */
export const BatchSwap: StoryObj = { render: () => ({ moduleMetadata: { imports: [TickerSwap] }, template: `<sb-ticker-swap />` }) };
