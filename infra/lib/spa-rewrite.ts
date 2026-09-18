/**
 * SPA deep-link rewrite, run at viewer-request on the site behaviours only.
 *
 * Deliberately replaces a distribution-wide `errorResponses` 403/404 → 200
 * /index.html. That applied to /api/* too, so an API 404 reached clients as the
 * HTML shell instead of JSON. CloudFront has no per-behaviour error config, so
 * rewriting the path before the origin is consulted is what keeps the API's real
 * status codes intact.
 *
 * "Has a dot" stands in for "is a file". spa-rewrite.test.ts pins both ways that
 * proxy could go wrong: a site route gaining a dot, or a shipped asset losing
 * its extension.
 */
export const SPA_REWRITE_CODE = `
function handler(event) {
  var uri = event.request.uri;
  if (uri.indexOf('.') === -1) event.request.uri = '/index.html';
  return event.request;
}
`.trim();
