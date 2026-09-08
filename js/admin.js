// ============================================================
// TASARA — Admin Module
// ============================================================

import { getSupabase, getAllSellerProfiles, getAllBuyerProfiles, getAllPendingChangeRequests, getProducts, getNotifications, markNotificationRead, markAllNotificationsRead } from './supabase.js';
import { getSessionUser } from './auth.js';
import { toast, formatDate, formatDateTime, getInitials, tierBadge, statusBadge } from './ui.js';
import { applySellerChanges, rejectSellerChange } from './profile.js';

// Admin dashboard stats
export async function loadAdminStats() {
  const { data: buyers } = await getSupabase().from('profiles').select('id').eq('role', 'buyer');
  const { data: sellers } = await getSupabase().from('profiles').select('id').eq('role', 'seller');
  const { data: pendingSellers } = await getSupabase()
    .from('seller_profiles')
    .select('id')
    .in('approval_status', ['pending', 'pending-review']);
  const { data: pendingChanges } = await getSupabase()
    .from('seller_change_requests')
    .select('id')
    .eq('status', 'pending');

  const stats = {
    totalUsers: (buyers?.length || 0) + (sellers?.length || 0),
    totalBuyers: buyers?.length || 0,
    totalSellers: sellers?.length || 0,
    pendingSellers: pendingSellers?.length || 0,
    pendingChanges: pendingChanges?.length || 0,
  };

  const el = (id) => document.getElementById(id);
  if (el('stat-total-users')) el('stat-total-users').textContent = stats.totalUsers;
  if (el('stat-total-buyers')) el('stat-total-buyers').textContent = stats.totalBuyers;
  if (el('stat-total-sellers')) el('stat-total-sellers').textContent = stats.totalSellers;
  if (el('stat-pending-sellers')) el('stat-pending-sellers').textContent = stats.pendingSellers;
  if (el('stat-pending-changes')) el('stat-pending-changes').textContent = stats.pendingChanges;
}

// Load seller applications list
export async function loadSellerApplications() {
  const container = document.getElementById('seller-applications-list');
  if (!container) return;

  const sellers = await getAllSellerProfiles();

  const pending = sellers.filter(s => s.approval_status === 'pending');
  const approved = sellers.filter(s => s.approval_status === 'approved');
  const rejected = sellers.filter(s => s.approval_status === 'rejected');

  container.innerHTML = '';

  if (sellers.length === 0) {
    container.innerHTML = '<p style="color:var(--clr-text-mid);text-align:center;padding:40px 0;">No seller registrations yet.</p>';
    return;
  }

  // Pending section
  if (pending.length > 0) {
    container.innerHTML += `<h3 style="margin:24px 0 12px;color:var(--clr-warning);">Pending (${pending.length})</h3>`;
    for (const s of pending) {
      container.innerHTML += renderSellerCard(s, true);
    }
  }

  // Approved section
  if (approved.length > 0) {
    container.innerHTML += `<h3 style="margin:24px 0 12px;color:var(--clr-success);">Approved (${approved.length})</h3>`;
    for (const s of approved) {
      container.innerHTML += renderSellerCard(s, false);
    }
  }

  // Rejected section
  if (rejected.length > 0) {
    container.innerHTML += `<h3 style="margin:24px 0 12px;color:var(--clr-danger);">Rejected (${rejected.length})</h3>`;
    for (const s of rejected) {
      container.innerHTML += renderSellerCard(s, false, true);
    }
  }
}

function renderSellerCard(seller, showActions, isRejected) {
  const p = seller.profiles;
  const initials = getInitials(p?.full_name || 'Unknown');
  const tierHtml = seller.tier ? tierBadge(seller.tier) : '';
  const statusHtml = statusBadge(seller.approval_status);

  let actions = '';
  if (showActions && seller.approval_status === 'pending') {
    actions = `
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-primary btn-sm" onclick="approveSeller('${seller.user_id}')">✓ Approve</button>
        <button class="btn btn-danger btn-sm" onclick="rejectSeller('${seller.user_id}', '${escHtml(p?.full_name || '')}')">✕ Reject</button>
      </div>
    `;
  }

  return `
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div class="avatar">${initials}</div>
        <div style="flex:1;">
          <div style="font-weight:700;font-size:1.063rem;">${escHtml(p?.full_name || 'Unknown')}</div>
          <div style="font-size:0.875rem;color:var(--clr-text-mid);">${escHtml(p?.email || '')}</div>
          <div style="font-size:0.813rem;color:var(--clr-text-dim);margin-top:2px;">
            ${escHtml(p?.phone || 'No phone')} · ${escHtml(p?.address || 'No address')}
          </div>
          <div style="display:flex;gap:8px;margin-top:8px;align-items:center;">
            ${tierHtml}
            ${statusHtml}
            <span style="font-size:0.75rem;color:var(--clr-text-dim);">Joined ${formatDate(p?.created_at)}</span>
          </div>
        </div>
        ${actions ? `<div>${actions}</div>` : ''}
      </div>
      ${seller.government_id_path ? `
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--clr-border);">
          <span style="font-size:0.813rem;color:var(--clr-text-mid);">Government ID: </span>
          <a href="#" onclick="viewGovernmentId('${seller.government_id_path}');return false;" style="font-size:0.813rem;">View ID</a>
        </div>
      ` : ''}
    </div>
  `;
}

async function viewGovernmentId(path) {
  try {
    const { getSignedUrl } = await import('./supabase.js');
    const url = await getSignedUrl('government-ids', path);
    window.open(url, '_blank');
  } catch (e) {
    toast('Failed to load government ID. Make sure the government-ids bucket exists.', 'error');
  }
}

// Approve a seller
window.approveSeller = async function (userId) {
  try {
    const { error } = await getSupabase()
      .from('seller_profiles')
      .update({ approval_status: 'approved' })
      .eq('user_id', userId);

    if (error) throw error;

    // Create notification for the seller
    await getSupabase().from('notifications').insert([{
      recipient_id: userId,
      type: 'seller_approved',
      title: 'Seller Application Approved',
      message: 'Your seller application has been approved. You can now use all seller features.',
      read: false,
    }]);

    toast('Seller approved successfully!', 'success');
    loadSellerApplications();
    loadAdminStats();
  } catch (e) {
    toast(e.message || 'Failed to approve seller', 'error');
  }
};

// Reject a seller
window.rejectSeller = async function (userId, sellerName) {
  if (!confirm(`Reject ${sellerName}'s seller application?`)) return;
  try {
    const { error } = await getSupabase()
      .from('seller_profiles')
      .update({ approval_status: 'rejected' })
      .eq('user_id', userId);

    if (error) throw error;

    // Notify seller
    await getSupabase().from('notifications').insert([{
      recipient_id: userId,
      type: 'seller_rejected',
      title: 'Seller Application Rejected',
      message: 'Unfortunately, your seller application was not approved. Please contact support for more information.',
      read: false,
    }]);

    toast('Seller application rejected', 'warning');
    loadSellerApplications();
    loadAdminStats();
  } catch (e) {
    toast(e.message || 'Failed to reject seller', 'error');
  }
};

// Load pending change requests
export async function loadPendingChangeRequests() {
  const container = document.getElementById('pending-changes-list');
  if (!container) return;

  const requests = await getAllPendingChangeRequests();
  container.innerHTML = '';

  if (requests.length === 0) {
    container.innerHTML = '<p style="color:var(--clr-text-mid);text-align:center;padding:40px 0;">No pending changes.</p>';
    return;
  }

  for (const req of requests) {
    const sp = req.seller_profiles;
    const sellerName = sp?.profiles?.full_name || 'Unknown';
    const tier = sp?.tier || 'Unknown';

    const changes = req.changes || {};
    const oldValues = req.old_values || {};

    let changesHtml = '';
    for (const [key, newValue] of Object.entries(changes)) {
      const oldValue = oldValues[key] ?? '(empty)';
      const label = formatChangeLabel(key);
      changesHtml += `
        <div class="change-item">
          <div>
            <div style="font-size:0.75rem;color:var(--clr-text-dim);text-transform:uppercase;">${label}</div>
            <div class="change-old">${escHtml(String(oldValue))}</div>
          </div>
          <div class="change-arrow">→</div>
          <div>
            <div style="font-size:0.75rem;color:var(--clr-text-dim);text-transform:uppercase;">${label}</div>
            <div class="change-new">${escHtml(String(newValue))}</div>
          </div>
        </div>
      `;
    }

    container.innerHTML += `
      <div class="change-request">
        <div class="change-request-header">
          <div>
            <div style="font-weight:700;">${escHtml(sellerName)}</div>
            <div style="font-size:0.813rem;color:var(--clr-text-mid);">${tier} Seller · Submitted ${formatDateTime(req.submitted_at)}</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-primary btn-sm" onclick="adminApproveChange('${req.id}', '${req.seller_id}')">✓ Approve</button>
            <button class="btn btn-danger btn-sm" onclick="adminRejectChange('${req.id}')">✕ Reject</button>
          </div>
        </div>
        ${changesHtml}
      </div>
    `;
  }
}

function formatChangeLabel(key) {
  const labels = {
    full_name: 'Full Name',
    phone: 'Phone',
    address: 'Address',
    business_name: 'Business Name',
    business_location: 'Location',
    description: 'Description',
    opening_time: 'Opening Time',
    closing_time: 'Closing Time',
  };
  return labels[key] || key;
}

window.adminApproveChange = async function (requestId, sellerId) {
  try {
    await applySellerChanges(requestId, sellerId);
    toast('Changes approved!', 'success');
    loadPendingChangeRequests();
    loadAdminStats();
  } catch (e) {
    toast(e.message || 'Failed to approve changes', 'error');
  }
};

window.adminRejectChange = async function (requestId) {
  try {
    await rejectSellerChange(requestId);
    toast('Changes rejected', 'warning');
    loadPendingChangeRequests();
    loadAdminStats();
  } catch (e) {
    toast(e.message || 'Failed to reject changes', 'error');
  }
};

// Load users list
export async function loadUsers() {
  const container = document.getElementById('users-list');
  if (!container) return;

  const [buyers, sellers] = await Promise.all([
    getAllBuyerProfiles(),
    getAllSellerProfiles(),
  ]);

  let html = '<h3 style="margin-bottom:12px;">Buyers (' + buyers.length + ')</h3>';
  for (const u of buyers) {
    html += `
      <div class="card" style="margin-bottom:8px;padding:16px;display:flex;align-items:center;gap:12px;">
        <div class="avatar avatar-sm">${getInitials(u.full_name)}</div>
        <div style="flex:1;">
          <div style="font-weight:600;">${escHtml(u.full_name)}</div>
          <div style="font-size:0.813rem;color:var(--clr-text-mid);">${escHtml(u.email)}</div>
        </div>
        ${statusBadge(u.account_status)}
        <button class="btn btn-danger btn-sm" onclick="deactivateAccount('${u.id}', '${escHtml(u.full_name)}')">Deactivate</button>
      </div>
    `;
  }

  html += '<h3 style="margin:24px 0 12px;">Sellers (' + sellers.length + ')</h3>';
  for (const s of sellers) {
    html += `
      <div class="card" style="margin-bottom:8px;padding:16px;display:flex;align-items:center;gap:12px;">
        <div class="avatar avatar-sm">${getInitials(s.profiles?.full_name || '?')}</div>
        <div style="flex:1;">
          <div style="font-weight:600;">${escHtml(s.profiles?.full_name || '?')}</div>
          <div style="font-size:0.813rem;color:var(--clr-text-mid);">${escHtml(s.profiles?.email || '')}</div>
        </div>
        ${s.tier ? tierBadge(s.tier) : ''}
        ${statusBadge(s.approval_status)}
        <button class="btn btn-danger btn-sm" onclick="deactivateAccount('${s.user_id}', '${escHtml(s.profiles?.full_name || '?')}')">Deactivate</button>
      </div>
    `;
  }

  container.innerHTML = html;
}

// Load notifications
export async function loadNotifications() {
  const container = document.getElementById('notifications-list');
  if (!container) return;

  const { user } = await getSessionUser();
  if (!user) return;

  const notifications = await getNotifications(user.id);

  container.innerHTML = '';

  if (notifications.length === 0) {
    container.innerHTML = '<p style="color:var(--clr-text-mid);text-align:center;padding:40px 0;">No notifications.</p>';
    return;
  }

  for (const n of notifications) {
    const icons = {
      new_seller_registration: '🆕',
      buyer_profile_updated: '👤',
      seller_change_pending: '🔄',
      seller_approved: '✓',
      seller_rejected: '✕',
      account_deactivated: '⚠',
    };
    container.innerHTML += `
      <div class="notification-item ${n.read ? '' : 'unread'}" onclick="readNotification('${n.id}')">
        <div class="notification-icon">${icons[n.type] || '🔔'}</div>
        <div class="notification-body">
          <div class="notification-title">${escHtml(n.title)}</div>
          <div class="notification-message">${escHtml(n.message)}</div>
          <div class="notification-time">${formatDateTime(n.created_at)}</div>
        </div>
      </div>
    `;
  }
}

// Load products (admin view)
export async function loadProducts() {
  const container = document.getElementById('products-list');
  if (!container) return;

  const { data: sellers } = await getSupabase()
    .from('seller_profiles')
    .select('user_id, profiles:user_id(full_name)');

  let html = '';
  for (const seller of (sellers || [])) {
    const products = await getProducts(seller.user_id);
    if (products.length === 0) continue;

    html += `<h3 style="margin:24px 0 12px;">${escHtml(seller.profiles?.full_name || 'Unknown')}</h3>`;
    for (const prod of products) {
      const imgHtml = prod.image_paths?.[0]
        ? `<img src="${escHtml(prod.image_paths[0])}" style="width:100%;height:100%;object-fit:cover;">`
        : '<span style="color:var(--clr-text-dim);">📷</span>';

      html += `
        <div class="card" style="margin-bottom:12px;display:flex;gap:16px;align-items:center;">
          <div style="width:80px;height:60px;background:var(--clr-surface-2);border-radius:var(--r-md);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
            ${imgHtml}
          </div>
          <div style="flex:1;">
            <div style="font-weight:700;">${escHtml(prod.name)}</div>
            <div style="font-size:0.813rem;color:var(--clr-text-mid);">${escHtml(prod.description || '')}</div>
            <div style="font-size:0.938rem;color:var(--clr-primary);font-weight:700;margin-top:4px;">${escHtml(prod.price || '')}</div>
          </div>
          <div style="font-size:0.75rem;color:var(--clr-text-dim);">${formatDate(prod.created_at)}</div>
        </div>
      `;
    }
  }

  container.innerHTML = html || '<p style="color:var(--clr-text-mid);text-align:center;padding:40px 0;">No products yet.</p>';
}

// Deactivate account (admin action) — userId first, then userName for confirm message
window.deactivateAccount = async function (userId, userName) {
  if (!confirm(`Deactivate ${userName}'s account? They will no longer be able to log in.`)) return;
  try {
    const { error } = await getSupabase()
      .from('profiles')
      .update({ account_status: 'deactivated' })
      .eq('id', userId);
    if (error) throw error;
    toast('Account deactivated', 'warning');
    loadUsers();
    loadAdminStats();
  } catch (e) {
    toast(e.message || 'Failed to deactivate', 'error');
  }
};

function escHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Export for page scripts
window.adminLoadStats = loadAdminStats;
window.adminLoadApplications = loadSellerApplications;
window.adminLoadUsers = loadUsers;
window.adminLoadPendingChanges = loadPendingChangeRequests;
window.adminLoadNotifications = loadNotifications;
window.adminLoadProducts = loadProducts;
