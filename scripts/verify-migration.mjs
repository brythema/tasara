/* Tasara migration verification — proves the deployed production site carries
   the migrated experiment and the document loop passes end-to-end.
     1. the seller dashboard serves the Edit card and the fixed (no-$)
        community-button wiring,
     2. the buyer dashboard ships the edit save,
     3. the admin module carries the record editor,
     4. the profile-edits module is served,
     5. the full authenticated document-store smoke passes (see
        backend/scripts/smoke-doc-store.mjs).
   Exit code 0 only when every check passes. Run from backend/ for the smoke
   (it needs the service key) — this script just spawns it. */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.TASARA_BASE || 'https://tasara.africa';
let failures = 0;

function report(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures += 1;
}

const get = async path => {
  const res = await fetch(BASE + path);
  return { status: res.status, text: await res.text() };
};

/* 1 — seller dashboard shipped with the fixes. */
{
  const sellerPage = await get('/dashboard-seller.html');
  report('seller dashboard serves the edit card', sellerPage.status === 200 && sellerPage.text.includes('editDetailsBtn'));
  const sellerJs = await get('/assets/js/pages/dashboard-seller.js');
  report(
    'seller dashboard JS has the $ fix',
    sellerJs.status === 200
      && sellerJs.text.includes("document.getElementById('joinSellerBtn')")
      && !sellerJs.text.includes("$('joinSellerBtn')")
  );
}

/* 2 — buyer dashboard. */
{
  const buyerJs = await get('/assets/js/pages/dashboard-buyer.js');
  report('buyer dashboard JS ships the sync open + edit save', buyerJs.status === 200 && buyerJs.text.includes('saveMyDetails'));
}

/* 3 — admin record editor shipped. */
{
  const adminJs = await get('/assets/js/pages/dashboard-admin.js');
  report(
    'admin dashboard JS has the record editor + token plumbing',
    adminJs.status === 200
      && adminJs.text.includes("kind === 'editdetails'")
      && adminJs.text.includes('saveRecordDetails')
      && adminJs.text.includes('getIdToken')
  );
}

/* 4 — the shared data module is served. */
{
  const mod = await get('/assets/js/firebase/profile-edits.js');
  report('profile-edits module served', mod.status === 200 && mod.text.includes('saveMyDetails') && mod.text.includes('saveRecordDetails'));
}

/* 5 — the authenticated document-store loop. */
{
  let ok = false;
  try {
    const out = execFileSync(process.execPath, [join(HERE, '..', 'backend', 'scripts', 'smoke-doc-store.mjs')], {
      encoding: 'utf8',
      cwd: join(HERE, '..', 'backend')
    });
    ok = out.includes('SMOKE TEST PASSED');
    report('authenticated storage smoke loop', ok, out.trim().split('\n').pop());
    if (!ok) console.log(out);
  } catch (error) {
    report('authenticated storage smoke loop', false, String(error.stdout || error.message).split('\n')[0]);
    if (error.stdout) console.log(error.stdout);
  }
}

console.log(failures === 0 ? 'MIGRATION VERIFICATION PASSED' : `MIGRATION VERIFICATION FAILED (${failures} check(s))`);
process.exit(failures === 0 ? 0 : 1);
