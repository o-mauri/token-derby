import { expect } from '@playwright/test';
import { fakeApi, test, type Routes } from './support/fake-api';
import { PREVIEW_JOIN_CODE, PREVIEW_ORG, accountRoutes, memberOrgRoutes, myOrgs, orgRoutes, raceRoutes, settingsRoutes } from './support/fixtures';
import { signIn } from './support/session';

/** `knownIssue` keeps a failing case visible in every report until the page is fixed. */
type Case = { path: string; routes: Routes; signedIn?: boolean; mayScroll?: boolean; knownIssue?: string };

const CASES: Case[] = [
  { path: '/', routes: {} },
  { path: '/', routes: { ...myOrgs(), ...memberOrgRoutes() }, signedIn: true },
  { path: `/org/${PREVIEW_ORG}`, routes: orgRoutes(), knownIssue: 'the dashboard grid is ~60px taller than a 1366×768 window' },
  { path: `/org/${PREVIEW_ORG}/races`, routes: orgRoutes() },
  { path: `/org/${PREVIEW_ORG}/league`, routes: orgRoutes() },
  { path: `/race/${PREVIEW_JOIN_CODE}`, routes: raceRoutes('finished'), mayScroll: true },
  { path: '/catalog', routes: {} },
  { path: '/about', routes: {} },
  { path: '/privacy', routes: {} },
  { path: '/account', routes: accountRoutes(), signedIn: true },
  { path: '/account/devices', routes: accountRoutes(), signedIn: true },
  { path: `/org/${PREVIEW_ORG}/settings`, routes: settingsRoutes(true), signedIn: true },
  { path: `/org/${PREVIEW_ORG}/settings/racing`, routes: settingsRoutes(true), signedIn: true },
  { path: '/cli', routes: {}, signedIn: true },
];

for (const c of CASES) {
  test(`${c.path}${c.signedIn ? ' (signed in)' : ''} fits the screen`, async ({ page, isMobile }, info) => {
    test.fixme(!!c.knownIssue && !isMobile, c.knownIssue);
    if (c.signedIn) await signIn(page);
    await fakeApi(page, c.routes);
    await page.goto(c.path);
    await expect(page.locator('[data-page]').first()).toBeVisible();
    await expect(page.locator('td-loader')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate(() => ({
      innerWidth, innerHeight,
      scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
    }));
    const width = info.project.use.viewport?.width;
    // On phones the viewport itself grows if anything is too wide, so pin it to the device width too.
    if (isMobile) expect(m.innerWidth, 'viewport stays at device width').toBe(width);
    expect(m.scrollWidth, 'no sideways scroll').toBeLessThanOrEqual(m.innerWidth);
    if (!isMobile && !c.mayScroll) expect(m.scrollHeight, 'no page scroll on desktop').toBeLessThanOrEqual(m.innerHeight);
  });
}
