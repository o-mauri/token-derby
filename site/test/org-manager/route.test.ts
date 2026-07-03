import { describe, it, expect } from 'vitest';
import { parseRoute } from '../../src/route.js';

describe('parseRoute — org-manager', () => {
  it('parses /org-manager to the org-manager route', () => {
    expect(parseRoute('/org-manager')).toEqual({ type: 'org-manager' });
  });
  it('keeps /org/<name> as the public org route', () => {
    expect(parseRoute('/org/StackOne')).toEqual({ type: 'org', orgName: 'StackOne' });
  });
});
