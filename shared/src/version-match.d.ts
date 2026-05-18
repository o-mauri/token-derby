export type ParsedSemver = {
    major: number;
    minor: number;
    patch: number;
};
export declare function parseSemver(v: string | undefined | null): ParsedSemver | null;
export declare function minorMatches(a: string | undefined | null, b: string | undefined | null): boolean;
/**
 * Returns true when `a` is the same as or newer than `b` by semver MAJOR.MINOR.PATCH.
 * Returns false if either side is unparseable.
 */
export declare function gteSemver(a: string | undefined | null, b: string | undefined | null): boolean;
