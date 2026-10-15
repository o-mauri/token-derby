/** Newer CLIs open `/#code=`; v1 finishes that sign-in on the org manager, so forward it there. */
export function handOffSignIn(loc: Location, replace: (url: string) => void): boolean {
  if (loc.pathname !== '/' || !/^#code=/.test(loc.hash)) return false;
  replace(`/org-manager${loc.hash}`);
  return true;
}
