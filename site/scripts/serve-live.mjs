// Live-API demo server.
//
// Serves the built `dist/` exactly like `npx serve dist`, but proxies every
// `/api/*` request to the live deployment. Because the browser only ever talks
// to this local origin, the frontend's relative `/api/...` fetches hit the real
// API with no CORS dance and no rebuild — real-time polling works against a real
// race. Edit the frontend, `npm run build`, refresh, and you're watching live
// data with your local UI.
//
//   node scripts/serve-live.mjs            # http://localhost:5173
//   PORT=8080 node scripts/serve-live.mjs
//   API_ORIGIN=https://other.example node scripts/serve-live.mjs
//
// Then open e.g. http://localhost:5173/race/ABCD or /org/<name>/live

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');

const PORT = Number(process.env.PORT) || 5173;
const API_ORIGIN = (process.env.API_ORIGIN || 'https://token-derby.mauricode.co.uk').replace(/\/$/, '');

// Client-side routes that must fall back to index.html (mirrors dist/serve.json).
const SPA_ROUTES = [
  /^\/race\/[^/]+$/,
  /^\/org\/[^/]+$/,
  /^\/org\/[^/]+\/live$/,
  /^\/catalog$/,
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.map': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

async function proxyApi(req, res) {
  const target = API_ORIGIN + req.url;
  const headers = { ...req.headers };
  // Let fetch/the upstream set these; forwarding the local host header confuses CloudFront.
  delete headers.host;
  delete headers.connection;
  delete headers['content-length'];

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  let body;
  if (hasBody) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    body = Buffer.concat(chunks);
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    const outHeaders = {};
    upstream.headers.forEach((v, k) => {
      if (k === 'content-encoding' || k === 'transfer-encoding' || k === 'content-length') return;
      outHeaders[k] = v;
    });
    res.writeHead(upstream.status, outHeaders);
    res.end(buf);
  } catch (e) {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ code: 'PROXY_ERROR', message: String(e?.message ?? e) }));
  }
}

async function serveFile(filePath, res) {
  const data = await readFile(filePath);
  res.writeHead(200, {
    'content-type': MIME[extname(filePath)] || 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  res.end(data);
}

async function handle(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith('/api/')) return proxyApi(req, res);

  // Block path traversal.
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');

  // Try the literal file, then a clean-URL ".html" sibling (mirrors `serve`'s
  // behaviour so /preview-toasts resolves to preview-toasts.html), then a
  // directory index.
  const candidate = join(DIST, safe);
  if (candidate.startsWith(DIST)) {
    for (const p of [candidate, candidate + '.html', join(candidate, 'index.html')]) {
      try {
        if ((await stat(p)).isFile()) return await serveFile(p, res);
      } catch {}
    }
  }

  // SPA fallback for client routes (and bare "/").
  if (pathname === '/' || SPA_ROUTES.some((re) => re.test(pathname))) {
    return await serveFile(join(DIST, 'index.html'), res);
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('Not found');
}

createServer((req, res) => {
  handle(req, res).catch((e) => {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(String(e?.message ?? e));
  });
}).listen(PORT, () => {
  console.log(`\n  Token Derby — LIVE demo`);
  console.log(`  UI:  http://localhost:${PORT}`);
  console.log(`  API: ${API_ORIGIN}  (proxied at /api/*)\n`);
  console.log(`  Try:  http://localhost:${PORT}/race/<JOIN_CODE>`);
  console.log(`        http://localhost:${PORT}/org/<org>/live\n`);
});
