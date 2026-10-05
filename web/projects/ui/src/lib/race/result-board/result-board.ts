import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Horse } from '../../horse/horse';
import { XpBar } from '../xp-bar/xp-bar';
import type { FinishView } from '../models';

export type BoardPage = { readonly label: string; readonly rows: readonly FinishView[] };

/** Split the field below the podium into pages, labelled by the places they cover. */
export function boardPages(rows: readonly FinishView[], perPage: number): BoardPage[] {
  const pages: BoardPage[] = [];
  for (let i = 0; i < rows.length; i += perPage) {
    const slice = rows.slice(i, i + perPage);
    pages.push({ label: `Board ${slice[0]!.position}–${slice.at(-1)!.position}`, rows: slice });
  }
  if (pages.length === 1) return [{ label: 'Board', rows: pages[0]!.rows }];
  return pages;
}

/** The results board for the field below the podium. */
@Component({
  selector: 'td-result-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Horse, XpBar],
  template: `
    <div class="row head" aria-hidden="true"><span>Pos</span><span></span><span>Horse</span><span>Tokens</span><span class="col-behind">Behind</span><span>Level</span></div>
    @for (h of rows(); track h.id) {
      <div class="row">
        <span class="pos">{{ h.position }}</span>
        <span class="sprite"><td-horse [colors]="h.colors" [hat]="h.hat" /></span>
        <span class="who"><span class="name">{{ h.name }}</span>&ngsp;<span class="owner">{{ h.owner }}</span></span>
        <span class="tokens">{{ fmt(h.tokens) }}</span>
        <span class="behind col-behind">{{ h.behind === null ? '—' : '−' + fmt(h.behind) }}</span>
        <td-xp-bar class="xp" [xpBefore]="h.xpBefore" [xpAwarded]="h.xpAwarded" size="sm" />
      </div>
    }
  `,
  styleUrl: './result-board.scss',
})
export class ResultBoard {
  readonly rows = input.required<readonly FinishView[]>();
  protected readonly fmt = (n: number) => n.toLocaleString('en-US');
}
