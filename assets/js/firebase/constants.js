export const ROLES = Object.freeze({
  BUYER: 'buyer',
  SELLER: 'seller',
  ADMIN: 'admin'
});

export const SELLER_STATUSES = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
});

export const COLLECTIONS = Object.freeze({
  USERS: 'users',
  BUYERS: 'buyers',
  SELLERS: 'sellers',
  COUNTERS: 'counters'
});

/* counters/accounts holds { last: <int> } and is the single source of the
   sequential account numbers issued at registration, starting at 1. */
export const ACCOUNT_COUNTER_DOC = 'accounts';
export const ACCOUNT_PAD = 4;

/* 1 renders as "0001". Keeps working past 9999 without truncating. */
export function formatAccountNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return '----';
  return String(Math.floor(n)).padStart(ACCOUNT_PAD, '0');
}

export const STORAGE_PATHS = Object.freeze({
  SELLER_GOVERNMENT_ID: (uid, fileName) => `seller-government-id/${uid}/${fileName}`
});
