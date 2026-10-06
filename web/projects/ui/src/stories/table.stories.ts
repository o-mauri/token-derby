import { ChangeDetectionStrategy, Component } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular-vite';

const ROWS = [
  { name: 'Omar', email: 'omar@stackone.com', horses: 3, wins: 12, xp: 4210, joined: '2026-05-14' },
  { name: 'Dana', email: 'dana@stackone.com', horses: 2, wins: 4, xp: 1880, joined: '2026-05-23' },
  { name: 'Sam', email: null, horses: 1, wins: 0, xp: 120, joined: '2026-06-01' },
];

@Component({
  selector: 'sb-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="td-table-scroll">
      <table class="td-table">
        <thead><tr><th>Jockey</th><th>Email</th><th class="num">Horses</th><th class="num">Wins</th><th class="num">XP</th><th>Joined</th></tr></thead>
        <tbody>
          @for (r of rows; track r.name) {
            <tr>
              <td><a href="#">{{ r.name }}</a></td>
              <td class="muted">{{ r.email ?? '—' }}</td>
              <td class="num">{{ r.horses }}</td><td class="num">{{ r.wins }}</td><td class="num">{{ r.xp }}</td>
              <td class="muted">{{ r.joined }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `:host { display: block; }`,
})
class TableDemo {
  protected readonly rows = ROWS;
}

const meta: Meta<TableDemo> = { title: 'Foundations/Table', component: TableDemo, parameters: { layout: 'padded' } };
export default meta;

/** `.td-table` in `.td-table-scroll`: muted headers, row dividers, right-aligned numbers, linked first column. */
export const DataTable: StoryObj<TableDemo> = {};
