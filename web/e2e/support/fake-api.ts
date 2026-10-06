import { test as base, type Page } from '@playwright/test';

export type ApiRequest = { method: string; path: string; body: unknown };
export type Fake = { status?: number; body?: unknown; delayMs?: number };
/** Keyed by `METHOD /api/path` (query ignored unless the key has one). */
export type Routes = Record<string, Fake | ((req: ApiRequest) => Fake)>;
export type FakeApi = { requests: ApiRequest[]; unmatched: string[] };

const apis = new WeakMap<Page, FakeApi>();

/** Answers same-origin `/api/**` from `routes`; anything else 500s and is recorded in `unmatched`. */
export async function fakeApi(page: Page, routes: Routes): Promise<FakeApi> {
  const api: FakeApi = { requests: [], unmatched: [] };
  apis.set(page, api);
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    const call = { method, path: url.pathname, body };
    api.requests.push(call);
    const entry = routes[`${method} ${url.pathname}${url.search}`] ?? routes[`${method} ${url.pathname}`];
    if (!entry) {
      api.unmatched.push(`${method} ${url.pathname}`);
      await route.fulfill({ status: 500, json: { code: 'INTERNAL', message: `No fixture for ${method} ${url.pathname}` } });
      return;
    }
    const fake = typeof entry === 'function' ? entry(call) : entry;
    if (fake.delayMs) await new Promise((r) => setTimeout(r, fake.delayMs));
    const status = fake.status ?? 200;
    await route.fulfill(status === 204 ? { status } : { status, json: fake.body ?? {} });
  });
  return api;
}

/** Fails any test that hit an API path with no fixture or logged a console error. */
export const test = base.extend<{ guard: void }>({
  guard: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    // Web fonts load for real: the layout depends on VT323's narrow metrics.
    await use();
    const api = apis.get(page);
    if (api?.unmatched.length) throw new Error(`API calls with no fixture: ${api.unmatched.join(', ')}`);
    // Expected API failures surface as console errors from the browser's network log.
    const real = errors.filter((e) => !/Failed to load resource: the server responded with a status of (4|5)\d\d/.test(e));
    if (real.length) throw new Error(`Console errors:\n${real.join('\n')}`);
  }, { auto: true }],
});
