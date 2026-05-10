// Sets all Supabase GitHub Actions repo secrets + the SUPABASE_ENABLED variable.
// Uses libsodium-wrappers for sealed-box encryption per GitHub's spec.
//
// Reads token from process.env.GITHUB_BEARER_TOKEN
// Reads values from .secrets.local at repo root

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sodium from 'libsodium-wrappers';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.SUNPATH_REPO_ROOT || resolve(__dirname, '..');
const owner = 'sunpath-dev';
const repo  = 'sunpath-dev.github..io';
const token = process.env.GITHUB_BEARER_TOKEN;
if (!token) {
  console.error('GITHUB_BEARER_TOKEN env var not set');
  process.exit(1);
}

const kv = {};
for (const line of readFileSync(resolve(repoRoot, '.secrets.local'), 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq < 1) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  kv[k] = v;
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'sunpath-secret-setter',
  'Content-Type': 'application/json',
};
const base = `https://api.github.com/repos/${owner}/${repo}`;

async function setVariable(name, value) {
  let r = await fetch(`${base}/actions/variables`, {
    method: 'POST', headers, body: JSON.stringify({ name, value }),
  });
  if (r.status === 409 || r.status === 422) {
    r = await fetch(`${base}/actions/variables/${name}`, {
      method: 'PATCH', headers, body: JSON.stringify({ name, value }),
    });
  }
  if (!r.ok) throw new Error(`variable ${name}: ${r.status} ${await r.text()}`);
  console.log(`  variable ${name} OK`);
}

async function setSecret(name, value, pubKey) {
  await sodium.ready;
  const keyBytes = sodium.from_base64(pubKey.key, sodium.base64_variants.ORIGINAL);
  const msgBytes = sodium.from_string(value);
  const sealed = sodium.crypto_box_seal(msgBytes, keyBytes);
  const encrypted_value = sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);
  const r = await fetch(`${base}/actions/secrets/${name}`, {
    method: 'PUT', headers,
    body: JSON.stringify({ encrypted_value, key_id: pubKey.key_id }),
  });
  if (!r.ok) throw new Error(`secret ${name}: ${r.status} ${await r.text()}`);
  console.log(`  secret ${name} OK`);
}

const pubResp = await fetch(`${base}/actions/secrets/public-key`, { headers });
if (!pubResp.ok) {
  console.error(`preflight failed: ${pubResp.status} ${await pubResp.text()}`);
  process.exit(1);
}
const pubKey = await pubResp.json();
console.log(`==> preflight OK key_id=${pubKey.key_id}`);

console.log('==> variable SUPABASE_ENABLED=true');
await setVariable('SUPABASE_ENABLED', 'true');

const secrets = [
  'SUPABASE_PROJECT_REF',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_PUBLISHABLE_KEY',
];

console.log('==> secrets');
for (const name of secrets) {
  if (!kv[name]) { console.log(`  SKIP ${name} (missing in .secrets.local)`); continue; }
  await setSecret(name, kv[name], pubKey);
}

console.log('==> done');
