import { describe, it, expect } from 'vitest';
import { API_PREFIX_CODE, redirectCode } from '../lib/edge-functions';

type Qs = Record<string, { value: string; multiValue?: { value: string }[] }>;
const load = (code: string) => new Function(`${code}; return handler;`)() as (event: any) => any;

describe('API prefix function', () => {
  const handler = load(API_PREFIX_CODE);

  it('prepends /api to the viewer path', () => {
    expect(handler({ request: { uri: '/races/ABC123' } }).uri).toBe('/api/races/ABC123');
    expect(handler({ request: { uri: '/' } }).uri).toBe('/api/');
  });
});

describe('redirect function', () => {
  const handler = load(redirectCode('app.tokenderby.co.uk'));
  const location = (uri: string, querystring: Qs = {}) => {
    const res = handler({ request: { uri, querystring } });
    expect(res.statusCode).toBe(301);
    return res.headers.location.value;
  };

  it('keeps the path', () => {
    expect(location('/race/ABC123')).toBe('https://app.tokenderby.co.uk/race/ABC123');
    expect(location('/')).toBe('https://app.tokenderby.co.uk/');
  });

  it('keeps the query string, including repeated and valueless keys', () => {
    expect(location('/org-manager', {
      auth_error: { value: 'expired' },
      tag: { value: 'a', multiValue: [{ value: 'a' }, { value: 'b' }] },
      flag: { value: '' },
    })).toBe('https://app.tokenderby.co.uk/org-manager?auth_error=expired&tag=a&tag=b&flag');
  });
});
