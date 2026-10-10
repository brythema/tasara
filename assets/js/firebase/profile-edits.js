import { doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { COLLECTIONS, SELLER_STATUSES } from './constants.js';

/* Account-detail editing.
   Identity fields live on users/{uid} (what the personal dashboards read);
   the role collections are what the admin register reads. A save therefore
   writes both docs. Email is locked for self-edits (the sign-in email is a
   Firebase Auth property); only admin record edits may correct it.

   Seller semantics: a seller's own save ALWAYS re-enters the review queue
   (status -> pending), enforced by the Firestore rules (a seller self-write
   may only end in 'pending'). Buyers have no status field. */

const PERSONAL_FIELDS = ['name', 'phone', 'address'];

function cleanedStrings(source, keys) {
  const out = {};
  for (const key of keys) {
    if (typeof source[key] === 'string' && source[key].trim()) out[key] = source[key].trim();
  }
  return out;
}

function roleCollection(role) {
  if (role === 'buyer') return COLLECTIONS.BUYERS;
  if (role === 'seller') return COLLECTIONS.SELLERS;
  throw new Error('Role must be buyer or seller.');
}

/**
 * Self-service edit (buyer or seller, from their own dashboard).
 * @returns {Promise<string|null>} the status the seller record now carries
 *   ('pending' after a seller save), or null for buyers.
 */
export async function saveMyDetails({ db, uid, role, changes }) {
  const personal = cleanedStrings(changes, PERSONAL_FIELDS);
  if (!Object.keys(personal).length) throw new Error('Nothing to save.');

  const usersUpdate = { ...personal, updatedAt: serverTimestamp() };
  await updateDoc(doc(db, COLLECTIONS.USERS, uid), usersUpdate);

  const roleUpdate = { ...personal, updatedAt: serverTimestamp() };
  if (role === 'seller') {
    const business = cleanedStrings(changes, ['businessName', 'businessLocation']);
    Object.assign(roleUpdate, business);
    roleUpdate.status = SELLER_STATUSES.PENDING;
  }
  await updateDoc(doc(db, roleCollection(role), uid), roleUpdate);

  return role === 'seller' ? SELLER_STATUSES.PENDING : null;
}

/**
 * Administrator edit of a buyer or seller record. Writes the personal and
 * business fields to both docs and, for sellers, the tier. It never touches
 * `status` — approval stays with the Approve/Reject decision flow.
 */
export async function saveRecordDetails({ db, uid, role, changes }) {
  const personal = cleanedStrings(changes, [...PERSONAL_FIELDS, 'email']);
  const hasPersonal = Object.keys(personal).length;
  if (hasPersonal) {
    await updateDoc(doc(db, COLLECTIONS.USERS, uid), {
      ...personal,
      updatedAt: serverTimestamp()
    });
  }

  const roleUpdate = { ...personal, updatedAt: serverTimestamp() };
  if (role === 'seller') {
    Object.assign(roleUpdate, cleanedStrings(changes, ['businessName', 'businessLocation']));
    const tier = Number(changes.tier);
    if (Number.isInteger(tier) && tier >= 1 && tier <= 4) roleUpdate.tier = tier;
  }
  await updateDoc(doc(db, roleCollection(role), uid), roleUpdate);
}
