// Dev-only. Maps API paths to the real Lambda handlers over plain node:http so
// the Google redirect has somewhere to land that is not production.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { DynamoDBClient, CreateTableCommand, ResourceInUseException } from '@aws-sdk/client-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { tableSchema } from '../api/test/table-schema.js';

const PORT = Number(process.env.PORT ?? 3000);
const TABLE = process.env.TABLE_NAME ?? 'token-derby-local';

process.env.DYNAMODB_ENDPOINT ??= 'http://localhost:8000';
process.env.AWS_REGION ??= 'local';
process.env.AWS_ACCESS_KEY_ID ??= 'fake';
process.env.AWS_SECRET_ACCESS_KEY ??= 'fake';
process.env.TABLE_NAME = TABLE;

// Auth config comes from the environment locally, so no AWS credentials are needed.
for (const k of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'AUTH_STATE_SECRET'] as const) {
  if (!process.env[k]) console.warn(`warning: ${k} is not set — /api/auth/* will fail`);
}

type Route = { method: string; pattern: string; load: () => Promise<{ handler: Function }> };

const ROUTES: Route[] = [
  { method: 'GET',  pattern: '/api/auth/google/start',    load: () => import('../api/src/handlers/auth-google-start.js') },
  { method: 'POST', pattern: '/api/auth/link/start',      load: () => import('../api/src/handlers/auth-link-start.js') },
  { method: 'GET',  pattern: '/api/auth/google/callback', load: () => import('../api/src/handlers/auth-google-callback.js') },
  { method: 'POST', pattern: '/api/web-sessions/exchange',load: () => import('../api/src/handlers/exchange-web-session.js') },
  { method: 'GET',  pattern: '/api/organisations',        load: () => import('../api/src/handlers/list-organisations.js') },
  { method: 'GET',  pattern: '/api/organisations/{org_name}', load: () => import('../api/src/handlers/get-organisation.js') },
  { method: 'GET',  pattern: '/api/organisations/{org_name}/members', load: () => import('../api/src/handlers/list-org-members.js') },
  // Needed to exercise the migration path: an existing CLI jockey created by
  // `init`, then `web` to reach the org manager as that same jockey — which is
  // how a legacy user obtains a web session before linking.
  { method: 'POST', pattern: '/api/jockey/init',          load: () => import('../api/src/handlers/init-jockey.js') },
  { method: 'POST', pattern: '/api/web-sessions',         load: () => import('../api/src/handlers/create-web-session.js') },
  // `token-derby link` reads this to check whether the account is already linked,
  // and polls it to detect that the browser leg finished.
  { method: 'GET',  pattern: '/api/jockey/me',            load: () => import('../api/src/handlers/get-jockey.js') },
  // Phase 2 device flow. `token-derby login` needs start/poll; the /cli page needs
  // approve, which requires a web session from the Google sign-in above.
  { method: 'POST', pattern: '/api/auth/cli/start',       load: () => import('../api/src/handlers/auth-cli-start.js') },
  { method: 'POST', pattern: '/api/auth/cli/approve',     load: () => import('../api/src/handlers/auth-cli-approve.js') },
  { method: 'POST', pattern: '/api/auth/cli/poll',        load: () => import('../api/src/handlers/auth-cli-poll.js') },
  { method: 'GET',  pattern: '/api/devices',              load: () => import('../api/src/handlers/list-devices.js') },
  // ORDER MATTERS HERE, unlike in production. match() returns the first hit, so
  // `me` must precede `{device_id}` or logout would delete nothing locally.
  // API Gateway prefers a static segment regardless of declaration order.
  { method: 'DELETE', pattern: '/api/devices/me',         load: () => import('../api/src/handlers/logout-device.js') },
  { method: 'DELETE', pattern: '/api/devices/{device_id}', load: () => import('../api/src/handlers/revoke-device.js') },
];

function match(pattern: string, pathname: string): Record<string, string> | null {
  const p = pattern.split('/'), a = pathname.split('/');
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    const seg = p[i]!;
    if (seg.startsWith('{') && seg.endsWith('}')) params[seg.slice(1, -1)] = decodeURIComponent(a[i]!);
    else if (seg !== a[i]) return null;
  }
  return params;
}

async function ensureTable() {
  const client = new DynamoDBClient({
    endpoint: process.env.DYNAMODB_ENDPOINT, region: 'local',
    credentials: { accessKeyId: 'fake', secretAccessKey: 'fake' },
  });
  try { await client.send(new CreateTableCommand(tableSchema(TABLE))); console.log(`created table ${TABLE}`); }
  catch (e) { if (!(e instanceof ResourceInUseException)) throw e; console.log(`table ${TABLE} already exists`); }
}

const SITE_DIR = path.resolve('site/dist');

// Wrapped in an IIFE, not top-level await: this file loads as CommonJS
// under tsx (no "type": "module" at the repo root).
void (async () => {
await ensureTable();

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (url.pathname.startsWith('/api/')) {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks).toString('utf8');

    for (const route of ROUTES) {
      if (route.method !== req.method) continue;
      const params = match(route.pattern, url.pathname);
      if (!params) continue;

      const event = {
        version: '2.0', routeKey: `${route.method} ${route.pattern}`,
        rawPath: url.pathname, rawQueryString: url.search.slice(1),
        headers: { ...req.headers, host: `localhost:${PORT}` } as Record<string, string>,
        // API Gateway v2 splits Cookie into its own array; mirror that here.
        cookies: (req.headers.cookie ?? '').split(';').map((c) => c.trim()).filter(Boolean),
        queryStringParameters: Object.fromEntries(url.searchParams),
        pathParameters: params,
        body: body || undefined,
        requestContext: { domainName: `localhost:${PORT}` },
        isBase64Encoded: false,
      } as unknown as APIGatewayProxyEventV2;

      const { handler } = await route.load();
      const out: any = await handler(event);
      const outHeaders: Record<string, string | string[]> = { ...(out.headers ?? {}) };
      if (Array.isArray(out.cookies) && out.cookies.length) outHeaders['set-cookie'] = out.cookies;
      res.writeHead(out.statusCode ?? 200, outHeaders);
      res.end(out.body ?? '');
      console.log(`${req.method} ${url.pathname} -> ${out.statusCode}`);
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ code: 'NOT_FOUND', message: `no local route for ${req.method} ${url.pathname}` }));
    return;
  }

  // Serve the built site so /org-manager and the callback share an origin.
  const file = url.pathname === '/' || !path.extname(url.pathname)
    ? path.join(SITE_DIR, 'index.html')
    : path.join(SITE_DIR, url.pathname);
  try {
    const data = await readFile(file);
    const ext = path.extname(file);
    const type = ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : 'text/html';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(PORT, () => {
  console.log(`local api + site on http://localhost:${PORT}`);
  console.log(`sign-in:  http://localhost:${PORT}/api/auth/google/start`);
});
})();
