// ============================================================
// TASARA — UI Helpers (Toast, Loading, etc.)
// ============================================================

// Toast notification system
function toast(message, type = 'info', title = null) {
  const container = document.getElementById('toast-container') || createToastContainer();
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  const toastEl = document.createElement('div');
  toastEl.className = `toast ${type}`;
  toastEl.innerHTML = `
    <span style="font-size:1.1rem">${icons[type] || icons.info}</span>
    <div>
      ${title ? `<div class="toast-title">${escHtml(title)}</div>` : ''}
      <div class="toast-message">${escHtml(message)}</div>
    </div>
  `;
  container.appendChild(toastEl);
  setTimeout(() => {
    toastEl.style.opacity = '0';
    toastEl.style.transform = 'translateX(100%)';
    toastEl.style.transition = 'all 0.3s ease';
    setTimeout(() => toastEl.remove(), 300);
  }, 4000);
}

function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'toast-container';
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

function escHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Loading state helper
function setLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Loading…';
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalText || btn.textContent;
  }
}

// Format date for display
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

// Get initials from name
function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// Tier badge HTML
function tierBadge(tierId) {
  const tier = CONFIG.TIERS.find(t => t.id === tierId);
  if (!tier) return '';
  return `<span class="badge badge-${tier.id}">${tier.icon} ${tier.name}</span>`;
}

// Status badge HTML
function statusBadge(status) {
  const map = {
    active:         { cls: 'badge-success', label: 'Active' },
    pending:        { cls: 'badge-warning', label: 'Pending' },
    approved:       { cls: 'badge-success', label: 'Approved' },
    rejected:       { cls: 'badge-danger', label: 'Rejected' },
    'pending-review': { cls: 'badge-warning', label: 'Pending Review' },
    deactivated:    { cls: '', label: 'Deactivated' },
  };
  const s = map[status] || { cls: 'badge-info', label: status };
  return `<span class="badge ${s.cls}">${s.label}</span>`;
}

// Role badge HTML
function roleBadge(role) {
  const map = { buyer: 'badge-info', seller: 'badge-gold', admin: 'badge-danger' };
  return `<span class="badge ${map[role] || 'badge-info'}">${role.toUpperCase()}</span>`;
}

// Mobile menu toggle — single source of truth
function toggleMobileMenu(open) {
  const overlay = document.getElementById('mobile-overlay');
  const nav = document.getElementById('mobile-nav');
  if (open === undefined) {
    // Toggle: check current state
    const isOpen = nav?.classList.contains('open');
    if (isOpen) {
      overlay?.classList.remove('open');
      nav?.classList.remove('open');
    } else {
      overlay?.classList.add('open');
      nav?.classList.add('open');
    }
  } else if (open) {
    overlay?.classList.add('open');
    nav?.classList.add('open');
  } else {
    overlay?.classList.remove('open');
    nav?.classList.remove('open');
  }
}

// Close mobile menu when clicking overlay
document.addEventListener('click', (e) => {
  const overlay = document.getElementById('mobile-overlay');
  const nav = document.getElementById('mobile-nav');
  if (e.target === overlay) toggleMobileMenu(false);
});

// Export all helpers
window.toast = toast;
window.setLoading = setLoading;
window.formatDate = formatDate;
window.formatDateTime = formatDateTime;
window.getInitials = getInitials;
window.tierBadge = tierBadge;
window.statusBadge = statusBadge;
window.roleBadge = roleBadge;
window.toggleMobileMenu = toggleMobileMenu;
