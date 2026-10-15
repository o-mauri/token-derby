// Serves the production site build like CloudFront: real files as-is, app routes fall back to index.html.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.ROOT ? resolve(process.env.ROOT) : fileURLToPath(new URL('../dist/site/browser', import.meta.url));
const PORT = Number(process.env.PORT ?? 4300);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  const file = normalize(join(ROOT, path));
  const isFile = file.startsWith(ROOT) && existsSync(file) && statSync(file).isFile();
  // Only extension-less paths are app routes; a missing asset must 404 so a broken build shows.
  if (!isFile && extname(path)) { res.writeHead(404).end('Not found'); return; }
  const target = isFile ? file : join(ROOT, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(target)] ?? 'application/octet-stream' });
  createReadStream(target).pipe(res);
}).listen(PORT, () => console.log(`site build on http://localhost:${PORT}`));
