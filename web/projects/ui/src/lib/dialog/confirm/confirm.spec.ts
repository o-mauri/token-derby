import { TestBed } from '@angular/core/testing';
import { Confirm } from './confirm';

async function render(open: boolean) {
  const f = TestBed.createComponent(Confirm);
  f.componentRef.setInput('open', open);
  f.componentRef.setInput('message', 'Revoke old-laptop?');
  f.componentRef.setInput('confirmLabel', 'Revoke');
  const events: string[] = [];
  f.componentInstance.confirm.subscribe(() => events.push('confirm'));
  f.componentInstance.cancel.subscribe(() => events.push('cancel'));
  document.body.append(f.nativeElement);
  await f.whenStable();
  return { el: f.nativeElement as HTMLElement, events, f };
}

describe('Confirm', () => {
  it('renders nothing while closed', async () => {
    expect((await render(false)).el.querySelector('.box')).toBeNull();
  });

  it('shows the message as an alert dialog and takes focus', async () => {
    const { el } = await render(true);
    const box = el.querySelector('.box')!;
    expect(box.getAttribute('role')).toBe('alertdialog');
    expect(box.textContent).toContain('Revoke old-laptop?');
    await new Promise((r) => setTimeout(r, 0));
    expect(box.contains(document.activeElement)).toBe(true);
  });

  it('emits confirm and cancel', async () => {
    const { el, events } = await render(true);
    el.querySelector<HTMLButtonElement>('button.confirm')!.click();
    el.querySelector<HTMLButtonElement>('button.cancel')!.click();
    expect(events).toEqual(['confirm', 'cancel']);
  });

  it('cancels on Escape', async () => {
    const { el, events } = await render(true);
    el.querySelector('.box')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(events).toEqual(['cancel']);
  });
});
