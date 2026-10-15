import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { type Crumb, Crumbs } from './crumbs';

async function render(parts: Crumb[]) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const f = TestBed.createComponent(Crumbs);
  f.componentRef.setInput('parts', parts);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}

describe('Crumbs', () => {
  it('shows the logo, then each part as a chevron, the last one highlighted', async () => {
    const el = await render([{ label: 'Acme', key: 'org-name' }, { label: 'League' }]);
    expect(el.querySelector('td-horse-face')).not.toBeNull();
    const parts = [...el.querySelectorAll('.part')];
    expect(parts.map((p) => p.textContent?.trim())).toEqual(['Acme', 'League']);
    // The chevron shapes separate the steps, so there are no slash separators.
    expect(el.querySelectorAll('.sep')).toHaveLength(0);
    expect(parts.every((p) => p.classList.contains('seg'))).toBe(true);
    expect(parts[1]!.classList.contains('here')).toBe(true);
    expect(parts[0]!.classList.contains('org-name')).toBe(true);
  });

  it('links an earlier part when it has somewhere to go, never the current one', async () => {
    const el = await render([{ label: 'Acme', link: ['/org', 'Acme'] }, { label: 'Races', link: ['/org', 'Acme', 'races'] }]);
    const links = el.querySelectorAll('a.part');
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute('href')).toBe('/org/Acme');
  });

  it('marks the current page for assistive tech inside a labelled nav', async () => {
    const el = await render([{ label: 'Omar' }, { label: 'Account' }]);
    expect(el.querySelector('nav')?.getAttribute('aria-label')).toBe('Breadcrumb');
    expect(el.querySelector('.here')?.getAttribute('aria-current')).toBe('page');
  });

  it('uses projected content as the current step when given a tail', async () => {
    @Component({ imports: [Crumbs], template: `<td-crumbs [parts]="[{ label: 'Race' }]" tail><span class="name">Friday Derby</span></td-crumbs>` })
    class Host {}
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    const parts = [...el.querySelectorAll('.part')];
    expect(parts.map((p) => p.textContent?.trim())).toEqual(['Race', 'Friday Derby']);
    expect(parts[0]!.classList.contains('here')).toBe(false);
    expect(parts[1]!.classList.contains('here')).toBe(true);
    expect(parts[1]!.querySelector('.name')).not.toBeNull();
  });
});
