// ============================================================
// TASARA — Profile Module
// ============================================================

import { getSupabase, getSellerProfile } from './supabase.js';
import { toast } from './ui.js';

// Update buyer profile (immediate, no approval needed)
export async function updateBuyerProfile(userId, updates) {
  const { error } = await getSupabase()
    .from('profiles')
    .update(updates)
    .eq('id', userId);
  if (error) throw error;

  // Log activity
  await getSupabase().from('activity_logs').insert([{
    actor_id: userId,
    action: 'profile_updated',
    target_id: userId,
    description: `Profile updated by ${updates.full_name || 'the user'}`,
  }]);

  // Create admin notification
  await createAdminNotification(
    'buyer_profile_updated',
    'Buyer Profile Updated',
    `${updates.full_name || 'A buyer'} updated their account information.`
  );

  // Send admin email via edge function
  try {
    await getSupabase().functions.invoke('send-email', {
      body: JSON.stringify({
        to: 'admin@tasara.ng', // replace with real admin email
        subject: 'Buyer Profile Updated — Tasara',
        template: 'buyer-profile-updated',
        data: { name: updates.full_name },
      }),
    });
  } catch (e) {
    console.warn('Email send failed (non-critical):', e);
  }

  toast('Profile updated successfully!', 'success');
}

// Submit seller profile change request (enters pending review)
export async function submitSellerChangeRequest(userId, changes) {
  // Get current seller profile to capture old values
  const sellerProfile = await getSellerProfile(userId);
  if (!sellerProfile) throw new Error('Seller profile not found');

  // Create change request with old and new values
  const { data, error } = await getSupabase().from('seller_change_requests').insert([{
    seller_id: userId,
    changes: changes,
    old_values: extractOldValues(sellerProfile, changes),
    new_values: extractNewValues(changes),
    status: 'pending',
  }]).select().single();

  if (error) throw error;

  // Update seller status to pending review
  await getSupabase()
    .from('seller_profiles')
    .update({ approval_status: 'pending-review' })
    .eq('user_id', userId);

  // Log activity
  await getSupabase().from('activity_logs').insert([{
    actor_id: userId,
    action: 'seller_change_submitted',
    target_id: userId,
    description: `Seller submitted ${Object.keys(changes).length} change(s) for review`,
  }]);

  // Create admin notification
  await createAdminNotification(
    'seller_change_pending',
    'Seller Change Pending',
    `${sellerProfile.profiles?.full_name || 'A seller'} submitted ${Object.keys(changes).length} change(s) for review.`
  );

  // Send admin email
  try {
    await getSupabase().functions.invoke('send-email', {
      body: JSON.stringify({
        to: 'admin@tasara.ng',
        subject: 'Seller Change Pending — Tasara',
        template: 'seller-change-pending',
        data: { name: sellerProfile.profiles?.full_name },
      }),
    });
  } catch (e) {
    console.warn('Email send failed (non-critical):', e);
  }

  toast('Changes submitted for admin review', 'info');
  return data;
}

function extractOldValues(sellerProfile, changes) {
  const old = {};
  for (const key of Object.keys(changes)) {
    if (sellerProfile[key] !== undefined) old[key] = sellerProfile[key];
  }
  return old;
}

function extractNewValues(changes) {
  return { ...changes };
}

// Apply approved changes to seller profile
export async function applySellerChanges(changeRequestId, userId) {
  const { data: changeRequest, error: fetchError } = await getSupabase()
    .from('seller_change_requests')
    .select('new_values')
    .eq('id', changeRequestId)
    .single();

  if (fetchError) throw fetchError;
  if (!changeRequest) throw new Error('Change request not found');

  // Apply new values to seller profile
  const { error: updateError } = await getSupabase()
    .from('seller_profiles')
    .update(changeRequest.new_values)
    .eq('user_id', userId);

  if (updateError) throw updateError;

  // Mark change request as approved
  const { error: statusError } = await getSupabase()
    .from('seller_change_requests')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('id', changeRequestId);

  if (statusError) throw statusError;

  // Reset seller approval status back to approved
  await getSupabase()
    .from('seller_profiles')
    .update({ approval_status: 'approved' })
    .eq('user_id', userId);

  // Log activity
  await getSupabase().from('activity_logs').insert([{
    actor_id: userId,
    action: 'seller_changes_approved',
    target_id: userId,
    description: `Admin approved ${Object.keys(changeRequest.new_values).length} change(s) for seller`,
  }]);
}

// Reject a seller change request
export async function rejectSellerChange(changeRequestId) {
  const { error } = await getSupabase()
    .from('seller_change_requests')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
    .eq('id', changeRequestId);

  if (error) throw error;
}

// Create admin notification
async function createAdminNotification(type, title, message) {
  // Get admin user IDs
  const { data: admins, error } = await getSupabase()
    .from('profiles')
    .select('id')
    .eq('role', 'admin');

  if (error) throw error;

  if (admins.length > 0) {
    const notifications = admins.map(admin => ({
      recipient_id: admin.id,
      type,
      title,
      message,
      read: false,
    }));
    await getSupabase().from('notifications').insert(notifications);
  }
}
