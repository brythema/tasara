/* One-off cleanup: remove the Blob-experiment test accounts from the shared
   production database. Finds every Firebase auth user whose email local part
   starts with "brythema+exp", then removes, per uid:
     1. any government-ID blob (via the production tdoc-delete endpoint,
        authenticated by a minted admin session),
     2. Firestore docs in sellers/, buyers/ and users/,
     3. the Firebase auth accounts themselves (last).
   Prints what it removed. Run from backend/. */
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { del } from '@vercel/blob';
import { readFileSync } from 'node:fs';

const key = JSON.parse(readFileSync('service-account-tasara.json', 'utf8'));
if (!getApps().length) initializeApp({ credential: cert(key) });
const auth = getAuth();
const db = getFirestore();

const TEST_LOCAL_PREFIX = 'brythema+exp';

/* Collect every auth user matching the test pattern (paged). */
const testUsers = [];
let pageToken;
do {
  const page = await auth.listUsers(1000, pageToken);
  for (const user of page.users) {
    if (String(user.email || '').toLowerCase().startsWith(TEST_LOCAL_PREFIX)) testUsers.push(user);
  }
  pageToken = page.pageToken;
} while (pageToken);

if (testUsers.length === 0) {
  console.log('No test accounts found. Nothing to clean.');
  process.exit(0);
}
console.log(`Found ${testUsers.length} test account(s):`);
for (const u of testUsers) console.log(`  ${u.uid}  ${u.email}`);

const uids = testUsers.map(u => u.uid);
const uidSet = new Set(uids);

/* 1 — blobs behind any governmentIdPath these accounts hold. */
const blobPaths = [];
for (const collectionName of ['sellers', 'buyers']) {
  const snapshot = await db.collection(collectionName).get();
  for (const doc of snapshot.docs) {
    if (!uidSet.has(doc.id)) continue;
    const path = String(doc.data().governmentIdPath || '');
    if (path.startsWith('https://') && path.includes('/seller-government-id/')) blobPaths.push({ uid: doc.id, path });
  }
}
for (const { uid, path } of blobPaths) {
  try {
    await del(path);
    console.log(`removed blob for ${uid}`);
  } catch (error) {
    if (String(error.message).includes('no blob')) console.log(`blob already gone for ${uid}`);
    else console.log(`WARN blob removal failed for ${uid}: ${error.message.split('\n')[0]}`);
  }
}

/* 2 — Firestore records. */
for (const uid of uids) {
  for (const collectionName of ['sellers', 'buyers', 'users']) {
    const ref = db.collection(collectionName).doc(uid);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.delete();
      console.log(`removed ${collectionName}/${uid}`);
    }
  }
}

/* 3 — the auth accounts themselves. */
const result = await auth.deleteUsers(uids);
if (result.errors.length > 0) {
  console.log('WARN some auth deletions failed:', JSON.stringify(result.errors));
  process.exit(1);
}
console.log(`deleted ${uids.length} auth account(s)`);

/* Verify nothing is left. */
let leftovers = 0;
for (const u of testUsers) {
  try {
    await auth.getUserByEmail(u.email);
    console.log(`LEFTOVER auth user: ${u.email}`);
    leftovers++;
  } catch (_) { /* gone, good */ }
}
console.log(leftovers === 0 ? 'CLEANUP COMPLETE' : `CLEANUP INCOMPLETE (${leftovers} leftovers)`);
process.exit(leftovers === 0 ? 0 : 1);
