import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { HorseCreator } from '../../src/ui/HorseCreator.js';
import { defaultColors, PALETTES } from '../../src/ui/palette.js';

// Flush React effects and state updates (effects register via setTimeout in Ink's reconciler)
function tick() { return new Promise<void>(resolve => setTimeout(resolve, 0)); }

describe('HorseCreator', () => {
  it('renders the four slot rows with the body slot selected', async () => {
    const { lastFrame } = render(<HorseCreator onSubmit={() => {}} onCancel={() => {}} />);
    await tick();
    const out = lastFrame();
    expect(out).toContain('body');
    expect(out).toContain('mane');
    expect(out).toContain('tail');
    expect(out).toContain('saddle');
    expect(out).toMatch(/►\s*body/);
  });

  it('Down arrow moves selection to the next slot', async () => {
    const { lastFrame, stdin } = render(<HorseCreator onSubmit={() => {}} onCancel={() => {}} />);
    await tick();
    stdin.write('\x1B[B'); // down arrow
    await tick();
    expect(lastFrame()).toMatch(/►\s*mane/);
  });

  it('Up arrow at the top wraps to saddle', async () => {
    const { lastFrame, stdin } = render(<HorseCreator onSubmit={() => {}} onCancel={() => {}} />);
    await tick();
    stdin.write('\x1B[A'); // up
    await tick();
    expect(lastFrame()).toMatch(/►\s*saddle/);
  });

  it('Right arrow advances the selected slot to the next palette color', async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(<HorseCreator onSubmit={onSubmit} onCancel={() => {}} />);
    await tick();
    stdin.write('\x1B[C'); // right — body advances
    await tick();
    stdin.write('\r');       // enter — go to name prompt
    await tick();
    stdin.write('Gary');
    await tick();
    stdin.write('\r');       // submit
    await tick();
    expect(onSubmit).toHaveBeenCalledOnce();
    const [name, colors] = onSubmit.mock.calls[0]!;
    expect(name).toBe('Gary');
    expect(colors.body).toBe(PALETTES.body[1]);
    expect(colors.mane).toBe(defaultColors().mane);
  });

  it('Left arrow at index 0 wraps to the last palette entry', async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(<HorseCreator onSubmit={onSubmit} onCancel={() => {}} />);
    await tick();
    stdin.write('\x1B[D'); // left
    await tick();
    stdin.write('\r');
    await tick();
    stdin.write('X');
    await tick();
    stdin.write('\r');
    await tick();
    const [, colors] = onSubmit.mock.calls[0]!;
    expect(colors.body).toBe(PALETTES.body[PALETTES.body.length - 1]);
  });

  it('Esc cancels without submitting', async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const { stdin } = render(<HorseCreator onSubmit={onSubmit} onCancel={onCancel} />);
    await tick();
    stdin.write('\x1B'); // ESC
    await tick();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('seeds with provided initial values when given', async () => {
    const initial = { ...defaultColors(), body: PALETTES.body[3]! };
    const onSubmit = vi.fn();
    const { stdin } = render(
      <HorseCreator onSubmit={onSubmit} onCancel={() => {}} initialColors={initial} initialName="Pony" />,
    );
    await tick();
    stdin.write('\r');     // accept
    await tick();
    stdin.write('\r');     // submit name (already filled)
    await tick();
    expect(onSubmit).toHaveBeenCalledWith('Pony', initial);
  });

  it('rejects empty name on submit', async () => {
    const onSubmit = vi.fn();
    const { stdin, lastFrame } = render(<HorseCreator onSubmit={onSubmit} onCancel={() => {}} />);
    await tick();
    stdin.write('\r');      // accept colors
    await tick();
    stdin.write('\r');      // submit empty
    await tick();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(lastFrame()).toContain('Name required');
  });
});
