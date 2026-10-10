/* Tasara document store — end-to-end smoke over plain HTTP against a BASE url
   (default https://tasara.africa).

   All three tdoc endpoints require a Firebase ID token (upload/delete: Bearer
   header of the document owner or an admin; read: a token WITH the admin
   claim). This smoke mints two throwaway Firebase sessions through the Admin
   SDK + the Identity Toolkit REST exchange (a custom-token sign-in for a
   nonexistent UID creates the account), proves the whole document loop, and
   deletes both accounts afterwards.

   Proves:
     1. an unauthenticated upload is refused (401) — no anonymous file sink,
     2. a foreign path is rejected even with a token (path lock),
     3. a mismatched-owner token is refused (403),
     4. a raw upload lands in the PRIVATE Blob store and returns its URL,
     5. the raw blob URL is NOT openly readable,
     6. the read proxy refuses callers without a token (401) and without the
        admin claim (403), and serves the exact bytes to an admin,
     7. a foreign URL is refused for reading,
     8. an owner token deletes the blob; the proxy then 404s and a repeat
        delete is a safe no-op.
   Exit code 0 only when every step passes. Both throwaway accounts are
   removed even on failure. */
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';

const BASE = process.env.TASARA_BASE || 'https://tasara.africa';
const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const SELLER_UID = `tasmoke-s-${suffix}`;
const ADMIN_UID = `tasmoke-a-${suffix}`;

const key = JSON.parse(readFileSync('service-account-tasara.json', 'utf8'));
if (!getApps().length) initializeApp({ credential: cert(key) });
const auth = getAuth();

const webConfig = JSON.parse(readFileSync(new URL('../../assets/js/firebase/firebase-config.json', import.meta.url), 'utf8'));

/* A genuine 1x1 JPEG. */
const JPEG_1PX = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/' +
  'wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64'
);

let failures = 0;
function report(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures += 1;
}

const post = async (url, body, headers = {}) => {
  const res = await fetch(url, { method: 'POST', body, headers });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch (_) { /* keep text */ }
  return { status: res.status, json, text };
};

async function mintIdToken(uid, claims) {
  const customToken = await auth.createCustomToken(uid, claims);
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${webConfig.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  if (!res.ok) throw new Error(`token exchange failed for ${uid}: ${res.status} ${await res.text()}`);
  return (await res.json()).idToken;
}

let sellerToken = '';
let docUrl = '';
try {
  sellerToken = await mintIdToken(SELLER_UID, {});
  const adminToken = await mintIdToken(ADMIN_UID, { admin: true });
  const SELLER_PATH = `seller-government-id/${SELLER_UID}/government-id-${Date.now()}.jpg`;

  /* 1 — no token, no upload. */
  {
    const r = await post(`${BASE}/api/tdoc-upload?path=${encodeURIComponent(SELLER_PATH)}`, JPEG_1PX, { 'Content-Type': 'image/jpeg' });
    report('unauthenticated upload refused', r.status === 401, `status ${r.status}`);
  }

  /* 2 — path lock holds even with a valid token. */
  {
    const r = await post(`${BASE}/api/tdoc-upload?path=not-a-valid-path`, Buffer.from('x'), { Authorization: `Bearer ${sellerToken}` });
    report('foreign path rejected', r.status === 400, `status ${r.status}`);
  }

  /* 3 — another user's token cannot write into someone else's path. */
  {
    const r = await post(
      `${BASE}/api/tdoc-upload?path=${encodeURIComponent(`seller-government-id/${ADMIN_UID}/government-id-${Date.now()}.jpg`)}`,
      JPEG_1PX,
      { 'Content-Type': 'image/jpeg', Authorization: `Bearer ${sellerToken}` }
    );
    report('mismatched owner refused', r.status === 403, `status ${r.status}`);
  }

  /* 4 — the owner uploads into the private store. */
  {
    const r = await post(
      `${BASE}/api/tdoc-upload?path=${encodeURIComponent(SELLER_PATH)}`,
      JPEG_1PX,
      { 'Content-Type': 'image/jpeg', Authorization: `Bearer ${sellerToken}` }
    );
    const ok = r.status === 201 && typeof r.json.url === 'string' && r.json.url.includes('/seller-government-id/');
    report('upload stored in the Blob store', ok, ok ? r.json.url.slice(0, 90) + '…' : `status ${r.status} ${r.text}`);
    if (ok) docUrl = r.json.url;
  }

  if (docUrl) {
    /* 5 — the raw blob URL is not open to the web. */
    {
      const res = await fetch(docUrl);
      const blocked = res.status === 401 || res.status === 403 || res.status === 404;
      report('raw blob URL is not open to the web', blocked, `status ${res.status}`);
    }

    /* 6 — the read proxy: no token 401, non-admin 403, admin byte-exact. */
    {
      const anon = await fetch(`${BASE}/api/tdoc-read?url=${encodeURIComponent(docUrl)}`);
      report('read proxy refuses anonymous callers', anon.status === 401, `status ${anon.status}`);

      const seller = await fetch(`${BASE}/api/tdoc-read?url=${encodeURIComponent(docUrl)}&token=${encodeURIComponent(sellerToken)}`);
      report('read proxy refuses non-admin callers', seller.status === 403, `status ${seller.status}`);

      const res = await fetch(`${BASE}/api/tdoc-read?url=${encodeURIComponent(docUrl)}&token=${encodeURIComponent(adminToken)}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') || '';
      const ok = res.status === 200 && bytes.equals(JPEG_1PX) && contentType.includes('image/jpeg');
      report('read proxy serves the uploaded bytes to an admin', ok, `${res.status}, ${bytes.length} bytes, content-type ${contentType}`);
    }

    /* 7 — foreign URLs are refused for reading. */
    {
      const r = await fetch(`${BASE}/api/tdoc-read?url=${encodeURIComponent('https://example.com/other/file.jpg')}&token=${encodeURIComponent(adminToken)}`);
      report('foreign URL rejected for read', r.status === 400, `status ${r.status}`);
    }

    /* 8 — owner deletes; the proxy 404s and a repeat delete is a no-op. */
    {
      const noAuth = await post(`${BASE}/api/tdoc-delete?url=${encodeURIComponent(docUrl)}`, undefined);
      report('delete without token refused', noAuth.status === 401, `status ${noAuth.status}`);

      const first = await post(`${BASE}/api/tdoc-delete?url=${encodeURIComponent(docUrl)}`, undefined, { Authorization: `Bearer ${sellerToken}` });
      report('owner delete succeeds', first.status === 200 && first.json.ok === true, first.text.trim().slice(0, 80));

      const gone = await fetch(`${BASE}/api/tdoc-read?url=${encodeURIComponent(docUrl)}&token=${encodeURIComponent(adminToken)}`);
      report('read proxy reports the blob as gone', gone.status === 404, `status ${gone.status}`);

      const second = await post(`${BASE}/api/tdoc-delete?url=${encodeURIComponent(docUrl)}`, undefined, { Authorization: `Bearer ${sellerToken}` });
      report('second delete is a safe no-op', second.status === 200, second.text.trim().slice(0, 80));
    }
  }
} finally {
  /* Best-effort blob cleanup if the loop stopped before the delete steps. */
  if (docUrl && sellerToken) {
    await post(`${BASE}/api/tdoc-delete?url=${encodeURIComponent(docUrl)}`, undefined, { Authorization: `Bearer ${sellerToken}` }).catch(() => {});
  }
  try {
    await auth.deleteUsers([SELLER_UID, ADMIN_UID]);
  } catch (error) {
    console.log(`WARN  could not delete throwaway accounts: ${error && error.message}`);
  }
}

console.log(failures === 0 ? 'SMOKE TEST PASSED' : `SMOKE TEST FAILED (${failures} step(s))`);
process.exit(failures === 0 ? 0 : 1);
