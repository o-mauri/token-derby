/**
 * The app site's viewer-request function: the SPA deep-link rewrite (see spa-rewrite.ts), plus the v2 opt-in.
 * A `td_site=v2` cookie serves the same path from the v2 build under /v2/; the TV view always stays v1.
 */
export const SITE_REWRITE_CODE = `
function handler(event) {
  var req = event.request;
  var uri = req.uri;
  var site = req.cookies && req.cookies.td_site;
  var v2 = !!site && site.value === 'v2' && !/^\\/org\\/[^\\/]+\\/live\\/?$/.test(uri);
  if (uri.indexOf('.') === -1) req.uri = v2 ? '/v2/index.html' : '/index.html';
  else if (v2) req.uri = '/v2' + uri;
  return req;
}
`.trim();
