import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Horse, type HorseColors } from '../horse/horse';

const FAR: HorseColors = { body: '#d9d4cc', mane: '#5b5650', tail: '#5b5650', saddle: '#3b82f6' };
const NEAR: HorseColors = { body: '#8B4513', mane: '#2b1a0e', tail: '#2b1a0e', saddle: '#d94848' };

/** Full-page loading indicator: two horses trading the lead seen through a
 *  porthole, ringed by a spinner arc. Hidden for its first 250ms. */
@Component({
  selector: 'td-loader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Horse],
  host: { role: 'status' },
  template: `
    <div class="loader-ring">
      <div class="loader-porthole">
        <div class="loader-track">
          <div class="loader-horse far"><td-horse [colors]="far" running dust /></div>
          <div class="loader-horse near"><td-horse class="offset" [colors]="near" running dust /></div>
        </div>
      </div>
    </div>
    <div class="loader-caption">Loading…</div>
  `,
  styleUrl: './loader.scss',
})
export class Loader {
  protected readonly far = FAR;
  protected readonly near = NEAR;
}
