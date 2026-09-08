// ============================================================
// TASARA — Supabase Client
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

let _supabase = null;

export function getSupabase() {
  if (!_supabase) {
    if (CONFIG.SUPABASE_URL === 'YOUR_SUPABASE_URL' || !CONFIG.SUPABASE_URL) {
      throw new Error('Supabase URL not configured. Edit js/config.js with your credentials.');
    }
    if (CONFIG.SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY' || !CONFIG.SUPABASE_ANON_KEY) {
      throw new Error('Supabase anon key not configured. Edit js/config.js with your credentials.');
    }
    _supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  }
  return _supabase;
}

export async function getSession() {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getCurrentUser() {
  const { data, error } = await getSupabase().auth.getUser();
  if (error) throw error;
  return data.user;
}

// Fetch the user's profile from profiles table
export async function getProfile(userId) {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

// Fetch the user's seller profile
export async function getSellerProfile(userId) {
  const { data, error } = await getSupabase()
    .from('seller_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw error;
  }
  return data;
}

// Fetch all seller profiles with joined profile data (admin)
export async function getAllSellerProfiles() {
  const { data, error } = await getSupabase()
    .from('seller_profiles')
    .select('*, profiles:user_id(full_name, email, phone, address)');
  if (error) throw error;
  return data || [];
}

// Fetch all buyer profiles (admin)
export async function getAllBuyerProfiles() {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('*')
    .eq('role', 'buyer');
  if (error) throw error;
  return data || [];
}

// Fetch products for a seller
export async function getProducts(sellerId) {
  const { data, error } = await getSupabase()
    .from('products')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Fetch pending change requests for a seller
export async function getPendingChangeRequests(sellerId) {
  const { data, error } = await getSupabase()
    .from('seller_change_requests')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('status', 'pending')
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Fetch all pending change requests with seller info (admin)
export async function getAllPendingChangeRequests() {
  const { data, error } = await getSupabase()
    .from('seller_change_requests')
    .select(`
      *,
      seller_profiles!seller_change_requests_profile_fkey (
        tier,
        user_id,
        profiles!seller_profiles_user_id_fkey(full_name, email)
      )
    `)
    .eq('status', 'pending')
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Fetch notifications for a user
export async function getNotifications(userId) {
  const { data, error } = await getSupabase()
    .from('notifications')
    .select('*')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Mark notification as read
export async function markNotificationRead(notificationId) {
  const { error } = await getSupabase()
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId);
  if (error) throw error;
}

// Mark all notifications as read
export async function markAllNotificationsRead(userId) {
  const { error } = await getSupabase()
    .from('notifications')
    .update({ read: true })
    .eq('recipient_id', userId);
  if (error) throw error;
}

// Upload file to Supabase Storage
export async function uploadFile(bucket, filePath, file) {
  const { data, error } = await getSupabase().storage
    .from(bucket)
    .upload(filePath, file, { upsert: true });
  if (error) throw error;
  return data;
}

// Get signed URL for private file (1 hour expiry)
export async function getSignedUrl(bucket, path) {
  const { data, error } = await getSupabase().storage
    .from(bucket)
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

// Get public URL for a storage file
export function getPublicUrl(bucket, path) {
  const { data, error } = getSupabase().storage
    .from(bucket)
    .getPublicUrl(path);
  if (error) throw error;
  return data?.publicUrl;
}
