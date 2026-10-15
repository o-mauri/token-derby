import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { API_HOSTNAME, Button, Loader } from '@token-derby/ui';
import { siteOrgUrl } from '../claims/claims-model';
import { AdminData } from '../data/admin-data';

/** Every organisation with its members; names link to the org's public page on the site. */
@Component({
  selector: 'admin-organisations-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Loader],
  host: { 'data-page': 'organisations' },
  templateUrl: './organisations.page.html',
  styleUrl: '../users/list-page.scss',
})
export class OrganisationsPage {
  protected readonly data = inject(AdminData);
  private readonly hostname = inject(API_HOSTNAME);

  protected readonly rows = computed(() => (this.data.orgs.value()?.organisations ?? [])
    .map((o) => ({
      id: o.org_id, name: o.org_name, href: siteOrgUrl(o.org_name, this.hostname),
      members: o.members.map((m) => m.user_name).join(', '), count: o.members.length,
      creator: o.creator_user_name, created: o.created_at.slice(0, 10),
    }))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())));

  constructor() {
    this.data.ensureOrgs();
  }
}
