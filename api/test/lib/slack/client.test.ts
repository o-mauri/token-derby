import { describe, it, expect, vi, afterEach } from 'vitest';
import { postSlackMessage } from '../../../src/lib/slack/client.js';

afterEach(() => vi.restoreAllMocks());

describe('postSlackMessage', () => {
  it('posts to chat.postMessage and returns ok on success', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await postSlackMessage('xoxb-1', 'C1', 'hi', []);
    expect(res.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/chat.postMessage');
    expect((init as any).headers.authorization).toBe('Bearer xoxb-1');
  });

  it('surfaces a slack error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'channel_not_found' }), { status: 200 })));
    const res = await postSlackMessage('xoxb-1', 'C1', 'hi', []);
    expect(res).toEqual({ ok: false, error: 'channel_not_found' });
  });

  it('returns a timeout result when the request is aborted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const err = new DOMException('The operation was aborted.', 'AbortError');
        throw err;
      }),
    );
    const res = await postSlackMessage('xoxb-1', 'C1', 'hi', []);
    expect(res).toEqual({ ok: false, error: 'timeout' });
  });
});
