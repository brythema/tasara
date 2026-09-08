# Tasara — Engineering Memory

## Architecture Decisions

### Frontend: Vanilla HTML/CSS/JS
- No framework chosen to keep the project lightweight and fast to deploy
- Modules loaded via ES imports from jsdelivr/esm.sh CDN
- All state management is local to page scripts + Supabase client

### Seller Edit Workflow (Critical Design)
- **Never overwrite approved data before approval**
- Seller edits create a row in `seller_change_requests` with old/new values
- Seller status changes to `pending-review` but account remains active
- Admin reviews the diff (old → new) and approves/rejects
- On approve: new values are applied to `seller_profiles`, status back to `approved`
- On reject: original data preserved, status back to `approved`

### Government ID Storage
- Private Supabase Storage bucket: `government-ids`
- Signed URLs only (1-hour expiry) for viewing
- Admin and seller (their own) can access
- Never exposed via public URLs

### Email Notifications
- Supabase Edge Function (`send-email`) calls Resend API
- Templates: buyer_profile_updated, seller_change_pending, new_seller_registration, account_deactivated
- Admin email is configurable via `ADMIN_EMAIL` env var

## Known Issues / TODO

- [ ] Replace `admin@tasara.ng` with real admin email in profile.js and schema.sql
- [ ] Replace Telegram placeholder with real community link
- [ ] Set up Resend verified domain for production emails
- [ ] Add email verification handling page (currently redirects to dashboard)
- [ ] Consider adding Supabase database triggers for automated notifications instead of manual inserts

## Brand

- **Name:** Tasara
- **Primary color:** Gold (#c8a44e)
- **Background:** Dark navy (#0b0f1a)
- **Style:** Premium, glassmorphic, minimal
