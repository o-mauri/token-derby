/**
 * Marks the one read failure that legitimately means "0 tokens": the source's
 * history directory does not exist, because the player has never run that CLI.
 *
 * Every other failure — including an ENOENT from a dangling symlink deep inside
 * the tree — must reach the UI as a stall. An empty reading is indistinguishable
 * from an idle player, so a swallowed error scores 0 for a whole race in silence.
 */
export class SourceRootMissing extends Error {
  constructor(public readonly dir: string) {
    super(`No history directory at ${dir}`);
    this.name = 'SourceRootMissing';
  }
}

/** Run a source's root read, tagging an absent root so it can be told apart. */
export async function readRoot<T>(dir: string, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (e: any) {
    if (e?.code === 'ENOENT') throw new SourceRootMissing(dir);
    throw e;
  }
}
