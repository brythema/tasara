# TASARA

A clean, modern account & admin platform for the Tasara Nigerian business community.

## Architecture

- **Frontend:** Vanilla HTML/CSS/JS (no framework, ES modules)
- **Backend:** Supabase (Auth · PostgreSQL with RLS · Storage · Edge Functions)
- **Email:** Resend via Supabase Edge Function
- **Deployment:** Vercel (static hosting + Edge Functions on Supabase)
- **Key security model:**
  - RLS on every table, deny-by-default. Admin checks use a `security definer` helper.
  - The `handle_new_user()` trigger whitelists role to `buyer`/`seller` only — clients can never inject `admin`.
  - The first admin is created via `claim_first_admin()` (advisory-locked, refuses if one exists).
  - Role, email, and `account_status` are protected by a trigger — users cannot self-promote or un-deactivate themselves.
  - Notifications are written only through `security definer` RPCs — no client INSERT policy exists.
  - Seller change requests are applied server-side (`approve_seller_change()` RPC) with a strict column whitelist.
  - All HTML output uses a quote-safe `escHtml()`; admin buttons use event delegation, not string-built `onclick`.
  - The email edge function rejects any caller whose JWT role claim is not `admin`.
  - Product-image storage paths include a random suffix to prevent collision.

## Project Structure

```
tasara/
├── index.html              # Homepage (redirects logged-in users)
├── login.html              # Login (user + admin toggle, forgot-password panel)
├── signup.html             # Registration (buyer/seller; role set server-side)
├── setup.html              # First-admin claim (one-time; locks itself)
├── reset-password.html     # Password reset (renders only with valid recovery session)
├── dashboard.html          # Buyer/Seller dashboard
├── admin.html              # Admin dashboard
├── css/
│   ├── design-system.css   # Design tokens, components
│   └── pages.css           # Page-specific styles
├── js/
│   ├── config.js           # App configuration (ES module — loaded first by every page)
│   ├── supabase.js         # Client + data helpers + RPC callers (pinned v2.116.0)
│   ├── auth.js             # Authentication logic
│   ├── dashboard.js        # Dashboard shell + routing
│   ├── profile.js          # Profile edit & seller-change workflow
│   ├── admin.js            # Admin dashboard logic (event-delegated)
│   ├── products.js         # Product management (validated uploads)
│   └── ui.js               # Toasts, loading states, escaping helpers
├── supabase/
│   ├── schema.sql          # Full database schema (run once in SQL Editor)
│   └── functions/
│       └── send-email/     # Edge function for Resend (admin-gated, Deno.serve)
├── .env.example            # Environment variables template
├── .gitignore
├── .vercelignore
├── vercel.json             # Vercel deployment + security headers
└── README.md
```

## Quick Start

### 1. Set up Supabase

1. Create a project at https://supabase.com
2. Run `supabase/schema.sql` in the SQL Editor
3. Create two storage buckets:
   - `government-ids` (private)
   - `product-images` (public)
4. Create an Edge Function named `send-email` from `supabase/functions/send-email/index.ts`
5. Set environment variables in the Edge Function settings:
   - `RESEND_API_KEY` — your Resend API key
   - `ADMIN_EMAIL` — fallback admin email (real recipients resolved from DB)
6. Copy the project URL and publishable anon key

### 2. Migrate API keys (deadline: end of 2026)

Supabase is deprecating legacy `anon`/`service_role` keys. Create publishable + secret keys in **Dashboard → Settings → API Keys**, then update `js/config.js` with the new `sb_publishable_...` key and remove the old one from git history.

### 3. Configure

Copy `.env.example` to `.env` and fill in credentials, then update `js/config.js` directly (the file is in `.gitignore`).

### 4. Deploy

**Vercel (recommended):**
```bash
vercel deploy --prod
```
Or connect your GitHub repo to Vercel for automatic deployments. Set the following environment variables in Vercel (they are NOT sent to the client — only used at build/runtime if needed):
```
RESEND_API_KEY=...
ADMIN_EMAIL=...
TELEGRAM_COMMUNITY_URL=...
```

### 5. Create the first admin

1. Navigate to `/setup.html` on your deployed site
2. Fill in your name, email, and password, then submit
3. If email confirmation is enabled in Supabase Auth, check your inbox and confirm
4. Log in and return to `/setup.html` — you will see a **Claim Admin Role** button
5. Click it. The page permanently locks itself afterward

## Key Workflows

### Buyer Flow
Homepage → Sign Up → Email Verify → Dashboard → Profile → Edit (immediate) → Admin notified

### Seller Flow
Homepage → Sign Up → Select Tier + Upload ID → Email Verify → Dashboard (Pending Approval)
→ Admin Approves → Dashboard (Approved) → Edit Business (pending review) → Admin Reviews

### Seller Edit Workflow (Critical)
Seller edits → Save → `seller_change_requests` row created → Seller status → `pending-review`
→ Admin reviews diff (old → new) → Approve (applied server-side with column whitelist) or Reject

### Admin Setup (One-Time)
/setup.html → create auth account → email verify (if enabled) → log in → return to /setup.html → claim admin role → page locks permanently

## Design

- Premium dark theme with gold accents
- Glassmorphic cards and components
- Responsive: sidebar on desktop, hamburger menu on mobile
- Tier badges: Bronze, Silver, Gold, Platinum

## Deployment Checklist

- [ ] `schema.sql` run in Supabase SQL Editor
- [ ] Storage buckets created: `government-ids` (private), `product-images` (public)
- [ ] Edge Function `send-email` deployed with `RESEND_API_KEY` set
- [ ] `js/config.js` updated with real Supabase URL + publishable key
- [ ] `.gitignore` in place (config.js excluded)
- [ ] Vercel env vars set (if needed by build step)
- [ ] CORS origin in `vercel.json` headers matches your production domain
- [ ] Admin account created and claimed via `/setup.html`
- [ ] Legacy anon key replaced with publishable key (before end of 2026)
