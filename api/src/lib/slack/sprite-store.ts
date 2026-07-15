import { createHash } from 'node:crypto';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { renderHorsePng } from './sprite-png.js';
import type { HorseColors } from '@token-derby/shared';

export function spriteKey(colors: HorseColors): string {
  const canonical = JSON.stringify({
    body:   colors.body.toLowerCase(),
    mane:   colors.mane.toLowerCase(),
    tail:   colors.tail.toLowerCase(),
    saddle: colors.saddle.toLowerCase(),
  });
  const hash = createHash('sha1').update(canonical).digest('hex');
  return `winners/${hash}.png`;
}

export async function ensureSprite(
  client: S3Client,
  bucket: string,
  colors: HorseColors,
): Promise<string> {
  const key = spriteKey(colors);
  const region = (await client.config.region()) ?? 'eu-west-2';
  const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return url;
  } catch (err: any) {
    const status = err?.$metadata?.httpStatusCode;
    // S3 returns 403 instead of 404 for missing objects when the caller lacks
    // s3:ListBucket; treat both as "not present, go ahead and PUT".
    if (status !== 404 && status !== 403) throw err;
  }

  const body = renderHorsePng(colors);
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: 'image/png',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return url;
}
