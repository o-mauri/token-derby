import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** One horse on the gap track. `at` is its left edge in percent; the tones are CSS colours. */
export type GapMark = {
  readonly id: string;
  readonly name: string;
  readonly at: number;
  readonly you: boolean;
  readonly side: 'you' | 'ahead' | 'behind';
  readonly tone: string;
  readonly markTone: string;
  readonly label: string;
  readonly value: string;
};

/** A hovered horse and its rivals behind to ahead: each gap in a fixed slot above a small track of marks. */
@Component({
  selector: 'td-gap-track',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.--marks]': 'marks().length' },
  template: `
    <div class="slots">
      @for (m of marks(); track m.id) {
        <div [class]="'slot ' + m.side" [style.--tone]="m.tone"><span class="label">{{ m.label }}</span><span class="value">{{ m.value }}</span></div>
      }
    </div>
    <div class="ticks">
      @for (m of marks(); track m.id) { <i [style.--tone]="m.tone" [style.left.%]="m.at"></i> }
    </div>
    <div class="lane-track">
      @for (m of marks(); track m.id) { <i class="mark" [class.you]="m.you" [style.--tone]="m.markTone" [style.left.%]="m.at"></i> }
    </div>
    <div class="runners">
      @for (m of marks(); track m.id) { <span>{{ m.name }}</span> }
    </div>
  `,
  styleUrl: './gap-track.scss',
})
export class GapTrack {
  readonly marks = input.required<readonly GapMark[]>();
}
