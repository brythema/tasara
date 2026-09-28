/**
 * Assigns sequential account numbers to accounts that registered before the
 * numbering existed, and leaves the counter ready for the next registration.
 *
 * Safe to run more than once: accounts that already have a number are skipped.
 *
 * Usage:
 *   node scripts/backfill-account-numbers.mjs --dry-run     # print the plan only
 *   node scripts/backfill-account-numbers.mjs               # apply
 *
 * Credentials come from GOOGLE_APPLICATION_CREDENTIALS, or from the emulator
 * when FIRESTORE_EMULATOR_HOST is set.
 */
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const ACCOUNTS = 'accounts';
const COLLECTIONS = { USERS: 'users', BUYERS: 'buyers', SELLERS: 'sellers', COUNTERS: 'counters' };

const dryRun = process.argv.includes('--dry-run');

function toMillis(value) {
  if (!value) return Number.MAX_SAFE_INTEGER; // undated accounts go last
  if (typeof value.toMillis === 'function') return value.toMillis();
  const d = new Date(value);
  return isNaN(d) ? Number.MAX_SAFE_INTEGER : d.getTime();
}

async function main() {
  const app = getApps().length ? getApps()[0] : initializeApp({
    credential: applicationDefault(),
    projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || undefined
  });
  const db = getFirestore(app);

  const snapshot = await db.collection(COLLECTIONS.USERS).get();
  const numbered = [];
  const unnumbered = [];

  snapshot.docs.forEach(doc => {
    const data = doc.data() || {};
    const n = Number(data.accountNumber);
    if (Number.isFinite(n) && n >= 1) numbered.push(n);
    else unnumbered.push({ id: doc.id, role: data.role, createdAt: data.createdAt, name: data.name });
  });

  unnumbered.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));

  let next = numbered.length ? Math.max(...numbered) : 0;
  const plan = unnumbered.map(entry => ({ ...entry, number: ++next }));

  console.log(`users: ${snapshot.size} total, ${numbered.length} already numbered, ${plan.length} to assign`);
  if (!plan.length) {
    const counterRef = db.collection(COLLECTIONS.COUNTERS).doc(ACCOUNTS);
    const counterSnap = await counterRef.get();
    const current = counterSnap.exists ? Number(counterSnap.data().last) : 0;
    if (!dryRun && current !== next) {
      await counterRef.set({ last: next }, { merge: true });
      console.log(`counter set to ${next}`);
    } else {
      console.log(`nothing to do; counter is ${current}`);
    }
    return;
  }

  plan.forEach(entry => {
    console.log(`  ${String(entry.number).padStart(4, '0')}  ${entry.id}  ${entry.role || '?'}  ${entry.name || ''}`);
  });

  if (dryRun) {
    console.log('dry run: no writes performed');
    return;
  }

  for (const entry of plan) {
    const roleCollection = entry.role === 'buyer' ? COLLECTIONS.BUYERS
      : entry.role === 'seller' ? COLLECTIONS.SELLERS
      : null;
    const batch = db.batch();
    batch.set(db.collection(COLLECTIONS.USERS).doc(entry.id), { accountNumber: entry.number }, { merge: true });
    if (roleCollection) {
      batch.set(db.collection(roleCollection).doc(entry.id), { accountNumber: entry.number }, { merge: true });
    }
    await batch.commit();
  }

  await db.collection(COLLECTIONS.COUNTERS).doc(ACCOUNTS).set({ last: next }, { merge: true });
  console.log(`assigned ${plan.length} account numbers; counter is now ${next}`);
}

main().catch(error => {
  console.error('backfill failed:', error && error.message ? error.message : error);
  process.exit(1);
});
