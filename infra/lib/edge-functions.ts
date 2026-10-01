/** Prepends /api at viewer-request so api.<domain>/races reaches the gateway's
 *  /api/races route, and the legacy /api/* proxy keeps working unchanged. */
export const API_PREFIX_CODE = `
function handler(event) {
  event.request.uri = '/api' + event.request.uri;
  return event.request;
}
`.trim();

/** A 301 to the same path and query on `host`, answered at the edge so the
 *  origin is never consulted. */
export function redirectCode(host: string): string {
  return `
function handler(event) {
  var req = event.request;
  var parts = [];
  for (var key in req.querystring) {
    var entry = req.querystring[key];
    var values = entry.multiValue ? entry.multiValue : [entry];
    for (var i = 0; i < values.length; i++) {
      parts.push(values[i].value === '' ? key : key + '=' + values[i].value);
    }
  }
  var qs = parts.length ? '?' + parts.join('&') : '';
  return {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: { location: { value: 'https://${host}' + req.uri + qs } },
  };
}
`.trim();
}
