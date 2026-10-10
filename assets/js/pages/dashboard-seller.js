import { getFirebaseServices } from '../firebase/firebase-client.js';
import { getCurrentProfile, observeAuth } from '../firebase/auth.js';
import { ROLES, SELLER_STATUSES } from '../firebase/constants.js';
import { observeSeller } from '../firebase/profiles.js';
import { getSellerTier } from '../firebase/tiers.js';
import { SELLER_TELEGRAM_URL } from '../firebase/firebase-config.js';
import { uploadSellerGovernmentId } from '../firebase/seller-documents.js';
import { saveMyDetails } from '../firebase/profile-edits.js';

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? '—';
}
function showError(message) {
  const box = document.getElementById('sellerDashboardError');
  if (box) { box.textContent = message; box.classList.add('show'); }
}
function clearError() { document.getElementById('sellerDashboardError')?.classList.remove('show'); }

function renderStatus(app) {
  const pill = document.getElementById('statusPill');
  const copy = document.getElementById('statusCopy');
  const approvedArea = document.getElementById('approvedArea');
  const uploadArea = document.getElementById('sellerUploadArea');
  const note = document.getElementById('reviewNote');
  if (!pill || !copy) return;

  pill.className = 'status-pill';
  if (app.status === SELLER_STATUSES.APPROVED) {
    pill.classList.add('status-live');
    pill.innerHTML = '<span class="status-dot"></span> Approved — your Merchant Steward access is active';
    copy.textContent = 'Your application has been approved by a TASARA Administrator. Your seller status is now live.';
    approvedArea?.classList.add('show');
    uploadArea?.classList.remove('show');
  } else if (app.status === SELLER_STATUSES.REJECTED) {
    pill.classList.add('status-rejected');
    pill.innerHTML = '<span class="status-dot"></span> Application not approved';
    copy.textContent = 'An Administrator reviewed the application and it was not approved.';
    approvedArea?.classList.remove('show');
    uploadArea?.classList.add('show');
  } else {
    pill.classList.add('status-pending');
    pill.innerHTML = '<span class="status-dot"></span> Awaiting Administrator approval';
    copy.textContent = 'Your application is pending review. Full Merchant Steward access remains locked until an Administrator approves it.';
    approvedArea?.classList.remove('show');
    uploadArea?.classList.add('show');
  }

  if (note) {
    note.textContent = app.reviewNote ? `Administrator note: ${app.reviewNote}` : '';
    note.style.display = app.reviewNote ? 'block' : 'none';
  }
}

// Module scripts evaluate after the document is parsed, but a dependency's
// top-level await can let DOMContentLoaded fire first — so never rely on it.
const onReady = fn => (document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', fn)
  : fn());

onReady(async () => {
  try {
    const services = getFirebaseServices();

    /* Edit-details form state + element refs. Declared before the auth
       observer so its callbacks (and the live seller observer nested in it)
       can touch them without depending on async ordering. The personal fields
       are prefilled from the users doc at boot; the business fields are
       prefilled once from the live seller snapshot so a live re-render never
       clobbers a half-typed edit. */
    let lastSellerStatus = null;
    let businessFieldsPrefilled = false;
    const editName = document.getElementById('editName');
    const editPhone = document.getElementById('editPhone');
    const editAddress = document.getElementById('editAddress');
    const editBizName = document.getElementById('editBizName');
    const editBizLoc = document.getElementById('editBizLoc');
    const editBtn = document.getElementById('editDetailsBtn');
    const editNote = document.getElementById('editDetailsNote');
    const prefillBusiness = app => {
      if (businessFieldsPrefilled || !app) return;
      businessFieldsPrefilled = true;
      if (editBizName) editBizName.value = app.businessName || '';
      if (editBizLoc) editBizLoc.value = app.businessLocation || '';
    };

    observeAuth(services, async user => {
      if (!user) return window.location.replace('login.html');
      const profile = await getCurrentProfile(services);
      if (!profile) return window.location.replace('login.html');
      if (profile.role !== ROLES.SELLER) {
        return window.location.replace(profile.role === ROLES.BUYER ? 'dashboard-buyer.html' : 'dashboard-admin.html');
      }

      setText('userName', (profile.name || 'there').split(' ')[0]);
      setText('rowName', profile.name);
      setText('rowEmail', profile.email);
      setText('rowPhone', profile.phone);
      setText('rowAddress', profile.address);
      if (editName) editName.value = profile.name || '';
      if (editPhone) editPhone.value = profile.phone || '';
      if (editAddress) editAddress.value = profile.address || '';

      const unsubscribe = observeSeller({ ...services, uid: user.uid }, app => {
        if (!app) return showError('Your seller application record could not be found.');
        const tier = getSellerTier(app.tier);
        setText('rowBizName', app.businessName);
        setText('rowBizLoc', app.businessLocation);
        setText('rowTier', `Tier ${tier.id} — ${tier.name}`);
        setText('rowStake', tier.stakeDisplay);
        setText('rowOmni', tier.omniDisplay);
        setText('rowFile', app.governmentIdPath ? `${app.governmentIdName || 'Uploaded'} ✓` : 'Not yet uploaded');
        setText('tierNameTag', app.status === SELLER_STATUSES.APPROVED ? tier.name : `${tier.name} · ${app.status}`);
        renderStatus(app);
        lastSellerStatus = app.status;
        prefillBusiness(app);
      }, showError);
      window.addEventListener('pagehide', unsubscribe, { once: true });
    });

    const upload = document.getElementById('dashboardIdUpload');
    const uploadBtn = document.getElementById('dashboardUploadBtn');
    const uploadName = document.getElementById('dashboardUploadFilename');
    upload?.addEventListener('change', () => {
      uploadName.textContent = upload.files?.[0]?.name || '';
    });
    uploadBtn?.addEventListener('click', async () => {
      clearError();
      if (!upload.files?.[0]) return showError('Choose a government-issued ID file first.');
      try {
        const user = services.auth.currentUser;
        if (!user) throw new Error('Your session has ended. Please sign in again.');
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Uploading…';
        await uploadSellerGovernmentId({ ...services, uid: user.uid, file: upload.files[0] });
        upload.value = '';
        uploadName.textContent = 'Uploaded ✓';
      } catch (error) {
        showError(error.message || 'Upload failed.');
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload document';
      }
    });

    /* Edit-details save. Personal fields were prefilled at boot; business
       fields from the first live snapshot (see declarations above). */
    editBtn?.addEventListener('click', async () => {
      clearError();
      editNote.textContent = '';
      const user = services.auth.currentUser;
      if (!user) return showError('Your session has ended. Please sign in again.');
      const resubmitting = lastSellerStatus !== SELLER_STATUSES.PENDING;
      try {
        editBtn.disabled = true;
        editBtn.textContent = 'Saving…';
        await saveMyDetails({
          ...services,
          uid: user.uid,
          role: ROLES.SELLER,
          changes: {
            name: editName.value,
            phone: editPhone.value,
            address: editAddress.value,
            businessName: editBizName.value,
            businessLocation: editBizLoc.value
          }
        });
        editNote.textContent = resubmitting
          ? 'Saved — your details were sent to an Administrator for re-review.'
          : 'Details saved.';
      } catch (error) {
        showError(error.message || 'Could not save your details.');
      } finally {
        editBtn.disabled = false;
        editBtn.textContent = 'Save details';
      }
    });

    /* Open synchronously inside the click: a delayed window.open is treated
       as a weaker user gesture and can be popup-blocked. */
    document.getElementById('joinSellerBtn')?.addEventListener('click', () => {
      const btn = document.getElementById('joinSellerBtn');
      btn.classList.add('tilted');
      window.open(SELLER_TELEGRAM_URL, '_blank', 'noopener');
    });
  } catch (error) {
    console.error(error);
    showError(error.message || 'Firebase is not connected yet.');
  }
});
