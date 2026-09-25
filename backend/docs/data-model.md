# TASARA Firebase Data Model

## Users

`users/{uid}` is the account routing record.

- `role`: `buyer` | `seller` | `admin`
- `name`, `email`, `phone`, `address`
- `createdAt`, `updatedAt`

**Buyers and sellers both use this record for role routing. No account receives a tier here.** Seller tier lives only in `sellers/{uid}`.

## Buyers

`buyers/{uid}` contains buyer profile information.

- `name`, `email`, `phone`, `address`
- `createdAt`, `updatedAt`

A buyer is active immediately after account creation. There is no buyer approval flow and no buyer tier. The dashboard contains the buyer-community Telegram button.

## Sellers

`sellers/{uid}` contains the Merchant Steward application.

- `name`, `email`, `phone`, `address`
- `businessName`, `businessLocation`
- `tier`: `1`–`4`
- `status`: `pending` | `approved` | `rejected`
- `governmentIdPath`, `governmentIdName`, `governmentIdType`
- `reviewedAt`, `reviewedBy`, `reviewNote`
- `createdAt`, `updatedAt`

### Seller lifecycle

1. Register → Auth account + `users/{uid}` + `sellers/{uid}` are created atomically.
2. Seller starts as `pending`.
3. Admin dashboard listens to seller records in real time; pending applications appear immediately.
4. Admin saves/reviews the government ID and chooses approve or reject.
5. Seller dashboard listens to `sellers/{uid}` and reflects the decision immediately.
6. Only an `approved` seller sees the active Merchant Steward access state.

There is no separate notification collection in this phase. Firestore realtime listeners are the notification mechanism.

## Seller tiers

| Tier | Name | Stake | Omni |
|---|---|---:|---:|
| 1 | Micro-Steward | $50 | 5 |
| 2 | Essential Steward | $200 | 20 |
| 3 | Strategic Steward | $500 | 50 |
| 4 | Foundational Steward | $1,000+ | 100+ |

Only sellers have tiers. No Naira amounts are used.

## Seller government ID

Files live privately at:

`seller-government-id/{uid}/{fileName}`

Only the seller and an administrator can read the document. A seller can upload/replace it while their application is not approved. Administrators can save the file from the admin console.
