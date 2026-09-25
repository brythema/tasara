# TASARA — Firebase-integrated account layer

This package now treats Firebase as the live account backend for the current TASARA phase.

## Roles

- **Buyer:** active immediately; no tier; dashboard includes the buyer-community Telegram button.
- **Seller:** chooses Tier 1–4, uploads one government ID, and starts `pending` until an administrator approves or rejects the application.
- **Admin:** a manually provisioned Firebase account with the `admin` custom claim; reviews seller applications, saves government IDs, and approves/rejects sellers.

## Core flow

```text
Buyer registration → buyer dashboard

Seller registration → pending seller dashboard
                     ↓
              admin sees pending
                     ↓
               approve / reject
                     ↓
              seller dashboard
                 updates live
```

## Firebase services

- Firebase Authentication — email/password sign-in.
- Cloud Firestore — account records, seller applications, live approval status.
- Cloud Storage — private seller government IDs.
- Firebase Security Rules — basic role/ownership enforcement.

There is intentionally **no REST API**, payment engine, wallet, order database, notification collection, or marketplace transaction layer in this phase.

## Frontend structure

The large legacy `main.js` has been split into focused files:

```text
assets/js/
  main.js
  firebase/
    firebase-config.js
    firebase-client.js
    constants.js
    tiers.js
    auth.js
    profiles.js
    admin.js
    seller-documents.js
  pages/
    login.js
    signup.js
    dashboard-buyer.js
    dashboard-seller.js
    dashboard-admin.js
```

## Firebase connection

Edit:

`assets/js/firebase/firebase-config.js`

and insert the web configuration generated when you register the TASARA web app in Firebase Console.

Then deploy the rules/indexes from `backend/`.

## Verification

Run:

```bash
cd backend
npm run check
npm run test:rules
```

The first command is a local static consistency check. The second uses the Firebase Emulator Suite; install dependencies and run the emulator when executing the full rules test.
