// ============================================================
// TASARA — Admin Module
// ============================================================

import { getSupabase, getAllSellerProfiles, getAllBuyerProfiles, getAllPendingChangeRequests, getNotifications, markNotificationRead, markAllNotificationsRead, notifyUser } from './supabase.js';
import { getSessionUser } from './auth.js';
import { toast, formatDate, formatDateTime, getInitials, tierBadge, statusBadge } from './ui.js';
import { applySellerChanges, rejectSellerChange } from './profile.js';

// Admin dashboard stats
export async function loadAdminStats() {
  const { data: buyers, error: buyersError } = await getSupabase().from('profiles').select('id').eq('role', 'buyer');
  if (buyersError) throw buyersError;
  const { data: sellers, error: sellersError } = await getSupabase().from('profiles').select('id').eq('role', 'seller');
  if (sellersError) throw sellersError;
  const { data: pendingSellers, error: pendingError } = await getSupabase()
    .from('seller_profiles')
    .select('user_id')
    .in('approval_status', ['pending', 'pending-review']);
  if (pendingError) throw pendingError;
  const { data: pendingChanges, error: changesError } = await getSupabase()
    .from('seller_change_requests')
    .select('id')
    .eq('status', 'pending');
  if (changesError) throw changesError;

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

  // Values travel via data-* attributes, never via string-built onclick
  // arguments — this is what closes the stored-XSS hole.
  let actions = '';
  if (showActions && seller.approval_status === 'pending') {
    actions = `
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-primary btn-sm" type="button" data-action="approve-seller" data-user-id="${escHtml(seller.user_id)}" data-email="${escHtml(p?.email || '')}">✓ Approve</button>
        <button class="btn btn-danger btn-sm" type="button" data-action="reject-seller" data-user-id="${escHtml(seller.user_id)}" data-name="${escHtml(p?.full_name || 'this seller')}">✕ Reject</button>
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
          <a href="#" data-action="view-government-id" data-path="${escHtml(seller.government_id_path)}" style="font-size:0.813rem;">View ID</a>
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
async function approveSeller(userId, sellerEmail) {
  try {
    const { error } = await getSupabase()
      .from('seller_profiles')
      .update({ approval_status: 'approved' })
      .eq('user_id', userId);

    if (error) throw error;

    // Notify the seller via the security definer RPC (clients have no
    // INSERT policy on notifications).
    await notifyUser(
      userId,
      'seller_approved',
      'Seller Application Approved',
      'Your seller application has been approved. You can now use all seller features.'
    );

    // Email the seller (non-critical; the edge function verifies the
    // caller is an admin before honoring an arbitrary recipient).
    if (sellerEmail) {
      try {
        const { error: emailError } = await getSupabase().functions.invoke('send-email', {
          body: {
            to: sellerEmail,
            subject: 'Seller Application Approved — Tasara',
            template: 'seller_approved',
            data: {},
          },
        });
        if (emailError) throw emailError;
      } catch (e) {
        console.warn('Seller approval email failed (non-critical):', e);
      }
    }

    toast('Seller approved successfully!', 'success');
    loadSellerApplications();
    loadAdminStats();
  } catch (e) {
    toast(e.message || 'Failed to approve seller', 'error');
  }
}

// Reject a seller
async function rejectSeller(userId, sellerName) {
  if (!confirm(`Reject ${sellerName}'s seller application?`)) return;
  try {
    const { error } = await getSupabase()
      .from('seller_profiles')
      .update({ approval_status: 'rejected' })
      .eq('user_id', userId);

    if (error) throw error;

    await notifyUser(
      userId,
      'seller_rejected',
      'Seller Application Rejected',
      'Unfortunately, your seller application was not approved. Please contact support for more information.'
    );

    toast('Seller application rejected', 'warning');
    loadSellerApplications();
    loadAdminStats();
  } catch (e) {
    toast(e.message || 'Failed to reject seller', 'error');
  }
}

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
            <div style="font-size:0.75rem;color:var(--clr-text-dim);text-transform:uppercase;">${escHtml(label)}</div>
            <div class="change-old">${escHtml(String(oldValue))}</div>
          </div>
          <div class="change-arrow">→</div>
          <div>
            <div style="font-size:0.75rem;color:var(--clr-text-dim);text-transform:uppercase;">${escHtml(label)}</div>
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
            <div style="font-size:0.813rem;color:var(--clr-text-mid);">${escHtml(tier)} Seller · Submitted ${formatDateTime(req.submitted_at)}</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-primary btn-sm" type="button" data-action="approve-change" data-request-id="${escHtml(req.id)}">✓ Approve</button>
            <button class="btn btn-danger btn-sm" type="button" data-action="reject-change" data-request-id="${escHtml(req.id)}">✕ Reject</button>
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

window.adminApproveChange = async function (requestId) {
  try {
    await applySellerChanges(requestId);
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
        <button class="btn btn-danger btn-sm" type="button" data-action="deactivate-user" data-user-id="${escHtml(u.id)}">Deactivate</button>
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
        <button class="btn btn-danger btn-sm" type="button" data-action="deactivate-user" data-user-id="${escHtml(s.user_id)}">Deactivate</button>
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
      <div class="notification-item ${n.read ? '' : 'unread'}" data-action="read-notification" data-notification-id="${escHtml(n.id)}">
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

// Load products (admin view) — one query with the seller joined,
// no N+1 per seller.
export async function loadProducts() {
  const container = document.getElementById('products-list');
  if (!container) return;

  const { data: products, error } = await getSupabase()
    .from('products')
    .select('*, seller:profiles!products_profile_fkey(full_name)')
    .order('created_at', { ascending: false });
  if (error) {
    toast(error.message || 'Failed to load products', 'error');
    return;
  }

  let html = '';
  let lastSeller = null;

  for (const prod of (products || [])) {
    const sellerName = prod.seller?.full_name || 'Unknown';
    if (sellerName !== lastSeller) {
      html += `<h3 style="margin:24px 0 12px;">${escHtml(sellerName)}</h3>`;
      lastSeller = sellerName;
    }

    const imgHtml = prod.image_paths?.[0]
      ? `<img src="${escHtml(prod.image_paths[0])}" alt="${escHtml(prod.name)}" style="width:100%;height:100%;object-fit:cover;">`
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

  container.innerHTML = html || '<p style="color:var(--clr-text-mid);text-align:center;padding:40px 0;">No products yet.</p>';
}

// Deactivate account (admin action)
async function deactivateUser(userId, userName) {
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
}

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================
// Event delegation — ONE listener resolves every data-action button
// on the admin page. Rendered HTML carries only data-* attributes,
// so no user-controlled value is ever concatenated into JS.
// ============================================================
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  switch (action) {
    case 'approve-seller':
      approveSeller(el.dataset.userId, el.dataset.email || '');
      break;
    case 'reject-seller':
      rejectSeller(el.dataset.userId, el.dataset.name || 'this seller');
      break;
    case 'view-government-id':
      e.preventDefault();
      viewGovernmentId(el.dataset.path);
      break;
    case 'approve-change':
      window.adminApproveChange(el.dataset.requestId);
      break;
    case 'reject-change':
      window.adminRejectChange(el.dataset.requestId);
      break;
    case 'deactivate-user': {
      const name = el.closest('.card')?.querySelector('[style*="font-weight:600"]')?.textContent || 'this user';
      deactivateUser(el.dataset.userId, name);
      break;
    }
    case 'read-notification':
      markNotificationRead(el.dataset.notificationId)
        .then(() => loadNotifications())
        .catch(err => toast(err.message || 'Failed to mark read', 'error'));
      break;
  }
});

// Export for page scripts
window.adminLoadStats = loadAdminStats;
window.adminLoadApplications = loadSellerApplications;
window.adminLoadUsers = loadUsers;
window.adminLoadPendingChanges = loadPendingChangeRequests;
window.adminLoadNotifications = loadNotifications;
window.adminLoadProducts = loadProducts;
