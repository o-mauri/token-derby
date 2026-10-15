import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Page } from './page';

@Component({
  imports: [Page],
  template: `<td-page><h1 tdPageHeader>Head</h1><p class="body">Body</p></td-page>`,
})
class Host {}

describe('Page', () => {
  it('projects the header slot before the body', async () => {
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    const page = f.nativeElement.querySelector('td-page') as HTMLElement;
    expect(page.querySelector('header h1')?.textContent).toBe('Head');
    expect(page.querySelector('main .body')?.textContent).toBe('Body');
  });
});
