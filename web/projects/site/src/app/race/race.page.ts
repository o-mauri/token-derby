import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** /race/:code. Filled in with the live race in the next step. */
@Component({
  selector: 'site-race-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-page': 'race' },
  template: `<p>{{ joinCode() }}</p>`,
})
export class RacePage {
  readonly code = input.required<string>();
  // Join codes are case-insensitive; the API stores them upper-cased.
  protected readonly joinCode = computed(() => this.code().toUpperCase());
}
