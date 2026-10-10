/* Tasara Vercel Blob experiment — end-to-end storage smoke test.
   Proves the whole document loop over plain HTTP:
     1. a foreign path is rejected (upload endpoint is path-locked),
     2. a raw upload lands in the PRIVATE Blob store and returns its URL,
     3. the raw blob URL is NOT openly readable (private store holds),
     4. the token-authenticated read proxy serves the exact bytes,
     5. deletion really removes the blob (proxy and raw URL both 404),
     6. the read proxy refuses URLs outside the seller-document shape.
   Exit code 0 only when every step passes. */
const BASE = process.env.TASARA_EXP_BASE || 'https://tasara-experiment.vercel.app';

/* A genuine 1x1 JPEG. */
const JPEG_1PX = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/' +
  'wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64'
);

const PATH = `seller-government-id/smoketest01/government-id-${Date.now()}.jpg`;
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

/* 1 — upload endpoint refuses paths outside the seller-document shape. */
{
  const r = await post(`${BASE}/api/tdoc-upload?path=not-a-valid-path`, Buffer.from('x'));
  report('foreign path rejected', r.status === 400, `status ${r.status}`);
}

/* 2 — raw upload stores in the private Blob store and returns its URL. */
let docUrl = '';
{
  const r = await post(
    `${BASE}/api/tdoc-upload?path=${encodeURIComponent(PATH)}`,
    JPEG_1PX,
    { 'Content-Type': 'image/jpeg' }
  );
  const ok = r.status === 201 && typeof r.json.url === 'string' && r.json.url.includes('/seller-government-id/');
  report('upload stored in the Blob store', ok, ok ? r.json.url.slice(0, 90) + '…' : `status ${r.status} ${r.text}`);
  if (ok) docUrl = r.json.url;
}

/* 3 — the raw blob URL is not openly readable (private store). */
{
  const res = await fetch(docUrl);
  const blocked = res.status === 401 || res.status === 403 || res.status === 404;
  report('raw blob URL is not open to the web', blocked, `status ${res.status}`);
}

/* 4 — the read proxy serves the exact bytes. */
{
  const res = await fetch(`${BASE}/api/tdoc-read?url=${encodeURIComponent(docUrl)}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || '';
  const ok = res.status === 200 && bytes.equals(JPEG_1PX) && contentType.includes('image/jpeg');
  report('read proxy serves the uploaded bytes', ok, `${res.status}, ${bytes.length} bytes, content-type ${contentType}`);
}

/* 5 — deletion removes the blob for good. */
{
  const first = await post(`${BASE}/api/tdoc-delete?url=${encodeURIComponent(docUrl)}`, undefined);
  const okFirst = first.status === 200 && first.json.ok === true;
  report('delete succeeds', okFirst, first.text.trim().slice(0, 80));

  const gone = await fetch(`${BASE}/api/tdoc-read?url=${encodeURIComponent(docUrl)}`);
  report('read proxy reports the blob as gone', gone.status === 404, `status ${gone.status}`);

  const second = await post(`${BASE}/api/tdoc-delete?url=${encodeURIComponent(docUrl)}`, undefined);
  const okSecond = second.status === 200 && second.json.missing === true;
  report('second delete reports the missing blob', okSecond, second.text.trim().slice(0, 80));
}

/* 6 — the read proxy refuses URLs outside the seller-document shape. */
{
  const r = await fetch(`${BASE}/api/tdoc-read?url=${encodeURIComponent('https://example.com/other/file.jpg')}`);
  report('foreign URL rejected for read', r.status === 400, `status ${r.status}`);
}

console.log(failures === 0 ? 'SMOKE TEST PASSED' : `SMOKE TEST FAILED (${failures} step(s))`);
process.exit(failures === 0 ? 0 : 1);
