-- ============================================================
-- TASARA — Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------
-- 1. PROFILES TABLE
-- ----------------------------------------------------------
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text not null,
  email text not null,
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
-- 7. TRIGGERS: updated_at
-- ----------------------------------------------------------
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at before update on profiles
  for each row execute function update_updated_at();

create trigger seller_profiles_updated_at before update on seller_profiles
  for each row execute function update_updated_at();

-- ----------------------------------------------------------
-- 8. TRIGGER: Create profile on signup
-- ----------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email, role, account_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'User'),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'buyer'),
    'active'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- NOTE: The trigger creates a default profile. The signup page
-- should update it with full details. This is a safety net.

-- ----------------------------------------------------------
-- 9. TRIGGER: Create notification on seller registration
-- ----------------------------------------------------------
create or replace function notify_new_seller()
returns trigger as $$
begin
  -- Find all admin users and insert notifications
  insert into public.notifications (recipient_id, type, title, message)
  select
    p.id,
    'new_seller_registration',
    'New Seller Registration',
    'New seller registration: ' || coalesce(up.full_name, 'A user') ||
    ' has registered as a ' || upper(new.tier) || ' seller.',
    false
  from profiles p
  join profiles up on up.id = new.user_id
  where p.role = 'admin';
  return new;
end;
$$ language plpgsql;

create trigger on_seller_profile_insert
  after insert on seller_profiles
  for each row execute function notify_new_seller();

-- ----------------------------------------------------------
-- 10. ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------

-- Enable RLS on all tables
alter table profiles enable row level security;
alter table seller_profiles enable row level security;
alter table products enable row level security;
alter table seller_change_requests enable row level security;
alter table notifications enable row level security;
alter table activity_logs enable row level security;

-- PROFILES policies
create policy "Users can view their own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users can update their own profile"
  on profiles for update using (auth.uid() = id);

create policy "Admins can view all profiles"
  on profiles for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admins can update any profile"
  on profiles for update using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- SELLER_PROFILES policies
create policy "Users can view their own seller profile"
  on seller_profiles for select using (auth.uid() = user_id);

create policy "Users can update their own seller profile"
  on seller_profiles for update using (auth.uid() = user_id);

create policy "Admins can view all seller profiles"
  on seller_profiles for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admins can update seller profiles"
  on seller_profiles for update using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- PRODUCTS policies
create policy "Sellers can manage their own products"
  on products for all using (auth.uid() = seller_id);

create policy "Admins can view all products"
  on products for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Anyone can view approved products"
  on products for select using (
    exists (select 1 from seller_profiles sp join profiles p on p.id = sp.user_id
      where sp.user_id = products.seller_id and sp.approval_status = 'approved' and p.account_status = 'active')
  );

-- SELLER_CHANGE_REQUESTS policies
create policy "Sellers can view their own change requests"
  on seller_change_requests for select using (auth.uid() = seller_id);

create policy "Sellers can create change requests"
  on seller_change_requests for insert with check (auth.uid() = seller_id);

create policy "Admins can view all change requests"
  on seller_change_requests for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admins can update change requests"
  on seller_change_requests for update using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- NOTIFICATIONS policies
create policy "Users can view their own notifications"
  on notifications for select using (auth.uid() = recipient_id);

create policy "Users can update their own notifications"
  on notifications for update using (auth.uid() = recipient_id);

create policy "Admins can view all notifications"
  on notifications for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admins can update all notifications"
  on notifications for update using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- ACTIVITY_LOGS policies
create policy "Admins can view activity logs"
  on activity_logs for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "System can insert activity logs"
  on activity_logs for insert with check (true);

-- ----------------------------------------------------------
-- 11. STORAGE BUCKETS
-- ----------------------------------------------------------
-- Create these buckets manually in Supabase Dashboard → Storage:
--   1. "government-ids" — Private bucket
--   2. "product-images" — Public bucket
--
-- Then run the policies below.
-- ----------------------------------------------------------

-- Helper function to extract owner UUID from file path
-- Upload paths are: "sellers/{user_id}/{timestamp}.{ext}"
-- Segment 1 = "sellers", Segment 2 = user_id
create or replace function get_owner_from_path(obj_name text)
returns uuid as $$
begin
  return split_part(obj_name, '/', 2)::uuid;
end;
$$ language plpgsql immutable;

-- Government IDs - Private bucket
-- Note: bucket must exist first. If bucket doesn't exist yet, these policies
-- will error on creation. Create the bucket in Dashboard → Storage first,
-- then re-run just the storage policies section.
create policy "Admins can view government IDs"
  on storage.objects for select
  using (
    bucket_id = 'government-ids' and
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Sellers can upload their own government ID"
  on storage.objects for insert
  with check (
    bucket_id = 'government-ids' and
    auth.uid()::text = split_part(name, '/', 2)
  );

create policy "Sellers can view their own government ID"
  on storage.objects for select
  using (
    bucket_id = 'government-ids' and
    auth.uid()::text = split_part(name, '/', 2)
  );

create policy "Admins can manage government IDs"
  on storage.objects for all
  using (
    bucket_id = 'government-ids' and
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Product Images - Public bucket
create policy "Anyone can view product images"
  on storage.objects for select
  using ( bucket_id = 'product-images' );

create policy "Sellers can upload product images"
  on storage.objects for insert
  with check ( bucket_id = 'product-images' );

create policy "Sellers can update their product images"
  on storage.objects for update
  using (
    bucket_id = 'product-images' and
    auth.uid()::text = split_part(name, '/', 2)
  );

create policy "Sellers can delete their product images"
  on storage.objects for delete
  using (
    bucket_id = 'product-images' and
    auth.uid()::text = split_part(name, '/', 2)
  );
