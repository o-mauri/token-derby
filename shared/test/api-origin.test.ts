import { describe, it, expect } from 'vitest';
import { apiUrl } from '../src/api-origin.js';

describe('apiUrl', () => {
  it('sends API calls from the production hosts to api. without the prefix', () => {
    expect(apiUrl('/api/races/ABC123', 'app.tokenderby.co.uk')).toBe('https://api.tokenderby.co.uk/races/ABC123');
    expect(apiUrl('/api/admin/users', 'admin.tokenderby.co.uk')).toBe('https://api.tokenderby.co.uk/admin/users');
  });

  it('keeps the Google auth flow on the page origin', () => {
    expect(apiUrl('/api/auth/link/start', 'app.tokenderby.co.uk')).toBe('/api/auth/link/start');
  });

  it('stays same-origin off the production hosts', () => {
    expect(apiUrl('/api/races/ABC123', 'localhost')).toBe('/api/races/ABC123');
    expect(apiUrl('/api/races/ABC123', '')).toBe('/api/races/ABC123');
    expect(apiUrl('/api/races/ABC123', 'eviltokenderby.co.uk')).toBe('/api/races/ABC123');
  });
});
