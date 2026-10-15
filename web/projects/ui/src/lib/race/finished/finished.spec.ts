import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Finished } from './finished';
import { TimedTab } from '../../timed-tabs/timed-tabs';
import { finish } from '../podium/podium.spec';

const FIELD = Array.from({ length: 19 }, (_, i) => finish(i + 1, `H${i + 1}`, 5000 - i * 200));

@Component({
  imports: [Finished, TimedTab],
  template: `<td-finished [results]="results" [perPage]="8">
    <ng-template tdTab label="Cumulative tokens"><p class="chart">chart</p></ng-template>
  </td-finished>`,
})
class Host { results = FIELD; }

@Component({
  imports: [Finished],
  template: `<td-finished [results]="results" boardLabel="Overall" />`,
})
class LeagueHost { results = FIELD; }

describe('Finished', () => {
  it('titles the screen RESULT (the header names the race) with the size of the field', async () => {
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('.title .race')?.textContent).toBe('RESULT');
    expect(el.querySelector('.title .field')?.textContent).toBe('FINAL · 19 RUNNERS');
  });

  it('puts the top three on the podium and pages the rest of the field, then the extra tabs', async () => {
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('td-podium .place').length).toBe(3);
    const tabs = [...el.querySelectorAll('[role="tab"]')].map((t) => t.textContent?.trim());
    expect(tabs).toEqual(['Board 4–11', 'Board 12–19', 'Cumulative tokens']);
    expect([...el.querySelectorAll('td-result-board .row:not(.head) .name')].map((n) => n.textContent)).toEqual(
      ['H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10', 'H11'],
    );
  });

  it('names the board tabs with boardLabel', async () => {
    const f = TestBed.createComponent(LeagueHost);
    await f.whenStable();
    const tabs = [...(f.nativeElement as HTMLElement).querySelectorAll('[role="tab"]')].map((t) => t.textContent?.trim());
    expect(tabs).toEqual(['Overall 4–11', 'Overall 12–19']);
  });

  it('celebrates with confetti', async () => {
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    expect((f.nativeElement as HTMLElement).querySelector('td-confetti')).not.toBeNull();
  });
});
