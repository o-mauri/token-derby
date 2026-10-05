import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RaceHeader } from './header';

@Component({
  imports: [RaceHeader],
  template: `<td-race-header [name]="name" [status]="status" [anchor]="anchor" joinCode="WUEF98" [orgName]="org"
    (home)="events.push('home')" (org)="events.push('org')" (graphs)="events.push('graphs')"><span class="slotted">picker</span></td-race-header>`,
})
class Host {
  name = 'Friday Derby';
  status: 'pending' | 'live' | 'finished' | null = 'live';
  anchor = { atMs: Date.now(), timeLeftSeconds: 3600 };
  org: string | null = 'Acme';
  events: string[] = [];
}

async function render(patch: Partial<Host> = {}) {
  const f = TestBed.createComponent(Host);
  Object.assign(f.componentInstance, patch);
  await f.whenStable();
  return { f, el: f.nativeElement as HTMLElement };
}
const buttons = (el: HTMLElement) => [...el.querySelectorAll('button')].map((b) => b.textContent?.trim());

describe('RaceHeader', () => {
  it('shows the race name (full name on hover), status, countdown and join code', async () => {
    const { el } = await render();
    const name = el.querySelector('h1 .name')!;
    expect(name.textContent).toBe('Friday Derby');
    expect(name.getAttribute('title')).toBe('Friday Derby');
    expect(el.querySelector('.status')!.textContent?.trim()).toBe('live');
    expect(el.querySelector('.status')!.classList.contains('live')).toBe(true);
    expect(el.querySelector('td-countdown')!.textContent?.trim()).toBe('01:00:00');
    expect(el.querySelector('.join-code')!.textContent).toContain('WUEF98');
  });

  it('labels the readouts for screen readers even though the labels are not shown', async () => {
    const { el } = await render();
    const labels = [...el.querySelectorAll('.meta .sr-only')].map((l) => l.textContent?.trim());
    expect(labels).toEqual(['Status:', 'Time left:', 'Join code:']);
  });

  it('puts projected content (the theme picker) before the back buttons', async () => {
    const { el } = await render();
    const meta = el.querySelector('.meta')!;
    const kids = [...meta.children];
    expect(kids.indexOf(meta.querySelector('.slot')!)).toBeLessThan(kids.indexOf(meta.querySelector('.org')!));
    expect(meta.querySelector('.slot .slotted')).not.toBeNull();
  });

  it('emits its button events instead of navigating', async () => {
    const { f, el } = await render();
    expect(buttons(el)).toEqual(['Graphs', '← Acme', '← Home']);
    for (const b of [...el.querySelectorAll('button')]) b.click();
    expect(f.componentInstance.events).toEqual(['graphs', 'org', 'home']);
  });

  it('greys out Graphs once the race has finished, since the results show the charts', async () => {
    const { f, el } = await render({ status: 'finished' });
    const graphs = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Graphs')!;
    expect(graphs.disabled).toBe(true);
    graphs.click();
    expect(f.componentInstance.events).toEqual([]);
  });

  it('only offers the org button when the race belongs to an org', async () => {
    const { el } = await render({ org: null });
    expect(buttons(el)).toEqual(['Graphs', '← Home']);
  });

  it('shows dashes until the first poll arrives, with a blank title', async () => {
    const { el } = await render({ name: '', status: null, anchor: null as never });
    expect(el.querySelector('h1 .name')!.textContent).toBe('');
    expect(el.querySelector('.status')!.textContent?.trim()).toBe('—');
    expect(el.querySelector('td-countdown')!.textContent?.trim()).toBe('--:--:--');
  });
});
