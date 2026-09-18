/**
 * Flag parsing shared by bin.ts and the commands it dispatches to, so
 * `--flag value` and `--flag=value` mean the same thing everywhere.
 */
export function parseFlag(args: string[], flag: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) return args[i + 1];
    const eq = `${flag}=`;
    if (args[i]?.startsWith(eq)) return args[i]!.slice(eq.length);
  }
  return undefined;
}

export function hasFlag(args: string[], flag: string): boolean {
  return args.some(a => a === flag || a.startsWith(`${flag}=`));
}
