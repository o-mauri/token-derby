import { TestBed } from '@angular/core/testing';
import { ThemeBackdrop } from './theme-backdrop';

describe('ThemeBackdrop', () => {
  it('renders hidden fog and three rain layers', () => {
    const fixture = TestBed.createComponent(ThemeBackdrop);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('.fog')).not.toBeNull();
    expect(host.querySelectorAll('.rain > i').length).toBe(3);
  });
});
