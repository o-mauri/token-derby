import { describe, it, expect, vi } from 'vitest';
import { checkForUpdate } from '../electron/updater.js';

function release(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: 'v9.9.9',
    body: 'Notes go here',
    html_url: 'https://github.com/o-mauri/token-derby/releases/tag/v9.9.9',
    assets: [
      { name: 'Token Derby-9.9.9.dmg', browser_download_url: 'https://example.com/Token-Derby-9.9.9.dmg' },
    ],
    ...overrides,
  };
}

describe('checkForUpdate', () => {
  it('reports an update when the feed has a newer version', async () => {
    const fetchFeed = vi.fn(async () => release());

    const result = await checkForUpdate('1.0.0', fetchFeed);

    expect(result).toEqual({
      update: true,
      version: '9.9.9',
      url: 'https://example.com/Token-Derby-9.9.9.dmg',
      notes: 'Notes go here',
    });
  });

  it('falls back to the release html_url when no .dmg asset is present', async () => {
    const fetchFeed = vi.fn(async () => release({ assets: [] }));

    const result = await checkForUpdate('1.0.0', fetchFeed);

    expect(result).toEqual({
      update: true,
      version: '9.9.9',
      url: 'https://github.com/o-mauri/token-derby/releases/tag/v9.9.9',
      notes: 'Notes go here',
    });
  });

  it('reports no update when the feed version equals the current version', async () => {
    const fetchFeed = vi.fn(async () => release({ tag_name: 'v1.0.0' }));

    const result = await checkForUpdate('1.0.0', fetchFeed);

    expect(result).toEqual({ update: false });
  });

  it('reports no update when the feed version is older than the current version', async () => {
    const fetchFeed = vi.fn(async () => release({ tag_name: 'v0.9.0' }));

    const result = await checkForUpdate('1.0.0', fetchFeed);

    expect(result).toEqual({ update: false });
  });

  it('reports no update when the feed tag is unparseable', async () => {
    const fetchFeed = vi.fn(async () => release({ tag_name: 'not-a-version' }));

    const result = await checkForUpdate('1.0.0', fetchFeed);

    expect(result).toEqual({ update: false });
  });

  it('reports no update when the current version is unparseable', async () => {
    const fetchFeed = vi.fn(async () => release());

    const result = await checkForUpdate('not-a-semver', fetchFeed);

    expect(result).toEqual({ update: false });
  });

  it('reports no update when the feed fetch rejects', async () => {
    const fetchFeed = vi.fn(async () => {
      throw new Error('network down');
    });

    const result = await checkForUpdate('1.0.0', fetchFeed);

    expect(result).toEqual({ update: false });
  });

  it('reports no update when the feed body is malformed JSON shape', async () => {
    const fetchFeed = vi.fn(async () => 'not an object');

    const result = await checkForUpdate('1.0.0', fetchFeed);

    expect(result).toEqual({ update: false });
  });
});
