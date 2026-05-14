export type ParsedSemver = { major: number; minor: number; patch: number };

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

export function parseSemver(v: string | undefined | null): ParsedSemver | null {
  if (typeof v !== 'string') return null;
  const m = SEMVER_RE.exec(v.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
  };
}

export function minorMatches(a: string | undefined | null, b: string | undefined | null): boolean {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return false;
  return pa.major === pb.major && pa.minor === pb.minor;
}

/**
 * Returns true when `a` is the same as or newer than `b` by semver MAJOR.MINOR.PATCH.
 * Returns false if either side is unparseable.
 */
export function gteSemver(a: string | undefined | null, b: string | undefined | null): boolean {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return false;
  if (pa.major !== pb.major) return pa.major > pb.major;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor;
  return pa.patch >= pb.patch;
}
