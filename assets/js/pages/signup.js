import { getFirebaseServices } from '../firebase/firebase-client.js';
import { getUserFriendlyAuthError, registerBuyer, registerSeller } from '../firebase/auth.js';
import { uploadSellerGovernmentId } from '../firebase/seller-documents.js';
import { SELLER_TIERS, getSellerTier } from '../firebase/tiers.js';

function showError(box, message) {
  box.textContent = message;
  box.classList.add('show');
}
function clearError(box) { box.classList.remove('show'); box.textContent = ''; }
function setBusy(button, busy, text) {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = text;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.originalText || button.textContent;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const tabBuyer = document.getElementById('tabBuyer');
  const tabSeller = document.getElementById('tabSeller');
  const buyerPanel = document.getElementById('buyerPanel');
  const sellerPanel = document.getElementById('sellerPanel');
  const stageTitle = document.getElementById('stageTitle');
  const stageSub = document.getElementById('stageSub');
  const loopCaption = document.getElementById('loopCaption');

  function showBuyer() {
    tabBuyer.classList.add('active');
    tabBuyer.setAttribute('aria-selected', 'true');
    tabSeller.classList.remove('active');
    tabSeller.setAttribute('aria-selected', 'false');
    buyerPanel.style.display = 'block';
    sellerPanel.style.display = 'none';
    stageTitle.textContent = 'Join TASARA';
    stageSub.textContent = 'Create a free buyer account and connect with the TASARA buyers community on Telegram.';
    loopCaption.innerHTML = 'A System Participant account gets you into the network immediately — <b>simple, direct, connected.</b>';
  }

  function showSeller() {
    tabSeller.classList.add('active');
    tabSeller.setAttribute('aria-selected', 'true');
    tabBuyer.classList.remove('active');
    tabBuyer.setAttribute('aria-selected', 'false');
    sellerPanel.style.display = 'block';
    buyerPanel.style.display = 'none';
    stageTitle.textContent = 'Become a Merchant Steward';
    stageSub.textContent = 'Register your business, choose your seller tier, upload your ID, and submit for Administrator approval.';
    loopCaption.innerHTML = 'Every Merchant Steward is reviewed before access is granted — <b>your standing is verified, not assumed.</b>';
  }

  tabBuyer?.addEventListener('click', showBuyer);
  tabSeller?.addEventListener('click', showSeller);
  if (new URLSearchParams(window.location.search).get('role') === 'seller') showSeller();

  // Seller tiers are rendered from one canonical browser-side definition.
  const tierList = document.getElementById('tierList');
  if (tierList) {
    tierList.innerHTML = Object.values(SELLER_TIERS).map(tier => `
      <label class="tier">
        <input type="radio" name="tier" value="${tier.id}" required>
        <div class="tier-body">
          <div class="tier-num">Tier ${tier.id}</div>
          <div class="tier-name">${tier.name}</div>
          <div class="tier-simple">${tier.label}</div>
          <div class="tier-stats"><span><b>${tier.stakeDisplay}</b> stake</span><span><b>${tier.omniDisplay}</b> Omni</span></div>
          <div class="tier-scope">${tier.scope}</div>
        </div>
      </label>
    `).join('');
  }

  let services;
  try {
    services = getFirebaseServices();
  } catch (error) {
    document.getElementById('firebaseNote')?.classList.add('show');
    console.warn(error);
  }

  const buyerForm = document.getElementById('buyerForm');
  const buyerError = document.getElementById('buyerError');
  buyerForm?.addEventListener('submit', async event => {
    event.preventDefault();
    clearError(buyerError);
    if (!services) return showError(buyerError, 'Firebase is not connected yet. Add the Firebase web configuration first.');
    const button = buyerForm.querySelector('button[type="submit"]');
    setBusy(button, true, 'Creating account…');
    try {
      await registerBuyer({
        ...services,
        name: document.getElementById('bName').value,
        email: document.getElementById('bEmail').value,
        phone: document.getElementById('bPhone').value,
        address: document.getElementById('bAddress').value,
        password: document.getElementById('bPassword').value
      });
      window.location.replace('dashboard-buyer.html');
    } catch (error) {
      showError(buyerError, getUserFriendlyAuthError(error));
      setBusy(button, false);
    }
  });

  const panels = [...document.querySelectorAll('.step-panel')];
  const dots = [...document.querySelectorAll('.stepper .dot')];
  const stepLabel = document.getElementById('stepLabel');
  const stepBack = document.getElementById('stepBack');
  const stepNext = document.getElementById('stepNext');
  const stepSubmit = document.getElementById('stepSubmit');
  const sellerError = document.getElementById('sellerError');
  const idUpload = document.getElementById('idUpload');
  const uploadBox = document.getElementById('uploadBox');
  const uploadText = document.getElementById('uploadText');
  const uploadFilename = document.getElementById('uploadFilename');
  const sellerForm = document.getElementById('sellerForm');
  const totalSteps = 3;
  const labels = { 1: 'Your details', 2: 'Choose your tier', 3: 'Verification' };
  let current = 1;

  function renderStep() {
    panels.forEach(panel => panel.classList.toggle('active', Number(panel.dataset.panel) === current));
    dots.forEach(dot => dot.classList.toggle('done', Number(dot.dataset.step) <= current));
    stepLabel.innerHTML = `Step <b>${current} of ${totalSteps}</b> — ${labels[current]}`;
    stepBack.style.display = current === 1 ? 'none' : 'inline-flex';
    stepNext.style.display = current === totalSteps ? 'none' : 'inline-flex';
    stepSubmit.style.display = current === totalSteps ? 'inline-flex' : 'none';
    clearError(sellerError);
  }

  function validateStep() {
    const panel = document.querySelector(`.step-panel[data-panel="${current}"]`);
    if (!panel) return true;
    const inputs = panel.querySelectorAll('input[required]');
    for (const input of inputs) {
      if (input.type === 'radio') {
        if (!panel.querySelector(`input[name="${input.name}"]:checked`)) return false;
      } else if (!input.value.trim()) return false;
    }
    if (current === 1) {
      const pass = document.getElementById('sPassword').value;
      const confirm = document.getElementById('sPasswordConfirm').value;
      if (pass.length < 8 || confirm.length < 8 || pass !== confirm) return false;
    }
    return true;
  }

  stepNext?.addEventListener('click', () => {
    if (!validateStep()) {
      showError(sellerError, current === 2 ? 'Please choose a tier before continuing.' : 'Please complete this step.');
      return;
    }
    current = Math.min(totalSteps, current + 1);
    renderStep();
  });
  stepBack?.addEventListener('click', () => { current = Math.max(1, current - 1); renderStep(); });

  idUpload?.addEventListener('change', () => {
    if (!idUpload.files.length) return;
    uploadBox.classList.add('has-file');
    uploadText.textContent = 'File ready — tap to replace';
    uploadFilename.textContent = idUpload.files[0].name;
  });

  sellerForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (current !== totalSteps) {
      if (!validateStep()) { showError(sellerError, 'Please complete this step.'); return; }
      current = Math.min(totalSteps, current + 1);
      renderStep();
      return;
    }
    if (!validateStep()) { showError(sellerError, 'Please complete all three steps.'); return; }
    if (!services) { showError(sellerError, 'Firebase is not connected yet. Add the Firebase web configuration first.'); return; }

    const tier = getSellerTier(document.querySelector('input[name="tier"]:checked')?.value);
    const file = idUpload?.files?.[0];
    const button = stepSubmit;
    clearError(sellerError);
    setBusy(button, true, 'Submitting…');

    try {
      const authUser = await registerSeller({
          ...services,
          name: document.getElementById('sName').value,
          email: document.getElementById('sEmail').value,
          phone: document.getElementById('sPhone').value,
          address: document.getElementById('sAddress').value,
          businessName: document.getElementById('sBizName').value,
          businessLocation: document.getElementById('sBizLocation').value,
          tier: tier.id,
          password: document.getElementById('sPassword').value
      });

      try {
        await uploadSellerGovernmentId({ ...services, uid: authUser.uid, file });
      } catch (uploadError) {
        showError(sellerError, `Your seller account was created, but the ID upload did not complete. Sign in to your seller dashboard and retry the upload. ${getUserFriendlyAuthError(uploadError)}`);
        setBusy(button, false);
        setTimeout(() => window.location.replace('dashboard-seller.html'), 1200);
        return;
      }

      window.location.replace('dashboard-seller.html');
    } catch (error) {
      showError(sellerError, getUserFriendlyAuthError(error));
      setBusy(button, false);
    }
  });

  renderStep();
});
