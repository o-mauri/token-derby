import { ChangeDetectionStrategy, Component, booleanAttribute, input, output } from '@angular/core';

/** The V2 switch shared with v1: shows which site you're on; pressing it asks to change. */
@Component({
  selector: 'td-version-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" role="switch" [attr.aria-checked]="on()" [title]="on() ? 'Back to the classic site' : 'Try the new site'" (click)="switched.emit()">
      <span class="track" aria-hidden="true"><span class="knob"></span></span><span class="label">V2</span>
    </button>
  `,
  styleUrl: './version-switch.scss',
})
export class VersionSwitch {
  readonly on = input(true, { transform: booleanAttribute });
  readonly switched = output<void>();
}
