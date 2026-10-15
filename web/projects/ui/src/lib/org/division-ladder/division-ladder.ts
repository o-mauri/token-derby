import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import type { DivisionConfig } from '@token-derby/shared';
import { TextInput } from '../../forms/text-input/text-input';

export type LadderValue = { readonly divisions: readonly DivisionConfig[]; readonly boundaries: readonly number[] };

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
// A cleared box stays cleared (NaN fails validation) instead of jumping to 0 mid-edit.
const asCount = (v: string | number | null) => (v === null || v === '' ? NaN : Math.trunc(Number(v)));

/** A league's divisions top to bottom, with how many horses swap between each pair every season. The bottom one has no cap. */
@Component({
  selector: 'td-division-ladder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TextInput],
  templateUrl: './division-ladder.html',
  styleUrl: './division-ladder.scss',
})
export class DivisionLadder {
  readonly value = model<LadderValue>({ divisions: [{ name: 'Division 1', cap: 8 }], boundaries: [] });
  readonly error = input<string | null>(null);

  protected readonly summary = computed(() => {
    const { divisions } = this.value();
    const last = divisions.at(-1)!;
    if (divisions.length === 1) return `Everyone races in ${last.name}.`;
    const top = divisions.slice(0, -1);
    const fit = top.reduce((n, d) => n + (Number.isFinite(d.cap) ? d.cap : 0), 0);
    const count = WORDS[top.length] ?? String(top.length);
    return `${fit} horses fit in the top ${top.length === 1 ? 'one' : count}; everyone else starts in ${last.name}.`;
  });

  protected shown(n: number | undefined): number | null {
    return n !== undefined && Number.isFinite(n) ? n : null;
  }

  protected rename(i: number, name: string | number | null): void {
    this.patchDivision(i, { name: String(name ?? '') });
  }

  protected setCap(i: number, cap: string | number | null): void {
    this.patchDivision(i, { cap: asCount(cap) });
  }

  protected setSwap(i: number, n: string | number | null): void {
    const boundaries = [...this.value().boundaries];
    boundaries[i] = asCount(n);
    this.value.set({ ...this.value(), boundaries });
  }

  protected add(): void {
    const { divisions, boundaries } = this.value();
    const cap = divisions.length > 1 ? divisions.at(-2)!.cap : 8;
    this.value.set({
      divisions: [...divisions.slice(0, -1), { ...divisions.at(-1)!, cap }, { name: `Division ${divisions.length + 1}`, cap }],
      boundaries: [...boundaries, 2],
    });
  }

  protected remove(i: number): void {
    const { divisions, boundaries } = this.value();
    if (divisions.length < 2) return;
    this.value.set({
      divisions: divisions.filter((_, j) => j !== i),
      boundaries: boundaries.filter((_, j) => j !== Math.max(0, i - 1)),
    });
  }

  private patchDivision(i: number, patch: Partial<DivisionConfig>): void {
    this.value.set({ ...this.value(), divisions: this.value().divisions.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  }
}
