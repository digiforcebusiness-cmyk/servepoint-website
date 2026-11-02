#!/usr/bin/env node
// Read-only Google Search Console export. No dependencies: signs the service
// account JWT with node:crypto and calls the REST API directly.
//
//   node scripts/gsc-export.mjs --check            test access, list properties
//   node scripts/gsc-export.mjs                    export the last finished month
//   node scripts/gsc-export.mjs --month 2026-10    export a specific month
//   ...add --property sc-domain:example.com to override property detection
//
// Key file: $GSC_KEY_FILE, else ~/.config/servepoint-seo/gsc-service-account.json
// Keep the key outside this repo. Output goes to seo-data/<month>/, which is
// excluded from git and from Vercel deploys.

import { createSign } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_KEY = join(homedir(), '.config', 'servepoint-seo', 'gsc-service-account.json');
const SITE_MATCH = 'servepointpos.com';
const API = 'https://www.googleapis.com/webmasters/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const PAGE_SIZE = 25000;
const DAY_MS = 86400000;
const FINAL_DATA_LAG_DAYS = 3;

const REPORTS = {
  queries: ['query'],
  pages: ['page'],
  'query-pages': ['query', 'page'],
  countries: ['country'],
  devices: ['device'],
  dates: ['date'],
};

function fail(message) {
  console.error(`\nError: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { check: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--check') args.check = true;
    else if (argv[i] === '--month') args.month = argv[(i += 1)];
    else if (argv[i] === '--property') args.property = argv[(i += 1)];
    else fail(`Unknown argument: ${argv[i]}`);
  }
  if (args.month !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(args.month)) {
    fail('--month must look like 2026-10');
  }
  return args;
}

async function loadKey() {
  const path = process.env.GSC_KEY_FILE || DEFAULT_KEY;
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    fail(`No service account key at ${path}\nDownload the JSON key from Google Cloud and save it there.`);
  }
  let key;
  try {
    key = JSON.parse(raw);
  } catch {
    fail(`${path} is not valid JSON.`);
  }
  if (!key.client_email || !key.private_key) {
    fail(`${path} is not a service account key (client_email or private_key is missing).`);
  }
  return key;
}

async function getToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: key.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url');

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    fail(`Google refused the key (${response.status}): ${body.error_description || body.error || 'no details'}`);
  }
  return body.access_token;
}

async function api(token, path, body) {
  const response = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.error?.message || 'no details';
    if (response.status === 403 && /not been used|is disabled/i.test(detail)) {
      fail(`The Search Console API is not enabled on this Google Cloud project.\n${detail}`);
    }
    fail(`Search Console API ${response.status} on ${path}: ${detail}`);
  }
  return data;
}

function chooseProperty(sites, requested, clientEmail) {
  if (sites.length === 0) {
    fail(`This service account cannot see any property yet.\nAdd ${clientEmail} in Search Console > Settings > Users and permissions.`);
  }
  if (requested) {
    if (!sites.some((site) => site.siteUrl === requested)) fail(`No access to ${requested}.`);
    return requested;
  }
  const matches = sites.map((site) => site.siteUrl).filter((url) => url.includes(SITE_MATCH));
  const property = matches.find((url) => url.startsWith('sc-domain:')) || matches[0];
  if (!property) fail(`No ${SITE_MATCH} property found. Pass one with --property.`);
  return property;
}

function lastFinishedMonth(now) {
  const settled = new Date(now.getTime() - FINAL_DATA_LAG_DAYS * DAY_MS);
  return new Date(Date.UTC(settled.getUTCFullYear(), settled.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
}

function monthRange(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    startDate: `${month}-01`,
    endDate: new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10),
  };
}

function flattenRow(row, dimensions) {
  const flat = {};
  dimensions.forEach((dimension, index) => {
    flat[dimension] = row.keys[index];
  });
  return {
    ...flat,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Number(row.ctr.toFixed(4)),
    position: Number(row.position.toFixed(1)),
  };
}

async function queryAll(token, sitePath, range, dimensions) {
  const rows = [];
  for (let startRow = 0; ; startRow += PAGE_SIZE) {
    const page = await api(token, `/sites/${sitePath}/searchAnalytics/query`, {
      ...range,
      dimensions,
      type: 'web',
      rowLimit: PAGE_SIZE,
      startRow,
    });
    const batch = page.rows || [];
    rows.push(...batch.map((row) => flattenRow(row, dimensions)));
    if (batch.length < PAGE_SIZE) return rows;
  }
}

async function exportMonth(token, property, month) {
  const sitePath = encodeURIComponent(property);
  const range = monthRange(month);
  const outDir = join(ROOT, 'seo-data', month);
  await mkdir(outDir, { recursive: true });
  const save = (name, value) => writeFile(join(outDir, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);

  const settledAt = new Date(`${range.endDate}T00:00:00Z`).getTime() + (FINAL_DATA_LAG_DAYS + 1) * DAY_MS;
  const complete = Date.now() >= settledAt;
  if (!complete) console.warn(`Warning: ${month} is not final yet, so its last days may be missing.`);

  // Totals need their own query: rows leave out anonymized low-volume searches.
  const totals = (await api(token, `/sites/${sitePath}/searchAnalytics/query`, { ...range, type: 'web' })).rows?.[0];

  const rowCounts = {};
  for (const [name, dimensions] of Object.entries(REPORTS)) {
    const rows = await queryAll(token, sitePath, range, dimensions);
    await save(name, rows);
    rowCounts[name] = rows.length;
    console.log(`  ${name}: ${rows.length} rows`);
  }

  await save('sitemaps', (await api(token, `/sites/${sitePath}/sitemaps`)).sitemap || []);
  await save('summary', {
    property,
    ...range,
    complete,
    exportedAt: new Date().toISOString(),
    totals: totals
      ? { clicks: totals.clicks, impressions: totals.impressions, ctr: totals.ctr, position: totals.position }
      : null,
    rowCounts,
  });

  console.log(`\nSaved to seo-data/${month}/`);
  if (totals) console.log(`Totals: ${totals.clicks} clicks, ${totals.impressions} impressions, average position ${totals.position.toFixed(1)}`);
  else console.log('Google returned no data for this month.');
}

const args = parseArgs(process.argv.slice(2));
const key = await loadKey();
const token = await getToken(key);
const sites = (await api(token, '/sites')).siteEntry || [];

console.log(`Service account: ${key.client_email}`);
for (const site of sites) console.log(`  ${site.siteUrl} (${site.permissionLevel})`);

const property = chooseProperty(sites, args.property, key.client_email);
console.log(`Property: ${property}`);

if (!args.check) {
  const month = args.month || lastFinishedMonth(new Date());
  console.log(`Exporting ${month}`);
  await exportMonth(token, property, month);
}
