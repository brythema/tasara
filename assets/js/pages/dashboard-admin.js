/* ============================================================
   TASARA admin register - live data binding
   Fed by Firestore through the sibling firebase modules.
   Presentation, ids and class names are unchanged from the
   approved design; only the data source changed.
   ============================================================ */
import { getFirebaseServices } from '../firebase/firebase-client.js';
import { getCurrentProfile, observeAuth } from '../firebase/auth.js';
import { ROLES, SELLER_STATUSES, formatAccountNumber } from '../firebase/constants.js';
import { observeBuyers, observeSellers, decideSeller, deleteAccount } from '../firebase/admin.js';
import { saveSellerGovernmentId } from '../firebase/seller-documents.js';
import { getSellerTier } from '../firebase/tiers.js';

/* ---------- small helpers ---------- */
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = n => String(n || '').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const isSeller = r => r._role === 'seller';
const tierOf = r => { try { return r && r.tier ? getSellerTier(r.tier) : null; } catch (_) { return null; } };
const byCreated = (a, b) => String(a.createdAt || '') < String(b.createdAt || '') ? -1 : 1;

/* Firestore Timestamps, ISO strings and Dates all arrive here. */
function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') { const d = value.toDate(); return isNaN(d) ? null : d; }
  if (value instanceof Date) return isNaN(value) ? null : value;
  const d = new Date(value);
  return isNaN(d) ? null : d;
}
function fmtDateTime(value) {
  const d = toDate(value);
  if (!d) return 'Not recorded';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' +
         d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function statusInfo(r) {
  if (!isSeller(r)) return { cls: 'decision-approved', text: 'Active' };
  return { cls: 'decision-' + r.status, text: String(r.status || '').charAt(0).toUpperCase() + String(r.status || '').slice(1) };
}

/* ---------- state ---------- */
const state = { view: 'all', q: '', status: '', tier: '', sort: 'account', recordId: null };
let RECORDS = [];
let services = null;
let pendingDeleteId = null;
let lastFocus = null;
let toastTimer = null;

const allRecords = () => RECORDS;
const viewTotal = () => state.view === 'buyers' ? countRole('buyer') : state.view === 'sellers' ? countRole('seller') : RECORDS.length;
const countRole = role => RECORDS.filter(r => r._role === role).length;
const viewWord = () => state.view === 'all' ? 'accounts' : state.view === 'buyers' ? 'buyers' : 'sellers';

/* ---------- icons (one family, consistent 1.6-1.8 stroke) ---------- */
const ICON = {
  eye: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>',
  download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="M8 11l4 4 4-4"/><path d="M4 20h16"/></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>',
  back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>'
};

/* ---------- error banner ---------- */
function showError(msg) { const box = $('adminError'); box.textContent = msg; box.classList.add('show'); }
function clearError() { const box = $('adminError'); box.classList.remove('show'); box.textContent = ''; }

/* ---------- filtering / sorting ---------- */
function visible() {
  let rows = RECORDS;
  if (state.view === 'buyers') rows = rows.filter(r => r._role === 'buyer');
  if (state.view === 'sellers') rows = rows.filter(r => r._role === 'seller');

  const q = state.q.trim().toLowerCase();
  if (q) rows = rows.filter(r => [r.name, r.email, r.phone, r.address, r.businessName, r.businessLocation].filter(Boolean).join(' ').toLowerCase().includes(q));
  if (state.status) rows = rows.filter(r => isSeller(r) && r.status === state.status);
  if (state.tier) rows = rows.filter(r => isSeller(r) && String(r.tier) === state.tier);

  return rows.slice().sort((a, b) => {
    if (state.sort === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
    if (state.sort === 'newest') return byCreated(b, a);
    if (state.sort === 'oldest') return byCreated(a, b);
    const an = Number(a.accountNumber), bn = Number(b.accountNumber);
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
    return byCreated(a, b);
  });
}

/* ---------- stats ---------- */
function renderStats() {
  const sellers = RECORDS.filter(r => r._role === 'seller');
  const approved = sellers.filter(s => s.status === SELLER_STATUSES.APPROVED);
  const omni = approved.reduce((n, s) => n + (tierOf(s) ? tierOf(s).omniIssued : 0), 0);
  $('statTotal').textContent = RECORDS.length;
  $('statPending').textContent = sellers.filter(s => s.status === SELLER_STATUSES.PENDING).length;
  $('statApproved').textContent = approved.length;
  $('statOmni').textContent = omni.toLocaleString('en-GB');
  $('cAll').textContent = RECORDS.length;
  $('cBuyers').textContent = countRole('buyer');
  $('cSellers').textContent = countRole('seller');
}

/* ---------- register list ---------- */
function rosterRow(r) {
  const st = statusInfo(r);
  const rolePill = isSeller(r)
    ? `<span class="decision-tag decision-seller">Tier ${esc(String(r.tier))}</span>`
    : `<span class="decision-tag decision-buyer">Buyer</span>`;
  const place = isSeller(r) ? (r.businessLocation || r.address) : r.address;
  const sub = isSeller(r) ? r.businessName : 'Buyer account';
  return `<div class="app-row reg-row" data-id="${esc(r.id)}">
    <div class="reg-ord reg-cell" data-label="Account #">${esc(formatAccountNumber(r.accountNumber))}</div>
    <div class="app-main reg-cell" data-label="Person">
      <div class="app-name">${esc(r.name)}</div>
      <div class="app-meta reg-clamp1" title="${esc(sub)}">${esc(sub)}</div>
    </div>
    <div class="reg-cell cell-contact" data-label="Contact">
      <div class="app-meta reg-clamp1" title="${esc(r.email)}">${esc(r.email)}</div>
      <div class="app-meta reg-num">${esc(r.phone)}</div>
    </div>
    <div class="reg-cell cell-place" data-label="Location"><div class="app-meta reg-clamp" title="${esc(place)}">${esc(place)}</div></div>
    <div class="reg-cell cell-role" data-label="Role">${rolePill}</div>
    <div class="reg-cell cell-status" data-label="Status"><span class="decision-tag ${st.cls}">${esc(st.text)}</span></div>
    <div class="reg-cell cell-joined" data-label="Signed up"><div class="app-meta reg-num">${esc(fmtDateTime(r.createdAt))}</div></div>
    <div class="app-actions reg-actions">
      <button class="reg-icon" type="button" data-act="view" data-id="${esc(r.id)}" aria-label="Open record for ${esc(r.name)}" title="Open record">${ICON.eye}</button>
      <button class="reg-icon" type="button" data-act="download" data-id="${esc(r.id)}" aria-label="Download CSV for ${esc(r.name)}" title="Download CSV">${ICON.download}</button>
      <button class="reg-icon danger" type="button" data-act="delete" data-id="${esc(r.id)}" aria-label="Delete ${esc(r.name)}" title="Delete account">${ICON.trash}</button>
    </div>
  </div>`;
}
function renderRoster() {
  const rows = visible();
  const total = viewTotal();
  $('regBadge').textContent = rows.length;
  $('rowCount').innerHTML = `Showing <b>${rows.length}</b> of <b>${total}</b> ${viewWord()}`;
  const list = $('rosterList');
  if (rows.length) {
    $('rosterEmpty').style.display = 'none';
    list.innerHTML = rows.map(rosterRow).join('');
  } else {
    list.innerHTML = '';
    const empty = $('rosterEmpty');
    empty.style.display = 'block';
    empty.textContent = total > 0
      ? 'Nothing matches these filters. Clear the search or status filter to see all ' + total + '.'
      : 'No accounts have registered yet.';
  }
  const sellerTab = state.view === 'sellers';
  $('statusFilter').disabled = !sellerTab;
  $('tierFilter').disabled = !sellerTab;
  $('statusFilter').title = sellerTab ? 'Applies to sellers' : 'Sellers only. Switch to the Sellers tab.';
  $('tierFilter').title = sellerTab ? 'Applies to sellers' : 'Sellers only. Switch to the Sellers tab.';
  if (!sellerTab) { state.status = ''; state.tier = ''; $('statusFilter').value = ''; $('tierFilter').value = ''; }
}

/* ---------- pending / decisions panels ---------- */
function renderPending() {
  const pending = RECORDS.filter(r => r._role === 'seller' && r.status === SELLER_STATUSES.PENDING).slice().sort(byCreated);
  $('pendingBadge').textContent = pending.length;
  $('pendingEmpty').style.display = pending.length ? 'none' : 'block';
  $('pendingList').innerHTML = pending.map(r => `<div class="app-row" data-id="${esc(r.id)}">
    <div class="app-main">
      <div class="app-name">${esc(r.businessName || 'Unnamed')} <span style="color:rgba(242,238,227,0.5);font-weight:400;">- ${esc(r.name)}</span></div>
      <div class="app-meta">${esc(formatAccountNumber(r.accountNumber))} &middot; ${esc(r.businessLocation || '-')} &middot; ${esc(r.email)}</div>
      <div class="app-tier">Tier ${esc(String(r.tier))} ${esc(tierOf(r) ? tierOf(r).name : '')} &middot; ${esc(tierOf(r) ? tierOf(r).stakeDisplay : '')} stake &middot; ${esc(tierOf(r) ? tierOf(r).omniDisplay : '')} Omni</div>
      <div class="app-doc">${esc(r.governmentIdName || 'Government ID')}
        ${r.governmentIdName ? `<button class="btn-save" type="button" data-act="idfile" data-id="${esc(r.id)}">Save ID</button>` : '<span class="missing-doc">ID not attached</span>'}
      </div>
    </div>
    <div class="app-actions">
      <button class="btn-save" type="button" data-act="view" data-id="${esc(r.id)}">Open</button>
      <button class="btn-approve" type="button" data-act="approve" data-id="${esc(r.id)}">Approve</button>
      <button class="btn-reject" type="button" data-act="reject" data-id="${esc(r.id)}">Reject</button>
    </div>
  </div>`).join('');
}
function renderDecided() {
  const decided = RECORDS.filter(r => r._role === 'seller' && r.status !== SELLER_STATUSES.PENDING)
    .slice().sort((a, b) => byCreated(b, a)).slice(0, 12);
  $('decidedEmpty').style.display = decided.length ? 'none' : 'block';
  $('decidedList').innerHTML = decided.map(r => `<div class="app-row" data-id="${esc(r.id)}">
    <div class="app-main">
      <div class="app-name">${esc(r.businessName || 'Unnamed')} <span style="color:rgba(242,238,227,0.5);font-weight:400;">- ${esc(r.name)}</span></div>
      <div class="app-meta">${esc(formatAccountNumber(r.accountNumber))} &middot; Tier ${esc(String(r.tier))} ${esc(tierOf(r) ? tierOf(r).name : '')} &middot; signed up ${esc(fmtDateTime(r.createdAt))}</div>
    </div>
    <div class="app-actions">
      <span class="decision-tag ${r.status === SELLER_STATUSES.APPROVED ? 'decision-approved' : 'decision-rejected'}">${r.status === SELLER_STATUSES.APPROVED ? 'Approved' : 'Rejected'}</span>
      <button class="btn-save" type="button" data-act="view" data-id="${esc(r.id)}">Open</button>
    </div>
  </div>`).join('');
}

/* ---------- full-page record ---------- */
function renderRecord() {
  const host = $('recordView');
  const r = allRecords().find(x => x.id === state.recordId);
  if (!r) {
    state.recordId = null; host.hidden = true; host.innerHTML = '';
    $('consoleView').hidden = false; $('adminHero').hidden = false;
    return;
  }
  const t = tierOf(r);
  const st = statusInfo(r);
  const scope = r._role === 'buyer' ? 'Buyers' : 'Sellers';

  const profilePanel = isSeller(r) ? `
    <div class="admin-panel">
      <h3>Business</h3>
      <dl class="rec-kv">
        <dt>Business name</dt><dd>${esc(r.businessName)}</dd>
        <dt>Business location</dt><dd>${esc(r.businessLocation)}</dd>
        <dt>Registered address</dt><dd>${esc(r.address)}</dd>
      </dl>
    </div>` : `
    <div class="admin-panel">
      <h3>Profile</h3>
      <dl class="rec-kv">
        <dt>Address</dt><dd>${esc(r.address)}</dd>
        <dt>Account type</dt><dd>Buyer. Active immediately, no tier.</dd>
      </dl>
    </div>`;

  const standingPanel = isSeller(r) ? `
    <div class="admin-panel">
      <h3>Standing</h3>
      <div class="rec-badges" style="margin:0 0 16px">
        <span class="decision-tag decision-seller">Tier ${esc(String(r.tier))}</span>
        <span class="decision-tag ${st.cls}">${esc(st.text)}</span>
      </div>
      <dl class="rec-kv">
        <dt>Tier name</dt><dd>${esc(t ? t.name : '')}</dd>
        <dt>Stake</dt><dd class="reg-num">${esc(t ? t.stakeDisplay : '')}</dd>
        <dt>Omni issued</dt><dd class="reg-num">${esc(t ? t.omniDisplay : '')}</dd>
        <dt>Scope</dt><dd>${esc(t ? t.scope : '')}</dd>
      </dl>
    </div>
    <div class="admin-panel">
      <h3>Documents</h3>
      ${r.governmentIdName
        ? `<dl class="rec-kv">
             <dt>File</dt><dd>${esc(r.governmentIdName)}</dd>
             <dt>Type</dt><dd>${esc(r.governmentIdType || 'Government ID')}</dd>
             <dt>Stored at</dt><dd class="reg-num">${esc(r.governmentIdPath || '')}</dd>
           </dl>
           <div class="app-actions" style="justify-content:flex-start;margin-top:16px">
             <button class="btn-save" type="button" data-act="idfile" data-id="${esc(r.id)}">Save ID file</button>
           </div>`
        : `<div class="rec-note-box">No government ID is attached to this application.</div>`}
    </div>` : `
    <div class="admin-panel">
      <h3>Standing</h3>
      <div class="rec-badges" style="margin:0 0 12px">
        <span class="decision-tag decision-approved">Active</span>
        <span class="decision-tag decision-buyer">No tier</span>
      </div>
      <div class="reg-hint">Buyer accounts are active immediately after registration and carry no tier.</div>
    </div>`;

  const reviewPanel = (isSeller(r) && r.status === SELLER_STATUSES.PENDING) ? `
    <div class="admin-panel">
      <h3>Review decision</h3>
      <div class="app-actions" style="justify-content:flex-start">
        <button class="btn-approve" type="button" data-act="approve" data-id="${esc(r.id)}">Approve</button>
        <button class="btn-reject" type="button" data-act="reject" data-id="${esc(r.id)}">Reject</button>
      </div>
    </div>` : '';

  host.innerHTML = `
    <div class="rec-bar">
      <button class="btn-save" type="button" id="backBtn">${ICON.back} Back to register</button>
      <div class="rec-crumbs">Register / ${esc(scope)} / <b>${esc(r.name)}</b></div>
    </div>

    <div class="admin-panel rec-head">
      <div class="rec-id">
        <span class="rec-avatar" aria-hidden="true">${esc(initials(r.name))}</span>
        <div>
          <h3 id="recordHeading" tabindex="-1">${esc(r.name)}</h3>
          <div class="app-meta">${esc(isSeller(r) ? r.businessName : 'Buyer account')} &middot; Account ${esc(formatAccountNumber(r.accountNumber))}</div>
          <div class="rec-badges">
            <span class="decision-tag ${isSeller(r) ? 'decision-seller' : 'decision-buyer'}">${isSeller(r) ? 'Seller' : 'Buyer'}</span>
            ${isSeller(r) ? `<span class="decision-tag decision-seller">Tier ${esc(String(r.tier))}</span>` : ''}
            <span class="decision-tag ${st.cls}">${esc(st.text)}</span>
          </div>
        </div>
      </div>
      <div class="app-actions">
        <button class="btn-save" type="button" data-act="csv" data-id="${esc(r.id)}">Download CSV</button>
        <button class="btn-save" type="button" data-act="json" data-id="${esc(r.id)}">Download JSON</button>
        <button class="btn-save" type="button" data-act="copy" data-id="${esc(r.id)}">Copy details</button>
      </div>
    </div>

    <div class="rec-grid">
      <div class="rec-col">
        <div class="admin-panel">
          <h3>Identity</h3>
          <dl class="rec-kv">
            <dt>Account #</dt><dd class="big">${esc(formatAccountNumber(r.accountNumber))}</dd>
            <dt>Full name</dt><dd>${esc(r.name)}</dd>
            <dt>Email</dt><dd>${esc(r.email)}</dd>
            <dt>Phone</dt><dd class="reg-num">${esc(r.phone)}</dd>
          </dl>
        </div>
        ${profilePanel}
        ${standingPanel}
      </div>
      <div class="rec-col">
        <div class="admin-panel">
          <h3>Registration</h3>
          <dl class="rec-kv">
            <dt>Signed up</dt><dd class="big">${esc(fmtDateTime(r.createdAt))}</dd>
            <dt>Last updated</dt><dd>${esc(fmtDateTime(r.updatedAt))}</dd>
          </dl>
          <div class="reg-hint">Account numbers are issued in registration order, starting at 0001.</div>
        </div>
        ${reviewPanel}
        <div class="admin-panel rec-danger">
          <h3>Delete account</h3>
          <p>Removes this person and their stored details from the register. This cannot be undone.</p>
          <div class="app-actions" style="justify-content:flex-start">
            <button class="btn-reject" type="button" data-act="delete" data-id="${esc(r.id)}">Delete ${esc(r.name)}</button>
          </div>
        </div>
      </div>
    </div>`;

  host.hidden = false;
  $('consoleView').hidden = true;
  $('adminHero').hidden = true;
}
function renderAll() { renderStats(); renderRoster(); renderPending(); renderDecided(); renderRecord(); }

/* ---------- routing ---------- */
function focusAfterNavigation(prevId) {
  if (state.recordId && state.recordId !== prevId) { const h = $('recordHeading'); if (h) h.focus(); }
  else if (!state.recordId && prevId) {
    const t = document.querySelector('.admin-hero-copy h1');
    if (t) { t.setAttribute('tabindex', '-1'); t.focus(); }
  }
}
function syncFromHash() {
  const prev = state.recordId;
  const m = location.hash.match(/^#\/record\/(.+)$/);
  const id = m ? decodeURIComponent(m[1]) : null;
  const gone = id && !allRecords().some(r => r.id === id);
  state.recordId = (id && !gone) ? id : null;
  if (gone) {
    showError('That record no longer exists. It may have been deleted.');
    history.replaceState(null, '', location.pathname + location.search);
  }
  renderAll();
  focusAfterNavigation(prev);
}

/* ---------- export ---------- */
/* main.js intercepts clicks on internal <a href> for its page transition. Module
   scripts run after it, so a document-level guard would be registered too late.
   Capture on window always runs first, which is what stops exports being hijacked
   and saved under a generated filename. */
window.addEventListener('click', e => {
  const a = e.target && e.target.closest ? e.target.closest('a[download]') : null;
  if (a) e.stopImmediatePropagation();
}, true);

const CSV_COLS = ['accountNumber', 'role', 'id', 'name', 'email', 'phone', 'address', 'businessName', 'businessLocation', 'tier', 'tierName', 'status', 'governmentIdName', 'createdAt', 'updatedAt'];
function toRow(r) {
  const t = tierOf(r);
  return {
    accountNumber: formatAccountNumber(r.accountNumber),
    role: r._role, id: r.id, name: r.name, email: r.email, phone: r.phone, address: r.address,
    businessName: r.businessName || '', businessLocation: r.businessLocation || '',
    tier: isSeller(r) ? r.tier : '', tierName: isSeller(r) && t ? t.name : '', status: isSeller(r) ? r.status : 'active',
    governmentIdName: r.governmentIdName || '',
    createdAt: fmtDateTime(r.createdAt), updatedAt: fmtDateTime(r.updatedAt)
  };
}
function csvOf(rows) {
  const cellCsv = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [CSV_COLS.join(',')].concat(rows.map(r => CSV_COLS.map(c => cellCsv(toRow(r)[c])).join(','))).join('\n');
}
function download(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function tabName() { return state.view === 'buyers' ? 'buyers' : state.view === 'sellers' ? 'sellers' : 'all-accounts'; }

/* ---------- delete ---------- */
function openConfirm(id) {
  const r = allRecords().find(x => x.id === id); if (!r) return;
  pendingDeleteId = id;
  $('modalName').textContent = r.name + (isSeller(r) ? ' (' + r.businessName + ')' : '');
  lastFocus = document.activeElement;
  const sc = $('modalScrim'); sc.hidden = false;
  $('modalCancel').focus();
}
function closeConfirm() { $('modalScrim').hidden = true; pendingDeleteId = null; }
function refocus() {
  if (lastFocus && lastFocus.isConnected && lastFocus.focus) lastFocus.focus();
  else { const a = document.querySelector('.reg-tab'); if (a) a.focus(); }
}
async function confirmDelete() {
  const id = pendingDeleteId; if (!id) return;
  const r = allRecords().find(x => x.id === id);
  if (!r) { closeConfirm(); return; }
  const wasOpen = state.recordId === id;
  const button = $('modalDelete');
  button.disabled = true;
  button.textContent = 'Deleting…';
  clearError();
  try {
    const result = await deleteAccount({ db: services.db, storage: services.storage, uid: id, role: r._role, governmentIdPath: r.governmentIdPath || '' });
    RECORDS = RECORDS.filter(x => x.id !== id);
    if (wasOpen) { state.recordId = null; history.replaceState(null, '', location.pathname + location.search); }
    closeConfirm();
    renderAll();
    refocus();
    toast(result && result.authDeleted === false
      ? 'Deleted ' + r.name + '. The sign-in account still exists and must be removed separately.'
      : 'Deleted ' + r.name + '.');
  } catch (error) {
    console.error(error);
    showError(error && error.message ? error.message : 'Could not delete that account.');
  } finally {
    button.disabled = false;
    button.textContent = 'Delete account';
  }
}

/* ---------- toast ---------- */
function toast(msg) {
  const el = $('toast');
  $('toastMsg').textContent = msg;
  const btn = $('toastAction');
  btn.hidden = true; btn.onclick = null;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 5000);
}

/* ---------- actions ---------- */
async function act(kind, id) {
  const r = allRecords().find(x => x.id === id);
  if (!r) return;
  if (kind === 'view') { location.hash = '/record/' + encodeURIComponent(id); return; }
  if (kind === 'download') { download('tasara-' + r._role + '-' + r.id + '.csv', csvOf([r]), 'text/csv;charset=utf-8'); toast('Downloaded ' + r.name + '.'); return; }
  if (kind === 'delete') { openConfirm(id); return; }
  if (kind === 'csv') { download('tasara-' + r._role + '-' + r.id + '.csv', csvOf([r]), 'text/csv;charset=utf-8'); toast('Downloaded ' + r.name + '.'); return; }
  if (kind === 'json') { download('tasara-' + r._role + '-' + r.id + '.json', JSON.stringify(toRow(r), null, 2), 'application/json'); toast('Downloaded ' + r.name + '.'); return; }
  if (kind === 'copy') {
    const line = r.name + ' | ' + r.email + ' | ' + r.phone + ' | ' + r.address;
    (navigator.clipboard ? navigator.clipboard.writeText(line) : Promise.reject())
      .then(() => toast('Details copied.')).catch(() => toast('Copy was blocked by the browser.'));
    return;
  }
  if (kind === 'idfile') {
    if (!r.governmentIdPath) { toast('No government ID is attached to this application.'); return; }
    try {
      await saveSellerGovernmentId({ storage: services.storage, path: r.governmentIdPath, filename: r.governmentIdName || 'government-id' });
      toast('ID file saved.');
    } catch (error) {
      console.error(error);
      showError(error && error.message ? error.message : 'Could not save the ID file.');
    }
    return;
  }
  if (kind === 'approve' || kind === 'reject') {
    const status = kind === 'approve' ? SELLER_STATUSES.APPROVED : SELLER_STATUSES.REJECTED;
    const label = kind === 'approve' ? 'Approve' : 'Reject';
    if (!window.confirm(label + ' this Merchant Steward application?')) return;
    clearError();
    try {
      const user = services.auth.currentUser;
      await decideSeller({ db: services.db, uid: id, status, reviewerUid: user ? user.uid : '', reviewNote: '' });
      toast(label + 'd ' + r.name + '.');
    } catch (error) {
      console.error(error);
      showError(error && error.message ? error.message : 'Admin action failed.');
    }
    return;
  }
}

/* ---------- events ---------- */
document.querySelectorAll('.reg-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    state.view = tab.dataset.view;
    document.querySelectorAll('.reg-tab').forEach(t => t.setAttribute('aria-pressed', String(t === tab)));
    renderAll();
  });
});
$('q').addEventListener('input', e => { state.q = e.target.value; renderRoster(); });
$('statusFilter').addEventListener('change', e => { state.status = e.target.value; renderRoster(); });
$('tierFilter').addEventListener('change', e => { state.tier = e.target.value; renderRoster(); });
$('sortBy').addEventListener('change', e => { state.sort = e.target.value; renderRoster(); });

$('exportTab').addEventListener('click', () => {
  const rows = visible();
  if (!rows.length) return toast('Nothing to export in this view.');
  download('tasara-' + tabName() + '-' + new Date().toISOString().slice(0, 10) + '.csv', csvOf(rows), 'text/csv;charset=utf-8');
  toast('Exported ' + rows.length + ' record' + (rows.length === 1 ? '' : 's') + ' from this tab.');
});

document.addEventListener('click', e => {
  const btn = e.target.closest('button[data-act]');
  if (btn) { act(btn.dataset.act, btn.dataset.id); return; }
  const row = e.target.closest('.reg-row');
  if (row) { act('view', row.dataset.id); return; }
  if (e.target.closest('#backBtn')) {
    history.replaceState(null, '', location.pathname + location.search);
    state.recordId = null;
    renderAll();
    const t = document.querySelector('.admin-hero-copy h1');
    if (t) { t.setAttribute('tabindex', '-1'); t.focus(); }
  }
});
$('modalCancel').addEventListener('click', () => { closeConfirm(); refocus(); });
$('modalDelete').addEventListener('click', confirmDelete);
$('modalScrim').addEventListener('click', e => { if (e.target === $('modalScrim')) { closeConfirm(); refocus(); } });
document.addEventListener('keydown', e => {
  if (e.key !== 'Tab' || $('modalScrim').hidden) return;
  const f = [...$('modalScrim').querySelectorAll('button')].filter(b => !b.disabled);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('modalScrim').hidden) { closeConfirm(); refocus(); }
});
window.addEventListener('hashchange', syncFromHash);

/* ---------- live data ---------- */
function applyRecords() {
  RECORDS = [
    ...BUYERS.map(r => ({ ...r, _role: 'buyer' })),
    ...SELLERS.map(r => ({ ...r, _role: 'seller' }))
  ];
  renderAll();
}
let BUYERS = [];
let SELLERS = [];
function startData() {
  const unsubBuyers = observeBuyers({ db: services.db }, list => { BUYERS = list; applyRecords(); }, showError);
  const unsubSellers = observeSellers({ db: services.db }, list => { SELLERS = list; applyRecords(); }, showError);
  window.addEventListener('pagehide', () => { unsubBuyers(); unsubSellers(); }, { once: true });
}

/* ---------- boot ---------- */
const onReady = fn => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn());

onReady(async () => {
  clearError();
  renderAll();
  syncFromHash();
  try {
    services = getFirebaseServices();
  } catch (error) {
    console.error(error);
    showError(error && error.message ? error.message : 'Firebase is not connected yet. Add the Firebase web configuration first.');
    return;
  }
  observeAuth(services, async user => {
    if (!user) return window.location.replace('login.html');
    try {
      const profile = await getCurrentProfile(services);
      if (!profile) return window.location.replace('login.html');
      if (profile.role !== ROLES.ADMIN) {
        return window.location.replace(profile.role === ROLES.BUYER ? 'dashboard-buyer.html' : 'dashboard-seller.html');
      }
      const token = await user.getIdTokenResult();
      if (token.claims.admin !== true) return window.location.replace('login.html');
      clearError();
      startData();
    } catch (error) {
      console.error(error);
      showError(error && error.message ? error.message : 'Could not load the administrator profile.');
    }
  });
});

