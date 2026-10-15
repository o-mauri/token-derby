import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NotFound } from '@token-derby/ui';

/** Any admin path that isn't a page. */
@Component({
  selector: 'admin-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NotFound],
  host: { 'data-page': 'not-found' },
  template: `<main class="column"><td-not-found title="Page not found" [message]="message()" backLabel="← Users" (back)="back()" /></main>`,
  styles: `:host, .column { flex: 1; min-height: 0; display: flex; flex-direction: column; }`,
})
export class NotFoundPage {
  private readonly router = inject(Router);
  protected readonly message = computed(() => ['Nothing at ', { strong: this.router.url }, '.']);

  protected back(): void {
    void this.router.navigate(['/users']);
  }
}
