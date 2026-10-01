import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { promptYesNo } from '../../src/ui/prompt.js';

/** Drive promptYesNo with a scripted answer instead of the real terminal. */
async function answer(text: string, opts?: { defaultYes?: boolean }): Promise<boolean> {
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();
  const result = promptYesNo('Join anyway? ', { ...opts, input, output });
  input.write(`${text}\n`);
  return result;
}

describe('promptYesNo', () => {
  it('treats a bare Enter as yes by default, as every existing [Y/n] caller expects', async () => {
    await expect(answer('')).resolves.toBe(true);
  });

  it('treats a bare Enter as no when defaultYes is false', async () => {
    await expect(answer('', { defaultYes: false })).resolves.toBe(false);
  });

  it('accepts an explicit yes regardless of the default', async () => {
    await expect(answer('y', { defaultYes: false })).resolves.toBe(true);
    await expect(answer('yes', { defaultYes: false })).resolves.toBe(true);
  });

  it('accepts an explicit no regardless of the default', async () => {
    await expect(answer('n', { defaultYes: true })).resolves.toBe(false);
  });
});
