import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch
} from 'firebase/firestore';

const projectId = 'tasara-backend-rules-test';
const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');

const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: { rules }
});

const backdated = { createdAt: new Date(), updatedAt: new Date() };

// Seed with rules disabled: existing records, including ones created before
// account numbers existed, must not be disturbed by the new rules.
await testEnv.withSecurityRulesDisabled(async context => {
  const db = context.firestore();
  await setDoc(doc(db, 'sellers', 'seller-1'), {
    name: 'Seller One', email: 'seller@example.com', tier: 2, status: 'pending',
    accountNumber: 2,
    governmentIdPath: '', governmentIdName: '', governmentIdType: '',
    ...backdated
  });
  await setDoc(doc(db, 'users', 'seller-1'), {
    name: 'Seller One', email: 'seller@example.com', phone: '', address: '', role: 'seller',
    accountNumber: 2, ...backdated
  });
  await setDoc(doc(db, 'users', 'admin-1'), {
    name: 'Admin One', email: 'admin@example.com', phone: '', address: '', role: 'admin',
    accountNumber: 1, ...backdated
  });
});

const buyerDb = testEnv.authenticatedContext('buyer-1').firestore();
const buyer2Db = testEnv.authenticatedContext('buyer-2').firestore();
const sellerDb = testEnv.authenticatedContext('seller-1').firestore();
const adminDb = testEnv.authenticatedContext('admin-1', { admin: true }).firestore();
const randomDb = testEnv.authenticatedContext('random-1').firestore();
const anonDb = testEnv.unauthenticatedContext().firestore();

/* ---------- existing behaviour ---------- */
await assertFails(getDoc(doc(randomDb, 'users', 'seller-1')));
await assertSucceeds(getDoc(doc(sellerDb, 'users', 'seller-1')));

// Buyer registration: user + buyer profile can be created atomically, without a tier.
{
  const batch = writeBatch(buyerDb);
  batch.set(doc(buyerDb, 'users', 'buyer-1'), {
    name: 'Buyer One', email: 'buyer@example.com', phone: '', address: '', role: 'buyer',
    accountNumber: 3, ...backdated
  });
  batch.set(doc(buyerDb, 'buyers', 'buyer-1'), {
    name: 'Buyer One', email: 'buyer@example.com', phone: '', address: '',
    accountNumber: 3, ...backdated
  });
  await assertSucceeds(batch.commit());
}

await assertFails(setDoc(doc(buyerDb, 'users', 'buyer-bad'), {
  name: 'Bad', email: 'bad@example.com', phone: '', address: '', role: 'admin',
  accountNumber: 4, ...backdated
}));

// Buyer cannot create a buyer document carrying a tier.
await assertFails(setDoc(doc(buyerDb, 'buyers', 'buyer-tier'), {
  name: 'Bad', email: 'bad@example.com', phone: '', address: '', tier: 2,
  accountNumber: 4, ...backdated
}));

// Seller cannot self-approve or change their tier/status.
await assertFails(updateDoc(doc(sellerDb, 'sellers', 'seller-1'), { status: 'approved' }));
await assertFails(updateDoc(doc(sellerDb, 'sellers', 'seller-1'), { tier: 4 }));

// Admin can read sellers and approve them.
await assertSucceeds(getDoc(doc(adminDb, 'sellers', 'seller-1')));
await assertSucceeds(updateDoc(doc(adminDb, 'sellers', 'seller-1'), {
  status: 'approved', reviewedBy: 'admin-1', reviewedAt: new Date(), reviewNote: 'Approved'
}));

/* ---------- account numbers ---------- */

// A profile cannot be created without a number.
await assertFails(setDoc(doc(buyer2Db, 'users', 'buyer-2'), {
  name: 'Buyer Two', email: 'buyer2@example.com', phone: '', address: '', role: 'buyer', ...backdated
}));

// ...nor with a non-integer or non-positive one.
await assertFails(setDoc(doc(buyer2Db, 'users', 'buyer-2'), {
  name: 'Buyer Two', email: 'buyer2@example.com', phone: '', address: '', role: 'buyer',
  accountNumber: '0004', ...backdated
}));
await assertFails(setDoc(doc(buyer2Db, 'users', 'buyer-2'), {
  name: 'Buyer Two', email: 'buyer2@example.com', phone: '', address: '', role: 'buyer',
  accountNumber: 0, ...backdated
}));

// A valid number is accepted.
await assertSucceeds(setDoc(doc(buyer2Db, 'users', 'buyer-2'), {
  name: 'Buyer Two', email: 'buyer2@example.com', phone: '', address: '', role: 'buyer',
  accountNumber: 4, ...backdated
}));

// The number is immutable once issued, for the owner and for the administrator.
await assertFails(updateDoc(doc(buyerDb, 'users', 'buyer-1'), { accountNumber: 99 }));
await assertFails(updateDoc(doc(adminDb, 'sellers', 'seller-1'), { accountNumber: 99 }));

// A normal profile edit still works.
await assertSucceeds(updateDoc(doc(buyerDb, 'users', 'buyer-1'), { phone: '+234 800 000 0000', updatedAt: new Date() }));

/* ---------- the account-number counter ---------- */

// Reading the counter requires a signed-in user; it powers the reservation.
await assertFails(getDoc(doc(anonDb, 'counters', 'accounts')));
await assertSucceeds(getDoc(doc(buyerDb, 'counters', 'accounts')));

// It may only be created at 1, and only with the single expected field.
await assertFails(setDoc(doc(buyerDb, 'counters', 'accounts'), { last: 5 }));
await assertFails(setDoc(doc(buyerDb, 'counters', 'accounts'), { last: 1, extra: true }));
await assertSucceeds(setDoc(doc(buyerDb, 'counters', 'accounts'), { last: 1 }));

// It may only move forward by exactly one, and only that field may change.
await assertSucceeds(updateDoc(doc(buyerDb, 'counters', 'accounts'), { last: 2 }));
await assertFails(updateDoc(doc(buyerDb, 'counters', 'accounts'), { last: 4 }));
await assertFails(updateDoc(doc(buyerDb, 'counters', 'accounts'), { last: 3, extra: true }));
await assertFails(deleteDoc(doc(buyerDb, 'counters', 'accounts')));

/* ---------- administrator deletes ---------- */

// Only the administrator may remove an account.
await assertFails(deleteDoc(doc(randomDb, 'users', 'seller-1')));
await assertFails(deleteDoc(doc(sellerDb, 'sellers', 'seller-1')));
await assertFails(deleteDoc(doc(sellerDb, 'users', 'seller-1')));

await assertSucceeds(deleteDoc(doc(adminDb, 'sellers', 'seller-1')));
await assertSucceeds(deleteDoc(doc(adminDb, 'users', 'seller-1')));
await assertSucceeds(deleteDoc(doc(adminDb, 'buyers', 'buyer-1')));
await assertSucceeds(deleteDoc(doc(adminDb, 'users', 'buyer-1')));

await testEnv.cleanup();
console.log('Firestore rules tests passed.');
