export async function promptYesNo(question: string): Promise<boolean> {
  resetStdinAfterInk();
  const readline = await import('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(question)).trim().toLowerCase();
  rl.close();
  return a === '' || a === 'y' || a === 'yes';
}

/**
 * After an Ink mount unmounts, stdin is left in a state where readline
 * mis-behaves:
 *   1. Ink calls `stdin.unref()` in its raw-mode teardown, so with no
 *      other pending I/O the event loop exits as soon as we await
 *      readline's `question` — the prompt prints, the process drops to
 *      the shell, and the user never gets to answer.
 *   2. Ink may have buffered bytes its useInput didn't consume; those
 *      would auto-resolve readline's first read.
 * Reset to a known-clean, ref'd state before any readline prompt.
 */
export function resetStdinAfterInk(): void {
  if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
    process.stdin.setRawMode(false);
  }
  // Drain any buffered bytes the picker's useInput didn't consume.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  while (process.stdin.read() !== null) { /* discard */ }
  process.stdin.pause();
  // Re-ref stdin so readline's await actually keeps the process alive.
  process.stdin.ref();
}
