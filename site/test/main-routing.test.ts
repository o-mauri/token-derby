import { describe, it, expect, vi } from 'vitest';
import { handOffSignIn } from '../src/hand-off.js';

describe('home sign-in hand-off', () => {
  it('forwards / with a code to the org manager, keeping the code', () => {
    const replace = vi.fn();
    expect(handOffSignIn({ pathname: '/', hash: '#code=abc' } as Location, replace)).toBe(true);
    expect(replace).toHaveBeenCalledWith('/org-manager#code=abc');
  });

  it('leaves everything else alone', () => {
    const replace = vi.fn();
    expect(handOffSignIn({ pathname: '/', hash: '' } as Location, replace)).toBe(false);
    expect(handOffSignIn({ pathname: '/race/ABC', hash: '#code=abc' } as Location, replace)).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });
});
