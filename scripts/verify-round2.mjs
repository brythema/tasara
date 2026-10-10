/* Tasara experiment round-2 verification.
   Re-proves, against the live deployment:
     1. the deployed seller dashboard HTML carries the new Edit card and the
        fixed (no-$) community-button wiring,
     2. the deployed admin module carries the record editor,
     3. the profile-edits module is served,
     4. the private-store smoke loop still passes end-to-end.
   Exit code 0 only when every check passes. */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.TASARA_EXP_BASE || 'https://tasara-experiment.vercel.app';
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
  const buyerJs = await get('/assets/js/pages/dashboard-buyer.js');
  report('buyer dashboard JS ships the sync open + edit save', buyerJs.status === 200 && buyerJs.text.includes('saveMyDetails'));
}

/* 2 — admin record editor shipped. */
{
  const adminJs = await get('/assets/js/pages/dashboard-admin.js');
  report(
    'admin dashboard JS has the record editor',
    adminJs.status === 200 && adminJs.text.includes("kind === 'editdetails'") && adminJs.text.includes('saveRecordDetails')
  );
}

/* 3 — the shared data module is served. */
{
  const mod = await get('/assets/js/firebase/profile-edits.js');
  report('profile-edits module served', mod.status === 200 && mod.text.includes('saveMyDetails') && mod.text.includes('saveRecordDetails'));
}

/* 4 — the private-store document loop still passes end-to-end. */
{
  let ok = false;
  try {
    const out = execFileSync(process.execPath, [join(HERE, 'experiment-smoke.mjs')], { encoding: 'utf8' });
    ok = out.includes('SMOKE TEST PASSED');
    report('storage smoke loop', ok, out.trim().split('\n').pop());
  } catch (error) {
    report('storage smoke loop', false, String(error.message).split('\n')[0]);
  }
}

console.log(failures === 0 ? 'ROUND-2 VERIFICATION PASSED' : `ROUND-2 VERIFICATION FAILED (${failures} check(s))`);
process.exit(failures === 0 ? 0 : 1);
