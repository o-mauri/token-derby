import { Component, TemplateRef, inject, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DialogFrame } from './dialog';
import { TdDialogService } from './dialog.service';

@Component({
  imports: [DialogFrame],
  template: `<ng-template #tpl><td-dialog title="Race graphs"><p class="content">Charts</p></td-dialog></ng-template>`,
})
class Host {
  readonly tpl = viewChild.required<TemplateRef<unknown>>('tpl');
  readonly dialog = inject(TdDialogService);
  open() { return this.dialog.open(this.tpl(), { label: 'Race graphs' }); }
}

describe('DialogFrame', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  it('shows its title and content in a CDK dialog', async () => {
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    f.componentInstance.open();
    await f.whenStable();
    const container = document.querySelector('[role="dialog"]')!;
    expect(container.getAttribute('aria-modal')).toBe('true');
    expect(container.getAttribute('aria-label')).toBe('Race graphs');
    expect(document.querySelector('td-dialog h2')?.textContent).toBe('Race graphs');
    expect(document.querySelector('td-dialog .content')?.textContent).toBe('Charts');
  });

  it('closes from its close button', async () => {
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    const ref = f.componentInstance.open();
    await f.whenStable();
    let closed = false;
    ref.closed.subscribe(() => (closed = true));
    document.querySelector<HTMLButtonElement>('td-dialog button.close')!.click();
    expect(closed).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('td-dialog button.close')).toBeNull();
  });

  it('labels the close button for screen readers', async () => {
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    f.componentInstance.open();
    await f.whenStable();
    expect(document.querySelector('td-dialog button.close')!.getAttribute('aria-label')).toBe('Close Race graphs');
  });
});
