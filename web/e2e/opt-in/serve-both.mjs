// Serves v1 and v2 behind the real edge rewrite function, with a minimal fake API.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL(p, import.meta.url));
const V1 = root('../../../site/dist');
const V2 = root('../../dist/site/browser');
const PORT = Number(process.env.PORT ?? 4302);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

const source = readFileSync(root('../../../infra/lib/site-rewrite.ts'), 'utf8');
// The template literal after the export, not the backticks in the header comment.
const start = source.indexOf('`', source.indexOf('SITE_REWRITE_CODE')) + 1;
const code = source.slice(start, source.indexOf('`', start)).replaceAll('\\\\', '\\');
if (!code.includes('function handler')) throw new Error('site-rewrite.ts: handler not found in the extracted code');
const handler = new Function(`${code}; return handler;`)();

const json = (res, status, body) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
const STABLE = { horses: [] };
const DEVICES = { devices: [{ device_id: 'd1', label: 'omar-mbp', created_at: '2026-09-12T10:00:00Z', last_seen_at: '2026-10-06T11:58:00Z' }], has_legacy_credential: false };

function api(req, res, url) {
  const key = `${req.method} ${url.pathname}`;
  if (key === 'GET /api/auth/google/start') {
    res.writeHead(302, { location: `${url.searchParams.get('return_to')}#code=e2e` }).end();
  } else if (key === 'POST /api/web-sessions/exchange') {
    json(res, 200, { token: 'tok', expires_at: new Date(Date.now() + 6 * 86_400_000).toISOString(), user: { user_id: 'u1', display_name: 'Omar' } });
  } else if (key === 'GET /api/organisations') json(res, 200, { organisations: [] });
  else if (key === 'GET /api/stable') json(res, 200, STABLE);
  else if (key === 'GET /api/devices') json(res, 200, DEVICES);
  else if (key === 'GET /api/jockey/me') json(res, 200, { user_id: 'u1', display_name: 'Omar', created_at: '2026-05-14T10:00:00Z', email: 'omar@example.com' });
  else {
    console.log(`unmatched ${key}`);
    json(res, 404, { code: 'not_found', message: 'Not found' });
  }
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
  const cookies = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) cookies[part.slice(0, i).trim()] = { value: part.slice(i + 1).trim() };
  }
  const uri = handler({ request: { uri: url.pathname, cookies } }).uri;
  const v2 = uri.startsWith('/v2/');
  const base = v2 ? V2 : V1;
  let path;
  try { path = decodeURIComponent(v2 ? uri.slice(3) : uri); } catch { res.writeHead(400).end('Bad request'); return; }
  const file = normalize(join(base, path));
  if (!(file === base || file.startsWith(base + sep)) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end('Not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`both builds on http://localhost:${PORT}`));
