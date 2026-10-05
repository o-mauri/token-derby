import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { Button } from '../../button/button';
import { Confetti } from './confetti';

@Component({
  selector: 'sb-confetti',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Confetti, Button],
  template: `
    <div style="position:relative;height:340px;border:1px dashed var(--td-border)">
      @for (n of [run()]; track n) { <td-confetti /> }
      <div style="position:absolute;bottom:var(--td-space-5);left:var(--td-space-5)"><button td-button type="button" (click)="run.set(run() + 1)">Replay burst</button></div>
    </div>`,
})
class ConfettiDemo { protected readonly run = signal(0); }

const meta: Meta = { title: 'Race/Finished/Confetti', parameters: { layout: 'padded' } };
export default meta;

/** One burst when the finished screen appears, then it's gone. Press Replay to see it again. */
export const Burst: StoryObj = { render: () => ({ moduleMetadata: { imports: [ConfettiDemo] }, template: `<sb-confetti />` }) };
