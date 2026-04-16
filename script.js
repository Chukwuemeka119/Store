<script type="module">
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, set, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const OWNER_PASS = 'mwowner2026'; // ← Change this

const cfg = {
  apiKey: "AIzaSyAF7q176rxAoCFqhH0Djquhu0MphaUMLyQ",
  authDomain: "pos-store-29e58.firebaseapp.com",
  databaseURL: "https://pos-store-29e58-default-rtdb.firebaseio.com",
  projectId: "pos-store-29e58",
  storageBucket: "pos-store-29e58.firebasestorage.app",
  messagingSenderId: "494046387333",
  appId: "1:494046387333:web:44ef67eeac8e40e4f19dec"
};

const app = initializeApp(cfg, 'setup');
const db  = getDatabase(app);
const $   = id => document.getElementById(id);

// Set today's date as default
$('new-paydate').value = new Date().toISOString().split('T')[0];

// ── GATE ──────────────────────────────────────────
$('gate-btn').addEventListener('click', tryGate);
$('owner-pass').addEventListener('keydown', e => { if (e.key === 'Enter') tryGate(); });

function tryGate() {
  if ($('owner-pass').value === OWNER_PASS) {
    $('gate-wrap').style.display = 'none';
    $('main-panel').style.display = 'block';
    loadList();
  } else {
    $('gate-err').style.display = 'block';
    $('owner-pass').value = '';
    setTimeout(() => $('gate-err').style.display = 'none', 3000);
  }
}

// ── CREATE ────────────────────────────────────────
$('create-btn').addEventListener('click', async () => {
  const bizId    = $('new-bizcode').value.trim().toUpperCase();
  const name     = $('new-bizname').value.trim();
  const address  = $('new-bizaddr').value.trim();
  const phone    = $('new-bizphone').value.trim();
  const adminPw  = $('new-adminpass').value.trim();
  const payDate  = $('new-paydate').value;

  if (!bizId || !name || !adminPw || !payDate) {
    showStatus('Please fill in: Code, Store Name, Admin Password and Payment Date.', false); return;
  }
  if (adminPw.length < 4) { showStatus('Admin password must be at least 4 characters.', false); return; }

  try {
    const snap = await get(ref(db, `businesses/${bizId}/config`));
    if (snap.exists()) { showStatus(`Code "${bizId}" already exists. Choose a different code.`, false); return; }

    // Save to Secure Vault
    await set(ref(db, `businesses/${bizId}`), {
      config: {
        adminPassword: adminPw,
        active: true,
        lastPaymentDate: new Date(payDate).toISOString(),
        createdAt: new Date().toISOString(),
      },
      business: { name, address: address || '', phone: phone || '' }
    });

    // Save Safe Copy to Public Directory
    await set(ref(db, `directory/${bizId}`), {
      config: { active: true, lastPaymentDate: new Date(payDate).toISOString() },
      business: { name, phone: phone || '' }
    });

    showStatus(`✓ "${name}" created!\nCode: ${bizId} | Admin pass: ${adminPw}\nExpiry: ${getExpiry(payDate)}`, true);
    $('new-bizcode').value = $('new-bizname').value = $('new-bizaddr').value = '';
    $('new-bizphone').value = $('new-adminpass').value = '';
    $('new-paydate').value = new Date().toISOString().split('T')[0];
    loadList();
  } catch (e) { showStatus('Error: ' + e.message, false); }
});

function getExpiry(payDateStr) {
  const d = new Date(payDateStr);
  // STRICT 31+3 MATH APPLIED HERE
  const expiry = new Date(d.getTime() + (34 * 24 * 60 * 60 * 1000));
  return expiry.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

// ── LIST ──────────────────────────────────────────
window.loadList = async function() {
  const list = $('biz-list');
  list.innerHTML = '<div class="loading">Loading...</div>';

  try {
    // FETCHING FROM DIRECTORY INSTEAD OF BUSINESSES
    const snap = await get(ref(db, 'directory'));
    const data  = snap.val() || {};
    const entries = Object.entries(data);

    if (!entries.length) { list.innerHTML = '<div class="loading">No businesses yet</div>'; return; }

    list.innerHTML = entries.map(([id, biz]) => {
      const active  = biz.config?.active !== false;
      const payDate = biz.config?.lastPaymentDate ? new Date(biz.config.lastPaymentDate).toLocaleDateString('en-GB') : '—';
      const expiry  = biz.config?.lastPaymentDate ? getExpiry(biz.config.lastPaymentDate.split('T')[0]) : '—';
      return `<div class="biz-row">
        <div>
          <div class="biz-code">${id}</div>
          <div class="biz-name">${biz.business?.name || '—'}</div>
          <div class="biz-meta">Paid: ${payDate} · Expires: ${expiry} · Phone: ${biz.business?.phone || '—'}</div>
        </div>
        <div class="biz-actions">
          <span class="badge ${active ? 'badge-active' : 'badge-inactive'}">${active ? 'Active' : 'Inactive'}</span>
          <input type="date" class="date-field" id="pd-${id}" value="${biz.config?.lastPaymentDate ? biz.config.lastPaymentDate.split('T')[0] : ''}"/>
          <button class="tog-btn" style="color:#6affd4;border-color:rgba(106,255,212,0.3)" onclick="markPaid('${id}')">✓ Paid</button>
          <button class="tog-btn ${active ? '' : ''}" style="${active ? 'color:#ff4d6d;border-color:rgba(255,77,109,0.3)' : 'color:#6affd4;border-color:rgba(106,255,212,0.3)'}" onclick="toggleStatus('${id}', ${active})">${active ? 'Deactivate' : 'Activate'}</button>
        </div>
      </div>`;
    }).join('');
  } catch (e) { list.innerHTML = `<div class="loading">Error: ${e.message}</div>`; }
};

window.markPaid = async (id) => {
  const dateEl = document.getElementById(`pd-${id}`);
  const dateVal = dateEl ? dateEl.value : new Date().toISOString().split('T')[0];
  if (!dateVal) { alert('Please select a payment date first.'); return; }
  if (!confirm(`Mark ${id} as paid on ${dateVal}?`)) return;
  try {
    await update(ref(db, `businesses/${id}/config`), {
      lastPaymentDate: new Date(dateVal).toISOString(),
      active: true
    });
    // UPDATE DIRECTORY AS WELL
    await update(ref(db, `directory/${id}/config`), {
      lastPaymentDate: new Date(dateVal).toISOString(),
      active: true
    });
    loadList();
  } catch (e) { alert('Error: ' + e.message); }
};

window.toggleStatus = async (id, currentlyActive) => {
  const action = currentlyActive ? 'DEACTIVATE' : 'ACTIVATE';
  if (!confirm(`${action} business "${id}"? ${currentlyActive ? 'They will be kicked out immediately.' : 'They will regain access.'}`)) return;
  try {
    await update(ref(db, `businesses/${id}/config`), { active: !currentlyActive });
    // UPDATE DIRECTORY AS WELL
    await update(ref(db, `directory/${id}/config`), { active: !currentlyActive });
    loadList();
  } catch (e) { alert('Error: ' + e.message); }
};

function showStatus(msg, ok) {
  const el = $('status');
  el.textContent = msg;
  el.className = ok ? 'ok' : 'err';
  el.style.display = 'block';
  if (ok) setTimeout(() => el.style.display = 'none', 8000);
}
</script>
