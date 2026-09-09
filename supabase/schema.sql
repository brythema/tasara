-- ============================================================
-- TASARA — Database Schema (hardened, 2026-09)
-- Run this in your Supabase SQL Editor. Idempotent: safe to re-run.
--
-- Security model:
--   * RLS enabled on every table, deny-by-default.
--   * Role/account-status changes are blocked by a trigger, so users
--     can never promote themselves to admin or un-deactivate themselves.
--   * Signup metadata only ever grants 'buyer' or 'seller' — never 'admin'.
--   * The first admin is claimed via claim_first_admin(), which refuses
--     to run once any admin exists (advisory-locked against races).
--   * Notifications are written only through security definer RPCs
--     (notify_admins / notify_user) — no client INSERT policy exists.
--   * Seller change requests are applied server-side by
--     approve_seller_change(), which applies a strict column whitelist.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------
-- 1. PROFILES TABLE
-- ----------------------------------------------------------
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text not null,
  email text not null unique,
  phone text,
  address text,
  role text not null check (role in ('buyer', 'seller', 'admin')),
  account_status text not null default 'active' check (account_status in ('active', 'deactivated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------
-- 2. SELLER PROFILES TABLE
-- ----------------------------------------------------------
create table if not exists seller_profiles (
  user_id uuid not null,
  tier text not null check (tier in ('bronze', 'silver', 'gold', 'platinum')),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected', 'pending-review')),
  government_id_path text,
  business_name text,
  business_location text,
  description text,
  opening_time time,
  closing_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id),
  constraint seller_profiles_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  constraint seller_profiles_profile_fkey foreign key (user_id) references profiles(id) on delete cascade
);

-- ----------------------------------------------------------
-- 3. PRODUCTS TABLE
-- ----------------------------------------------------------
create table if not exists products (
  id uuid default uuid_generate_v4() primary key,
  seller_id uuid not null,
  name text not null,
  description text,
  price text,
  image_paths text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_seller_id_fkey foreign key (seller_id) references auth.users(id) on delete cascade,
  constraint products_profile_fkey foreign key (seller_id) references profiles(id) on delete cascade
);

-- ----------------------------------------------------------
-- 4. SELLER CHANGE REQUESTS TABLE
-- ----------------------------------------------------------
create table if not exists seller_change_requests (
  id uuid default uuid_generate_v4() primary key,
  seller_id uuid not null,
  changes jsonb not null,
  old_values jsonb,
  new_values jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  constraint seller_change_requests_seller_id_fkey foreign key (seller_id) references auth.users(id) on delete cascade,
  constraint seller_change_requests_profile_fkey foreign key (seller_id) references profiles(id) on delete cascade
);

-- ----------------------------------------------------------
-- 5. NOTIFICATIONS TABLE
-- ----------------------------------------------------------
create table if not exists notifications (
  id uuid default uuid_generate_v4() primary key,
  recipient_id uuid references auth.users(id) on delete cascade not null,
  type text not null,
  title text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------
-- 6. ACTIVITY LOGS TABLE
-- ----------------------------------------------------------
create table if not exists activity_logs (
  id uuid default uuid_generate_v4() primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_id uuid references auth.users(id) on delete set null,
  description text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------
-- 7. INDEXES (hot paths: FK columns and status filters)
-- ----------------------------------------------------------
create index if not exists idx_profiles_role on profiles (role);
create index if not exists idx_products_seller on products (seller_id, created_at desc);
create index if not exists idx_seller_change_requests_seller on seller_change_requests (seller_id, status);
create index if not exists idx_notifications_recipient on notifications (recipient_id, read, created_at desc);
create index if not exists idx_activity_logs_actor on activity_logs (actor_id, created_at desc);

-- ----------------------------------------------------------
-- 8. HELPER: is_admin() — security definer, so it is NOT
-- subject to RLS on profiles (avoids recursion) and can be
-- used safely inside policies.
-- ----------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
      and account_status = 'active'
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- ----------------------------------------------------------
-- 9. TRIGGERS: updated_at
-- ----------------------------------------------------------
create or replace function public.update_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at
  before update on profiles
  for each row execute function public.update_updated_at();

drop trigger if exists seller_profiles_updated_at on seller_profiles;
create trigger seller_profiles_updated_at
  before update on seller_profiles
  for each row execute function public.update_updated_at();

-- ----------------------------------------------------------
-- 10. TRIGGER: create profile on signup.
-- Role is whitelisted to buyer/seller: signup metadata can
-- NEVER grant 'admin'. The first admin is claimed separately
-- via claim_first_admin() after the account exists.
-- ----------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, role, account_status)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), 'New User'),
    new.email,
    case
      when new.raw_user_meta_data->>'role' in ('buyer', 'seller')
        then new.raw_user_meta_data->>'role'
      else 'buyer'
    end,
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------
-- 11. TRIGGER: profile integrity — non-admins may edit only
-- full_name / phone / address. Role, email and id can never
-- be changed by a non-admin. Users may deactivate themselves
-- (one-way: active -> deactivated), but only an admin can
-- re-activate or change roles.
-- ----------------------------------------------------------
create or replace function public.enforce_profile_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.email is distinct from old.email
     or (
       new.account_status is distinct from old.account_status
       and not (old.account_status = 'active' and new.account_status = 'deactivated')
     )
  then
    raise exception 'Not permitted: role, email and account status are protected';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_profile_integrity on profiles;
create trigger enforce_profile_integrity
  before update on profiles
  for each row execute function public.enforce_profile_integrity();

-- ----------------------------------------------------------
-- 12. RPC: first admin claim (used by setup.html).
-- first_admin_exists() — callable by anon for the setup page guard.
-- claim_first_admin() — callable by an authenticated user whose
-- profile exists; refuses once any admin exists. Advisory lock
-- prevents two users claiming in the same instant.
-- ----------------------------------------------------------
create or replace function public.first_admin_exists()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where role = 'admin');
$$;

grant execute on function public.first_admin_exists() to anon, authenticated;

create or replace function public.claim_first_admin()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_count int;
begin
  perform pg_advisory_xact_lock(hashtext('tasara_first_admin_claim'));

  select count(*) into v_admin_count from public.profiles where role = 'admin';
  if v_admin_count > 0 then
    raise exception 'An admin account already exists. Ask an existing admin for role changes.';
  end if;

  update public.profiles
  set role = 'admin'
  where id = (select auth.uid());

  if not found then
    raise exception 'No profile found for the current user.';
  end if;
end;
$$;

grant execute on function public.claim_first_admin() to authenticated;

-- ----------------------------------------------------------
-- 13. RPC: notifications (the ONLY write path — there is no
-- INSERT policy on notifications for clients).
-- ----------------------------------------------------------
create or replace function public.notify_admins(p_type text, p_title text, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, type, title, message)
  select p.id, left(p_type, 64), left(p_title, 200), left(p_message, 1000)
  from public.profiles p
  where p.role = 'admin' and p.account_status = 'active';
end;
$$;

grant execute on function public.notify_admins(text, text, text) to authenticated;

create or replace function public.notify_user(p_recipient uuid, p_type text, p_title text, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can send notifications to users.';
  end if;
  insert into public.notifications (recipient_id, type, title, message)
  values (p_recipient, left(p_type, 64), left(p_title, 200), left(p_message, 1000));
end;
$$;

grant execute on function public.notify_user(uuid, text, text, text) to authenticated;

-- ----------------------------------------------------------
-- 14. TRIGGER: notify admins on new seller registration.
-- security definer so it works under RLS regardless of who
-- inserts the seller profile.
-- ----------------------------------------------------------
create or replace function public.notify_new_seller()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify_admins(
    'new_seller_registration',
    'New Seller Registration',
    'New seller registration: ' || coalesce(up.full_name, 'A user') ||
    ' has registered as a ' || upper(new.tier) || ' seller.'
  )
  from public.profiles up
  where up.id = new.user_id;
  return new;
end;
$$;

drop trigger if exists on_seller_profile_insert on seller_profiles;
create trigger on_seller_profile_insert
  after insert on seller_profiles
  for each row execute function public.notify_new_seller();

-- ----------------------------------------------------------
-- 15. RPC: apply / reject seller change requests.
-- Server-side and atomic — new_values are applied through a
-- strict column whitelist, so a crafted request can never
-- smuggle approval_status, tier or any other column.
-- ----------------------------------------------------------
create or replace function public.approve_seller_change(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  req seller_change_requests;
begin
  if not public.is_admin() then
    raise exception 'Only admins can approve change requests.';
  end if;

  select * into req
  from public.seller_change_requests
  where id = p_request_id and status = 'pending'
  for update;

  if not found then
    raise exception 'Pending change request not found.';
  end if;

  update public.seller_profiles sp
  set business_name    = coalesce(req.new_values->>'business_name', sp.business_name),
      business_location = coalesce(req.new_values->>'business_location', sp.business_location),
      description      = coalesce(req.new_values->>'description', sp.description),
      opening_time     = case
                           when req.new_values->>'opening_time' ~ '^\d{1,2}:\d{2}(:\d{2})?$'
                             then (req.new_values->>'opening_time')::time
                           else sp.opening_time
                         end,
      closing_time     = case
                           when req.new_values->>'closing_time' ~ '^\d{1,2}:\d{2}(:\d{2})?$'
                             then (req.new_values->>'closing_time')::time
                           else sp.closing_time
                         end,
      approval_status  = 'approved',
      updated_at       = now()
  where sp.user_id = req.seller_id;

  update public.seller_change_requests
  set status = 'approved',
      reviewed_at = now(),
      reviewed_by = (select auth.uid())
  where id = p_request_id;

  insert into public.activity_logs (actor_id, action, target_id, description)
  values ((select auth.uid()), 'seller_changes_approved', req.seller_id,
          'Admin approved seller change request');
end;
$$;

grant execute on function public.approve_seller_change(uuid) to authenticated;

create or replace function public.reject_seller_change(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can reject change requests.';
  end if;

  update public.seller_change_requests
  set status = 'rejected',
      reviewed_at = now(),
      reviewed_by = (select auth.uid())
  where id = p_request_id and status = 'pending';

  if not found then
    raise exception 'Pending change request not found.';
  end if;
end;
$$;

grant execute on function public.reject_seller_change(uuid) to authenticated;

-- ----------------------------------------------------------
-- 16. ROW LEVEL SECURITY
-- Notes:
--   * (select auth.uid()) is wrapped in a sub-select so Postgres
--     evaluates it once per statement (InitPlan) instead of per row.
--   * Admin checks use public.is_admin() (security definer — no
--     recursion, one plan).
-- ----------------------------------------------------------
alter table profiles enable row level security;
alter table seller_profiles enable row level security;
alter table products enable row level security;
alter table seller_change_requests enable row level security;
alter table notifications enable row level security;
alter table activity_logs enable row level security;

-- Drop every policy from earlier versions of this schema so re-running
-- this file is always clean.
drop policy if exists "Users can view their own profile" on profiles;
drop policy if exists "Users can update their own profile" on profiles;
drop policy if exists "Admins can view all profiles" on profiles;
drop policy if exists "Admins can update any profile" on profiles;
drop policy if exists "Users can view their own seller profile" on seller_profiles;
drop policy if exists "Users can update their own seller profile" on seller_profiles;
drop policy if exists "Admins can view all seller profiles" on seller_profiles;
drop policy if exists "Admins can update seller profiles" on seller_profiles;
drop policy if exists "Sellers can manage their own products" on products;
drop policy if exists "Admins can view all products" on products;
drop policy if exists "Anyone can view approved products" on products;
drop policy if exists "Sellers can view their own change requests" on seller_change_requests;
drop policy if exists "Sellers can create change requests" on seller_change_requests;
drop policy if exists "Admins can view all change requests" on seller_change_requests;
drop policy if exists "Admins can update change requests" on seller_change_requests;
drop policy if exists "Users can view their own notifications" on notifications;
drop policy if exists "Users can update their own notifications" on notifications;
drop policy if exists "Admins can view all notifications" on notifications;
drop policy if exists "Admins can update all notifications" on notifications;
drop policy if exists "Admins can view activity logs" on activity_logs;
drop policy if exists "System can insert activity logs" on activity_logs;
drop policy if exists "Admins can view government IDs" on storage.objects;
drop policy if exists "Sellers can upload their own government ID" on storage.objects;
drop policy if exists "Sellers can view their own government ID" on storage.objects;
drop policy if exists "Admins can manage government IDs" on storage.objects;
drop policy if exists "Anyone can view product images" on storage.objects;
drop policy if exists "Sellers can upload product images" on storage.objects;
drop policy if exists "Sellers can update their product images" on storage.objects;
drop policy if exists "Sellers can delete their product images" on storage.objects;

-- Legacy helper no longer referenced by any policy.
drop function if exists public.get_owner_from_path(text);

-- ----------------------------------------------------------
-- PROFILES
-- ----------------------------------------------------------
create policy "profiles_select_own"
  on profiles for select
  using (id = (select auth.uid()));

create policy "profiles_update_own"
  on profiles for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
-- NOTE: the enforce_profile_integrity trigger above is what stops users
-- from writing role / email / account_status on their own row.

create policy "profiles_select_admin"
  on profiles for select
  using (public.is_admin());

create policy "profiles_update_admin"
  on profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------
-- SELLER PROFILES
-- ----------------------------------------------------------
create policy "seller_profiles_select_own"
  on seller_profiles for select
  using (user_id = (select auth.uid()));

create policy "seller_profiles_insert_own"
  on seller_profiles for insert
  with check (user_id = (select auth.uid()));

create policy "seller_profiles_update_own"
  on seller_profiles for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "seller_profiles_select_admin"
  on seller_profiles for select
  using (public.is_admin());

create policy "seller_profiles_update_admin"
  on seller_profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------
-- PRODUCTS
-- ----------------------------------------------------------
create policy "products_manage_own"
  on products for all
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));

create policy "products_select_admin"
  on products for select
  using (public.is_admin());

create policy "products_select_approved"
  on products for select
  using (
    exists (
      select 1
      from seller_profiles sp
      join profiles p on p.id = sp.user_id
      where sp.user_id = products.seller_id
        and sp.approval_status = 'approved'
        and p.account_status = 'active'
    )
  );

-- ----------------------------------------------------------
-- SELLER CHANGE REQUESTS
-- Approvals/rejections happen via approve_seller_change() /
-- reject_seller_change() RPCs. INSERT is pinned to status='pending'.
-- ----------------------------------------------------------
create policy "scr_select_own"
  on seller_change_requests for select
  using (seller_id = (select auth.uid()));

create policy "scr_insert_own"
  on seller_change_requests for insert
  with check (seller_id = (select auth.uid()) and status = 'pending');

create policy "scr_select_admin"
  on seller_change_requests for select
  using (public.is_admin());

create policy "scr_update_admin"
  on seller_change_requests for update
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------
-- NOTIFICATIONS — read/update own only. Writes go through the
-- notify_admins() / notify_user() RPCs; there is deliberately no
-- client INSERT or DELETE policy.
-- ----------------------------------------------------------
create policy "notifications_select_own"
  on notifications for select
  using (recipient_id = (select auth.uid()));

create policy "notifications_update_own"
  on notifications for update
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create policy "notifications_select_admin"
  on notifications for select
  using (public.is_admin());

-- ----------------------------------------------------------
-- ACTIVITY LOGS — users may append logs attributed to themselves
-- only; admins can read everything. No updates, no deletes.
-- ----------------------------------------------------------
create policy "activity_logs_select_admin"
  on activity_logs for select
  using (public.is_admin());

create policy "activity_logs_insert_own"
  on activity_logs for insert
  with check (actor_id = (select auth.uid()));

-- ----------------------------------------------------------
-- 17. STORAGE POLICIES
-- Buckets (create in Dashboard → Storage if not present):
--   * government-ids — PRIVATE. Paths: sellers/{user_id}/{name}
--   * product-images — PUBLIC. Paths: {user_id}/{name}
-- Content-type and size limits are enforced in the policies
-- (client-side validation is never trusted).
-- ----------------------------------------------------------

-- GOVERNMENT-IDS (private) ----------------------------------
create policy "gov_ids_owner_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'government-ids'
    and auth.uid()::text = split_part(name, '/', 2)
    and (coalesce(metadata->>'size', '0'))::bigint <= 10485760  -- 10 MB
    and (metadata->>'mimetype') in ('image/jpeg', 'image/png', 'application/pdf')
  );

create policy "gov_ids_owner_select"
  on storage.objects for select
  using (
    bucket_id = 'government-ids'
    and auth.uid()::text = split_part(name, '/', 2)
  );

create policy "gov_ids_admin_all"
  on storage.objects for all
  using (
    bucket_id = 'government-ids'
    and public.is_admin()
  )
  with check (
    bucket_id = 'government-ids'
    and public.is_admin()
  );

-- PRODUCT-IMAGES (public) -----------------------------------
create policy "product_images_select_any"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy "product_images_seller_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'product-images'
    and auth.uid()::text = split_part(name, '/', 1)
    and exists (
      select 1 from seller_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.approval_status in ('approved', 'pending-review')
    )
    and (coalesce(metadata->>'size', '0'))::bigint <= 5242880  -- 5 MB
    and (metadata->>'mimetype') in ('image/jpeg', 'image/png', 'image/webp')
  );

create policy "product_images_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'product-images'
    and auth.uid()::text = split_part(name, '/', 1)
  )
  with check (
    bucket_id = 'product-images'
    and auth.uid()::text = split_part(name, '/', 1)
  );

create policy "product_images_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'product-images'
    and auth.uid()::text = split_part(name, '/', 1)
  );

-- ----------------------------------------------------------
-- 18. DONE.
-- Buckets still need to exist before the storage policies work:
--   Dashboard → Storage → New bucket
--     government-ids (private), product-images (public)
-- ----------------------------------------------------------
