import { describe, it, expect, vi } from 'vitest';
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { spriteKey, ensureSprite } from '../../../src/lib/slack/sprite-store.js';

const COLORS = { body: '#FF0000', mane: '#000000', tail: '#000000', saddle: '#CC0000' };

function fakeClient(headBehaviour: 'hit' | 'miss') {
  const sends: any[] = [];
  const client: any = {
    config: { region: async () => 'eu-west-2' },
    send: vi.fn(async (cmd: any) => {
      sends.push(cmd);
      if (cmd instanceof HeadObjectCommand) {
        if (headBehaviour === 'hit') return {};
        const e: any = new Error('not found');
        e.$metadata = { httpStatusCode: 404 };
        throw e;
      }
      return {};
    }),
  };
  return { client, sends };
}

describe('spriteKey', () => {
  it('is deterministic and case-insensitive on colours', () => {
    expect(spriteKey(COLORS)).toBe(spriteKey({ ...COLORS, body: '#ff0000' }));
    expect(spriteKey(COLORS)).toMatch(/^winners\/[0-9a-f]{40}\.png$/);
  });
});

describe('ensureSprite', () => {
  it('returns the URL without uploading when the object exists', async () => {
    const { client, sends } = fakeClient('hit');
    const url = await ensureSprite(client, 'my-bucket', COLORS);
    expect(url).toBe(`https://my-bucket.s3.eu-west-2.amazonaws.com/${spriteKey(COLORS)}`);
    expect(sends.some((c) => c instanceof PutObjectCommand)).toBe(false);
  });

  it('uploads a PNG when the object is missing (404)', async () => {
    const { client, sends } = fakeClient('miss');
    await ensureSprite(client, 'my-bucket', COLORS);
    const put = sends.find((c) => c instanceof PutObjectCommand);
    expect(put).toBeTruthy();
    expect(put!.input.ContentType).toBe('image/png');
  });
});
