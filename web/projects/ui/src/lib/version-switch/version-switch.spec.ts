import { TestBed } from '@angular/core/testing';
import { VersionSwitch } from './version-switch';

describe('VersionSwitch', () => {
  async function render(on?: boolean) {
    const f = TestBed.createComponent(VersionSwitch);
    if (on !== undefined) f.componentRef.setInput('on', on);
    await f.whenStable();
    return f;
  }

  it('is an on switch labelled V2 by default', async () => {
    const el = (await render()).nativeElement as HTMLElement;
    const btn = el.querySelector('button')!;
    expect(btn.getAttribute('role')).toBe('switch');
    expect(btn.getAttribute('aria-checked')).toBe('true');
    expect(btn.textContent).toContain('V2');
  });

  it('reflects off', async () => {
    const el = (await render(false)).nativeElement as HTMLElement;
    expect(el.querySelector('button')!.getAttribute('aria-checked')).toBe('false');
  });

  it('emits switched when pressed', async () => {
    const f = await render();
    let count = 0;
    f.componentInstance.switched.subscribe(() => count++);
    (f.nativeElement as HTMLElement).querySelector('button')!.click();
    expect(count).toBe(1);
  });
});
