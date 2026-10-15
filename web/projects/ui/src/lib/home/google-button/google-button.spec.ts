import { TestBed } from '@angular/core/testing';
import { GoogleButton } from './google-button';

describe('GoogleButton', () => {
  it('is a plain link to sign-in with Google’s mark', async () => {
    const f = TestBed.createComponent(GoogleButton);
    f.componentRef.setInput('href', '/api/auth/google/start?return_to=%2F');
    await f.whenStable();
    const a = (f.nativeElement as HTMLElement).querySelector('a.google')!;
    expect(a.getAttribute('href')).toBe('/api/auth/google/start?return_to=%2F');
    expect(a.textContent?.trim()).toBe('Sign in with Google');
    expect(a.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
