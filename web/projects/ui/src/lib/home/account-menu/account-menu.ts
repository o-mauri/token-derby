import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { RouterLink } from '@angular/router';

/** Your name in the header, opening My page, Account and Sign out. Pages that don't exist yet show greyed with "Soon". */
@Component({
  selector: 'td-account-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkMenuTrigger, CdkMenu, CdkMenuItem, RouterLink],
  template: `
    <button type="button" class="trigger" [cdkMenuTriggerFor]="menu" [attr.aria-label]="'Account menu, ' + name()">
      <span class="initial" aria-hidden="true">{{ initial() }}</span>
      <span class="name">{{ name() }}</span>
      <span class="caret" aria-hidden="true">▾</span>
    </button>
    <ng-template #menu>
      <div class="menu" cdkMenu>
        @for (page of pages(); track page.label) {
          @if (page.link) {
            <a class="item" cdkMenuItem [routerLink]="page.link">{{ page.label }}</a>
          } @else {
            <button type="button" class="item soon" cdkMenuItem disabled>{{ page.label }} <span class="badge">Soon</span></button>
          }
        }
        <button type="button" class="item" cdkMenuItem (cdkMenuItemTriggered)="signOut.emit()">Sign out</button>
      </div>
    </ng-template>
  `,
  styleUrl: './account-menu.scss',
})
export class AccountMenu {
  readonly name = input.required<string>();
  readonly meLink = input<readonly unknown[] | null>(null);
  readonly accountLink = input<readonly unknown[] | null>(null);
  readonly signOut = output<void>();

  protected readonly initial = computed(() => this.name().trim().charAt(0).toUpperCase());
  protected readonly pages = computed(() => [
    { label: 'My page', link: this.meLink() },
    { label: 'Account', link: this.accountLink() },
  ]);
}
