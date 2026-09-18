import { describe, it, expect, vi } from 'vitest';
import { confirmNoSources, type SourceProbe } from '../../src/tokens/source-probe.js';

const probe = (key: SourceProbe['key'], transcripts: number): SourceProbe =>
  ({ key, dir: `/${key}`, exists: transcripts > 0, projects: 0, transcripts });

const none: SourceProbe[] = [probe('claude', 0), probe('codex', 0), probe('gemini', 0)];

describe('confirmNoSources', () => {
  it('proceeds silently when any one source has transcripts', async () => {
    const warn = vi.fn();
    const ask = vi.fn();
    const probes = [probe('claude', 0), probe('codex', 3), probe('gemini', 0)];
    await expect(confirmNoSources({ probes, interactive: true, warn, ask })).resolves.toBe(true);
    expect(warn).not.toHaveBeenCalled();
    expect(ask).not.toHaveBeenCalled();
  });

  it('warns and proceeds when the player confirms', async () => {
    const warn = vi.fn();
    const ask = vi.fn(async () => true);
    await expect(confirmNoSources({ probes: none, interactive: true, warn, ask })).resolves.toBe(true);
    expect(warn).toHaveBeenCalledOnce();
    // every source's directory is named, so the player knows where it looked
    expect(warn.mock.calls[0]![0]).toContain('/claude');
    expect(warn.mock.calls[0]![0]).toContain('/codex');
    expect(warn.mock.calls[0]![0]).toContain('/gemini');
  });

  it('aborts the join when the player declines', async () => {
    const warn = vi.fn();
    const ask = vi.fn(async () => false);
    await expect(confirmNoSources({ probes: none, interactive: true, warn, ask })).resolves.toBe(false);
  });

  it('warns but never blocks a non-interactive join, which has nobody to answer', async () => {
    const warn = vi.fn();
    const ask = vi.fn();
    await expect(confirmNoSources({ probes: none, interactive: false, warn, ask })).resolves.toBe(true);
    expect(warn).toHaveBeenCalledOnce();
    expect(ask).not.toHaveBeenCalled();
  });
});
