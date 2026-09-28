import {
  doc,
  runTransaction
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { COLLECTIONS, ACCOUNT_COUNTER_DOC } from './constants.js';

/**
 * Reserves the next sequential account number.
 *
 * The counter document is the single source of truth, and the read/increment
 * happens inside one transaction so two simultaneous registrations cannot be
 * issued the same number.
 *
 * Only the `last` field is ever written: the security rules accept an update
 * solely when it is exactly `previous + 1` and touches that field alone.
 *
 * @returns {Promise<number>} the reserved number, starting at 1 for the first account
 */
export async function allocateAccountNumber({ db }) {
  const counterRef = doc(db, COLLECTIONS.COUNTERS, ACCOUNT_COUNTER_DOC);

  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(counterRef);

    if (!snapshot.exists()) {
      transaction.set(counterRef, { last: 1 });
      return 1;
    }

    const current = Number(snapshot.data().last);
    const next = (Number.isFinite(current) && current > 0 ? current : 0) + 1;
    transaction.update(counterRef, { last: next });
    return next;
  });
}
