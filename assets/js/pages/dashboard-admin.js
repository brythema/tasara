import { getFirebaseServices } from '../firebase/firebase-client.js';
import { getCurrentProfile, observeAuth } from '../firebase/auth.js';
import { ROLES, SELLER_STATUSES } from '../firebase/constants.js';
import { observeSellers, decideSeller } from '../firebase/admin.js';
import { getSellerTier } from '../firebase/tiers.js';
import { saveSellerGovernmentId } from '../firebase/seller-documents.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
function showError(message) {
  const box = document.getElementById('adminError');
  if (box) { box.textContent = message; box.classList.add('show'); }
}
function clearError() { document.getElementById('adminError')?.classList.remove('show'); }

function render(sellers, services, reviewerUid) {
  const pending = sellers.filter(item => item.status === SELLER_STATUSES.PENDING);
  const decided = sellers.filter(item => item.status !== SELLER_STATUSES.PENDING).slice(0, 12);
  const approved = sellers.filter(item => item.status === SELLER_STATUSES.APPROVED);
  const rejected = sellers.filter(item => item.status === SELLER_STATUSES.REJECTED);
  const omni = approved.reduce((sum, item) => sum + getSellerTier(item.tier).omniIssued, 0);

  setText('statPending', pending.length);
  setText('statApproved', approved.length);
  setText('statRejected', rejected.length);
  setText('statOmni', omni);
  setText('pendingBadge', pending.length ? pending.length : '');
  document.title = pending.length ? `(${pending.length}) Pending sellers — TASARA Admin` : 'Admin console — TASARA';

  const pendingList = document.getElementById('pendingList');
  const pendingEmpty = document.getElementById('pendingEmpty');
  const decidedList = document.getElementById('decidedList');
  const decidedEmpty = document.getElementById('decidedEmpty');

  pendingEmpty.style.display = pending.length ? 'none' : 'block';
  pendingList.innerHTML = pending.map(item => {
    const tier = getSellerTier(item.tier);
    const fileAction = item.governmentIdPath
      ? `<button class="btn-save" data-save-id="${escapeHtml(item.id)}">Save ID</button>`
      : '<span class="missing-doc">ID not attached</span>';
    return `<div class="app-row" data-id="${escapeHtml(item.id)}">
      <div class="app-main">
        <div class="app-name">${escapeHtml(item.businessName || 'Unnamed')} <span style="color:rgba(242,238,227,0.5);font-weight:400;">— ${escapeHtml(item.name || 'Unknown')}</span></div>
        <div class="app-meta">${escapeHtml(item.businessLocation || '—')} · ${escapeHtml(item.email || '')}</div>
        <div class="app-tier">Tier ${tier.id} — ${escapeHtml(tier.name)} · ${escapeHtml(tier.stakeDisplay)} stake · ${escapeHtml(tier.omniDisplay)} Omni</div>
        <div class="app-doc">${escapeHtml(item.governmentIdName || 'Government ID')} ${fileAction}</div>
      </div>
      <div class="app-actions">
        <button class="btn-approve" data-action="approve" data-id="${escapeHtml(item.id)}">Approve</button>
        <button class="btn-reject" data-action="reject" data-id="${escapeHtml(item.id)}">Reject</button>
      </div>
    </div>`;
  }).join('');

  decidedEmpty.style.display = decided.length ? 'none' : 'block';
  decidedList.innerHTML = decided.map(item => {
    const tier = getSellerTier(item.tier);
    return `<div class="app-row"><div class="app-main"><div class="app-name">${escapeHtml(item.businessName || 'Unnamed')} <span style="color:rgba(242,238,227,0.5);font-weight:400;">— ${escapeHtml(item.name || 'Unknown')}</span></div><div class="app-meta">Tier ${tier.id} — ${escapeHtml(tier.name)}</div></div><span class="decision-tag decision-${escapeHtml(item.status)}">${item.status === SELLER_STATUSES.APPROVED ? 'Approved' : 'Rejected'}</span></div>`;
  }).join('');

  pendingList.onclick = async event => {
    const button = event.target.closest('button');
    if (!button) return;
    const id = button.dataset.id || button.dataset.saveId;
    clearError();
    try {
      if (button.dataset.saveId) {
        const seller = sellers.find(item => item.id === button.dataset.saveId);
        if (!seller?.governmentIdPath) throw new Error('No government-ID file is attached to this seller.');
        button.disabled = true;
        button.textContent = 'Preparing…';
        await saveSellerGovernmentId({ storage: services.storage, path: seller.governmentIdPath, filename: seller.governmentIdName || 'government-id' });
        button.textContent = 'Saved / opened';
        return;
      }
      const action = button.dataset.action;
      const status = action === 'approve' ? SELLER_STATUSES.APPROVED : SELLER_STATUSES.REJECTED;
      const label = action === 'approve' ? 'Approve' : 'Reject';
      if (!window.confirm(`${label} this Merchant Steward application?`)) return;
      button.disabled = true;
      button.textContent = 'Saving…';
      await decideSeller({ db: services.db, uid: id, status, reviewerUid });
    } catch (error) {
      console.error(error);
      showError(error.message || 'Admin action failed.');
      button.disabled = false;
      button.textContent = button.dataset.action === 'approve' ? 'Approve' : button.dataset.action === 'reject' ? 'Reject' : 'Save ID';
    }
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const services = getFirebaseServices();
    observeAuth(services, async user => {
      if (!user) return window.location.replace('login.html');
      const profile = await getCurrentProfile(services);
      if (!profile) return window.location.replace('login.html');
      if (profile.role !== ROLES.ADMIN) return window.location.replace(profile.role === ROLES.BUYER ? 'dashboard-buyer.html' : 'dashboard-seller.html');

      const token = await user.getIdTokenResult();
      if (token.claims.admin !== true) return window.location.replace('login.html');
      clearError();

      const unsubscribe = observeSellers({ db: services.db, pageSize: 100 }, sellers => render(sellers, services, user.uid), showError);
      window.addEventListener('pagehide', unsubscribe, { once: true });
    });
  } catch (error) {
    console.error(error);
    showError(error.message || 'Firebase is not connected yet.');
  }
});
