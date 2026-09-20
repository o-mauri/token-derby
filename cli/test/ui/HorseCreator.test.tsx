import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { HorseCreator } from '../../src/ui/HorseCreator.js';
import { defaultColors, PALETTES } from '../../src/ui/palette.js';

// Flush React effects and state updates (effects register via setTimeout in Ink's reconciler)
function tick() { return new Promise<void>(resolve => setTimeout(resolve, 0)); }

// Ink wires a newly mounted TextInput's key handler one effect flush after the
// frame already shows the prompt, so a keystroke sent too early is dropped
// silently. Retry until the keystroke actually takes effect; a landed write is
// reflected in the frame synchronously, so this never types twice.
async function writeUntil(
  stdin: { write: (data: string) => void },
  data: string,
  landed: () => boolean,
): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (landed()) return;
    stdin.write(data);
    if (landed()) return;
    await tick();
  }
  throw new Error(`keystroke ${JSON.stringify(data)} never took effect`);
}

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
    const { stdin, lastFrame } = render(<HorseCreator onSubmit={onSubmit} onCancel={() => {}} />);
    await tick();
    stdin.write('\x1B[C'); // right — body advances
    await tick();
    stdin.write('\r');       // enter — go to name prompt
    await tick();
    await writeUntil(stdin, 'Gary', () => !!lastFrame()?.includes('Gary'));
    await writeUntil(stdin, '\r', () => onSubmit.mock.calls.length > 0);
    expect(onSubmit).toHaveBeenCalledOnce();
    const [name, colors] = onSubmit.mock.calls[0]!;
    expect(name).toBe('Gary');
    expect(colors.body).toBe(PALETTES.body[1]);
    expect(colors.mane).toBe(defaultColors().mane);
  });

  it('Left arrow at index 0 wraps to the last palette entry', async () => {
    const onSubmit = vi.fn();
    const { stdin, lastFrame } = render(<HorseCreator onSubmit={onSubmit} onCancel={() => {}} />);
    await tick();
    stdin.write('\x1B[D'); // left
    await tick();
    stdin.write('\r');
    await tick();
    await writeUntil(stdin, 'X', () => !!lastFrame()?.includes('X'));
    await writeUntil(stdin, '\r', () => onSubmit.mock.calls.length > 0);
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
    // submit name (already filled)
    await writeUntil(stdin, '\r', () => onSubmit.mock.calls.length > 0);
    expect(onSubmit).toHaveBeenCalledWith('Pony', initial);
  });

  it('with lockName, Enter submits immediately with the seeded name and no naming prompt', async () => {
    const initial = { ...defaultColors(), body: PALETTES.body[2]! };
    const onSubmit = vi.fn();
    const { stdin, lastFrame } = render(
      <HorseCreator
        onSubmit={onSubmit}
        onCancel={() => {}}
        initialColors={initial}
        initialName="Gary"
        lockName
      />,
    );
    await tick();
    stdin.write('\x1B[C'); // right — body advances one
    await tick();
    stdin.write('\r');     // enter — should submit directly, not enter naming mode
    await tick();
    expect(lastFrame()).not.toContain('Name your horse');
    expect(onSubmit).toHaveBeenCalledOnce();
    const [name, colors] = onSubmit.mock.calls[0]!;
    expect(name).toBe('Gary');
    expect(colors.body).toBe(PALETTES.body[3]);
  });

  it('rejects empty name on submit', async () => {
    const onSubmit = vi.fn();
    const { stdin, lastFrame } = render(<HorseCreator onSubmit={onSubmit} onCancel={() => {}} />);
    await tick();
    stdin.write('\r');      // accept colors
    await tick();
    // submit empty — the prompt rejects it rather than calling onSubmit
    await writeUntil(stdin, '\r', () => !!lastFrame()?.includes('Name required'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(lastFrame()).toContain('Name required');
  });
});
