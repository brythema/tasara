/* Asserts no Blob-experiment test accounts remain in the shared Firebase
   project: no auth user with a "brythema+exp…" email or a "tasmoke…" uid.
   Exit 0 only when the sweep is clean. Run from backend/. */
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';

const key = JSON.parse(readFileSync('service-account-tasara.json', 'utf8'));
if (!getApps().length) initializeApp({ credential: cert(key) });
const auth = getAuth();

const leftovers = [];
let pageToken;
do {
  const page = await auth.listUsers(1000, pageToken);
  for (const user of page.users) {
    const email = String(user.email || '').toLowerCase();
    if (email.startsWith('brythema+exp') || user.uid.startsWith('tasmoke')) leftovers.push(user.email || user.uid);
  }
  pageToken = page.pageToken;
} while (pageToken);

if (leftovers.length > 0) {
  console.log('test accounts remain: ' + leftovers.join(', '));
  process.exit(1);
}
console.log('NO TEST ACCOUNTS');
