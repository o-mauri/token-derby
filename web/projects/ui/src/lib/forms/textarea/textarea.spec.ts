import { TestBed } from '@angular/core/testing';
import { Textarea } from './textarea';

describe('Textarea', () => {
  it('updates value, honours rows and disabled', async () => {
    const f = TestBed.createComponent(Textarea);
    f.componentRef.setInput('label', 'Notes');
    f.componentRef.setInput('rows', 6);
    await f.whenStable();
    const ta = (f.nativeElement as HTMLElement).querySelector('textarea')!;
    expect(Number(ta.rows)).toBe(6);
    ta.value = 'hello';
    ta.dispatchEvent(new Event('input'));
    expect(f.componentInstance.value()).toBe('hello');
    f.componentRef.setInput('disabled', true);
    await f.whenStable();
    expect(ta.disabled).toBe(true);
  });
});
