import { describe, it, expect } from 'vitest';
import { buildReleaseMessage } from '../../../src/lib/slack/messages.js';
import type { AnnounceReleaseRequest } from '@token-derby/shared';

const CLI: AnnounceReleaseRequest = {
  component: 'cli', version: '2.13.0', date: '2026-07-28',
  changes: ['stuck-CLI fixes for large usage folders', 'faster stable listing'],
};
const SITE: AnnounceReleaseRequest = {
  component: 'site', version: '0.12.2', date: '2026-07-28',
  changes: ['crowd animation jitter'],
};

const flat = (m: { blocks: any[] }) => JSON.stringify(m.blocks);

describe('buildReleaseMessage', () => {
  it('headers the CLI release with its version', () => {
    const m = buildReleaseMessage(CLI);
    expect(m.blocks[0]!.type).toBe('header');
    expect(m.blocks[0]!.text.text).toContain('CLI updated');
    expect(m.blocks[0]!.text.text).toContain('v2.13.0');
  });

  it('includes the @latest install line for cli only', () => {
    expect(flat(buildReleaseMessage(CLI))).toContain('npm i -g @mauricode/token-derby@latest');
    expect(flat(buildReleaseMessage(SITE))).not.toContain('npm i -g');
  });

  it('renders one bullet per change and formats the date', () => {
    const body = buildReleaseMessage(CLI).blocks[1]!.text.text;
    expect(body).toContain('•  stuck-CLI fixes for large usage folders');
    expect(body).toContain('•  faster stable listing');
    expect(body).toContain('28 Jul 2026');
  });

  it('never pings the channel', () => {
    expect(flat(buildReleaseMessage(CLI))).not.toContain('<!here>');
    expect(flat(buildReleaseMessage(SITE))).not.toContain('<!here>');
  });

  it('links the changelog and names the component in the fallback text', () => {
    expect(flat(buildReleaseMessage(SITE))).toContain('token-derby.mauricode.co.uk/about');
    expect(buildReleaseMessage(SITE).text).toBe('Token Derby Site v0.12.2 released');
    expect(buildReleaseMessage(CLI).text).toBe('Token Derby CLI v2.13.0 released');
  });
});
