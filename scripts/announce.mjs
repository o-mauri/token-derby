#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { findChangelogEntry } from './release-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_API_BASE = 'https://token-derby.mauricode.co.uk/api';

function loadDotEnv() {
  const p = resolve(ROOT, '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function postJson(url, body, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

/**
 * Announces an already-released version. The changelog is the source of truth
 * for the bullets and the date, so a retry never re-types or re-dates anything.
 */
export async function announce(component, version) {
  loadDotEnv();
  const missing = ['ADMIN_USERNAME', 'ADMIN_PASSWORD'].filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`missing ${missing.join(', ')} — set them in the root .env`);
  }
  const base = (process.env.TOKEN_DERBY_API_BASE ?? DEFAULT_API_BASE).replace(/\/$/, '');

  const changelog = JSON.parse(readFileSync(resolve(ROOT, 'site/src/changelog.json'), 'utf8'));
  const entry = findChangelogEntry(changelog, component, version);

  const { token } = await postJson(`${base}/admin/login`, {
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD,
  });
  if (!token) throw new Error('admin login returned no token');

  return postJson(`${base}/admin/releases`, {
    component,
    version,
    date: entry.date,
    changes: entry.changes,
  }, token);
}

// Standalone invocation exits non-zero on failure; importing does not.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [component, version] = process.argv.slice(2);
  if ((component !== 'cli' && component !== 'site') || !version) {
    console.error('usage: announce.mjs <cli|site> <x.y.z>');
    process.exit(1);
  }
  try {
    const res = await announce(component, version);
    if (res.announced) console.log(`✓ announced ${component} v${version} to ${res.orgs_notified} org(s).`);
    else console.log(`• ${component} v${version} was already announced — nothing posted.`);
  } catch (e) {
    console.error(`✗ announcement failed: ${e.message}`);
    process.exit(1);
  }
}
