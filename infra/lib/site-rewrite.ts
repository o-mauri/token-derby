/**
 * The app site's viewer-request function: the SPA deep-link rewrite (see spa-rewrite.ts), plus the v2 opt-in.
 * A `td_site=v2` cookie serves app routes the v2 index (/v2/index.html), whose build loads its files from /v2/;
 * the TV view always stays v1. Files are never rewritten, so each build's pages load their own assets.
 */
export const SITE_REWRITE_CODE = `
function handler(event) {
  var req = event.request;
  var uri = req.uri;
  if (uri.indexOf('.') !== -1) return req;
  var site = req.cookies && req.cookies.td_site;
  var v2 = !!site && site.value === 'v2' && !/^\\/org\\/[^\\/]+\\/live\\/?$/.test(uri);
  req.uri = v2 ? '/v2/index.html' : '/index.html';
  return req;
}
`.trim();
