import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Tabs } from './tabs';

@Component({ imports: [Tabs], template: `<td-tabs label="Account" [tabs]="tabs" />` })
class Host { tabs = [{ label: 'Profile', link: ['/account'] }, { label: 'Devices', link: ['/account/devices'] }]; }

describe('Tabs', () => {
  it('marks the tab for the current page', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'account', component: Host }, { path: 'account/devices', component: Host }])] });
    const harness = await RouterTestingHarness.create('/account/devices');
    const el = harness.routeNativeElement as HTMLElement;
    const [profile, devices] = [...el.querySelectorAll<HTMLAnchorElement>('nav a.tab')];
    expect(el.querySelector('nav')?.getAttribute('aria-label')).toBe('Account');
    expect(devices!.classList.contains('on')).toBe(true);
    expect(devices!.getAttribute('aria-current')).toBe('page');
    expect(profile!.classList.contains('on')).toBe(false);
    expect(profile!.getAttribute('href')).toBe('/account');
  });
});
