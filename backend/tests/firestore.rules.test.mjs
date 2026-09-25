import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
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

await testEnv.withSecurityRulesDisabled(async context => {
  const db = context.firestore();
  await setDoc(doc(db, 'sellers', 'seller-1'), {
    name: 'Seller One', email: 'seller@example.com', tier: 2, status: 'pending',
    governmentIdPath: '', governmentIdName: '', governmentIdType: '',
    createdAt: new Date(), updatedAt: new Date()
  });
  await setDoc(doc(db, 'users', 'seller-1'), {
    name: 'Seller One', email: 'seller@example.com', phone: '', address: '', role: 'seller',
    createdAt: new Date(), updatedAt: new Date()
  });
  await setDoc(doc(db, 'users', 'admin-1'), {
    name: 'Admin One', email: 'admin@example.com', phone: '', address: '', role: 'admin',
    createdAt: new Date(), updatedAt: new Date()
  });
});

const buyerDb = testEnv.authenticatedContext('buyer-1').firestore();
const sellerDb = testEnv.authenticatedContext('seller-1').firestore();
const adminDb = testEnv.authenticatedContext('admin-1', { admin: true }).firestore();
const randomDb = testEnv.authenticatedContext('random-1').firestore();

// Existing self-read is allowed; cross-user read is denied.
await assertFails(getDoc(doc(randomDb, 'users', 'seller-1')));
await assertSucceeds(getDoc(doc(sellerDb, 'users', 'seller-1')));

// Buyer registration: user + buyer profile can be created atomically, without a tier.
{
  const batch = writeBatch(buyerDb);
  batch.set(doc(buyerDb, 'users', 'buyer-1'), {
    name: 'Buyer One', email: 'buyer@example.com', phone: '', address: '', role: 'buyer',
    createdAt: new Date(), updatedAt: new Date()
  });
  batch.set(doc(buyerDb, 'buyers', 'buyer-1'), {
    name: 'Buyer One', email: 'buyer@example.com', phone: '', address: '',
    createdAt: new Date(), updatedAt: new Date()
  });
  await assertSucceeds(batch.commit());
}

await assertFails(setDoc(doc(buyerDb, 'users', 'buyer-bad'), {
  name: 'Bad', email: 'bad@example.com', phone: '', address: '', role: 'admin',
  createdAt: new Date(), updatedAt: new Date()
}));

// Buyer cannot create a buyer document carrying a tier.
await assertFails(setDoc(doc(buyerDb, 'buyers', 'buyer-tier'), {
  name: 'Bad', email: 'bad@example.com', phone: '', address: '', tier: 2,
  createdAt: new Date(), updatedAt: new Date()
}));

// Seller cannot self-approve or change their tier/status.
await assertFails(updateDoc(doc(sellerDb, 'sellers', 'seller-1'), { status: 'approved' }));
await assertFails(updateDoc(doc(sellerDb, 'sellers', 'seller-1'), { tier: 4 }));

// Admin can read sellers and approve them.
await assertSucceeds(getDoc(doc(adminDb, 'sellers', 'seller-1')));
await assertSucceeds(updateDoc(doc(adminDb, 'sellers', 'seller-1'), {
  status: 'approved', reviewedBy: 'admin-1', reviewedAt: new Date(), reviewNote: 'Approved'
}));

await testEnv.cleanup();
console.log('Firestore rules tests passed.');
