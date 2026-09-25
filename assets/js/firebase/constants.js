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
  SELLERS: 'sellers'
});

export const STORAGE_PATHS = Object.freeze({
  SELLER_GOVERNMENT_ID: (uid, fileName) => `seller-government-id/${uid}/${fileName}`
});
