import { describe, it, expect } from 'vitest';
import './../setup.js';
import { claimRelease } from '../../src/db/releases.js';
import type { AnnounceReleaseRequest } from '@token-derby/shared';

function release(version: string, component: 'cli' | 'site' = 'cli'): AnnounceReleaseRequest {
  return { component, version, date: '2026-07-28', changes: ['first thing'] };
}

describe('release markers', () => {
  it('claims a version at most once', async () => {
    const v = `2.13.${Date.now() % 1000}`;
    expect(await claimRelease(release(v))).toBe(true);
    expect(await claimRelease(release(v))).toBe(false);
  });

  it('tracks cli and site versions independently', async () => {
    const v = `3.0.${Date.now() % 1000}`;
    expect(await claimRelease(release(v, 'cli'))).toBe(true);
    expect(await claimRelease(release(v, 'site'))).toBe(true);
  });
});
