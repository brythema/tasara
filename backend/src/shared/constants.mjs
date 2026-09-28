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

export const ACCOUNT_COUNTER_DOC = 'accounts';

export function formatAccountNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return '----';
  return String(Math.floor(n)).padStart(4, '0');
}

export const STORAGE_PATHS = Object.freeze({
  SELLER_GOVERNMENT_ID: (uid, fileName) => `seller-government-id/${uid}/${fileName}`
});


