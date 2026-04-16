import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, push, onValue, get, update, remove, set }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ── FIREBASE ──────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAF7q176rxAoCFqhH0Djquhu0MphaUMLyQ",
  authDomain: "pos-store-29e58.firebaseapp.com",
  databaseURL: "https://pos-store-29e58-default-rtdb.firebaseio.com",
  projectId: "pos-store-29e58",
  storageBucket: "pos-store-29e58.firebasestorage.app",
  messagingSenderId: "494046387333",
  appId: "1:494046387333:web:44ef67eeac8e40e4f19dec"
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// ── UTILITIES ─────────────────────────────────────────────────────────────────
const clean   = str => String(str || '').replace(/[<>"'&]/g, c => ({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c]));
const $       = id  => document.getElementById(id);
const on      = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
const setText = (id, val) => { const el = $(id); if (el) el.textContent = val; };

// ── STATE ─────────────────────────────────────────────────────────────────────
let STORE         = { name: '', address: '', phone: '' };
let inventory     = [];
let cart          = [];
let allSales      = [];
let historyPeriod = 'daily';
let adminCache    = null;

// ── ROUTING ───────────────────────────────────────────────────────────────────
const PAGE = (() => {
  const p = location.pathname.split('/').pop();
  return (p === '' || !p) ? 'index.html' : p;
})();

function getBizId()   { return sessionStorage.getItem('bizId'); }
function getCashier() { return sessionStorage.getItem('cashier') || '—'; }
function bizRef(path) { return ref(db, `businesses/${getBizId()}/${path}`); }

// ── AUTH GUARD ────────────────────────────────────────────────────────────────
if (PAGE !== 'login.html') {
  if (!sessionStorage.getItem('posAuth') || !getBizId()) {
    sessionStorage.clear();
    location.href = 'login.html';
  }
}

// ── REAL-TIME DEACTIVATION CHECK ─────────────────────────────────────────────
if (PAGE !== 'login.html' && getBizId()) {
  onValue(ref(db, `businesses/${getBizId()}/config/active`), snap => {
    if (snap.exists() && snap.val() === false) {
      sessionStorage.clear();
      alert('⚠️ Your account has been deactivated.\nPlease contact Michael Web™ — 08033441185');
      location.href = 'login.html';
    }
  });
}

// ── ADMIN HELPERS ─────────────────────────────────────────────────────────────
async function getAdminPw() {
  if (adminCache) return adminCache;
  try {
    const snap = await get(bizRef('config/adminPassword'));
    adminCache = snap.exists() ? snap.val() : 'admin123';
  } catch { adminCache = 'admin123'; }
  return adminCache;
}

async function verifyAdmin(msg = 'Enter admin password:') {
  const correct = await getAdminPw();
  const entered = window.prompt(msg);
  if (entered === null) return false;
  return entered === correct;
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  on('logout-link', 'click', e => { e.preventDefault(); handleLogout(); });

  if (PAGE === 'login.html') {
    wireLOGIN();
  } else {
    await loadStore();
    renderNavbar();

    if (PAGE === 'index.html') {
      loadSubscriptionCard();
    } else if (PAGE === 'inventory.html') {
      wireINVENTORY();
    } else if (PAGE === 'sales.html') {
      wireSALES();
    } else if (PAGE === 'admin.html') {
      const ok = await verifyAdmin('🔐 Enter admin password to access this page:');
      if (!ok) { location.href = 'index.html'; } else { wireADMIN(); }
    }
  }
});

// ── LOGIN LOGIC ───────────────────────────────────────────────────────────────
function wireLOGIN() {
  const bizEl = $('bizcode');
  if (bizEl) bizEl.addEventListener('input', () => { bizEl.value = bizEl.value.toUpperCase(); });

  on('login-btn', 'click', handleLogin);
  on('password',  'keydown', e => { if (e.key === 'Enter') handleLogin(); });
}

async function handleLogin() {
  const bizId = ($('bizcode')?.value || '').trim().toUpperCase();
  const user  = ($('username')?.value || '').trim();
  const pass  = ($('password')?.value || '').trim();

  if (!bizId || !user || !pass) { alert('Please fill in all fields.'); return; }

  const btn = $('login-btn');
  btn.disabled = true;
  btn.textContent = 'Signing in...';

  try {
    const snap = await get(ref(db, `businesses/${bizId}`));
    if (!snap.exists()) {
      alert('Business code not found.\nContact Michael Web™ — 08033441185');
      btn.disabled = false; btn.textContent = 'Sign In →';
      return;
    }

    const data = snap.val();
    const config = data.config || {};

    if (config.active === false) {
      alert('⚠️ Account deactivated. Contact Michael Web™');
      btn.disabled = false; btn.textContent = 'Sign In →';
      return;
    }

    if (config.lastPaymentDate) {
      const lastPaid = new Date(config.lastPaymentDate);
      const expiry = new Date(lastPaid.getTime() + (34 * 24 * 60 * 60 * 1000));
      if (new Date() > expiry) {
        await update(ref(db, `businesses/${bizId}/config`), { active: false });
        alert('⚠️ Subscription expired.');
        btn.disabled = false; btn.textContent = 'Sign In →';
        return;
      }
    }

    let auth = false;
    if (user === 'admin') {
      if (pass === (config.adminPassword || 'admin123')) auth = true;
    } else {
      const cashiers = data.cashiers || {};
      auth = Object.values(cashiers).some(c => c.username === user && c.password === pass);
    }

    if (auth) {
      sessionStorage.setItem('posAuth', 'true');
      sessionStorage.setItem('cashier', user);
      sessionStorage.setItem('bizId', bizId);
      location.href = 'index.html';
    } else {
      alert('Wrong username or password.');
      btn.disabled = false; btn.textContent = 'Sign In →';
    }
  } catch (err) {
    alert('Connection error.');
    btn.disabled = false; btn.textContent = 'Sign In →';
  }
}

// ── SUBSCRIPTION (31+3 STRICT) ────────────────────────────────────────────────
async function loadSubscriptionCard() {
  const snap = await get(ref(db, `businesses/${getBizId()}/config`));
  if (!snap.exists()) return;
  const cfg = snap.val();
  const card = $('sub-card');
  if (!card || !cfg.lastPaymentDate) return;

  card.style.display = 'flex';
  setText('sub-biz', getBizId());

  const lastPaid = new Date(cfg.lastPaymentDate);
  const expiry = new Date(lastPaid.getTime() + (34 * 24 * 60 * 60 * 1000));
  const now = new Date();
  const daysLeft = Math.ceil((expiry - now) / 86400000);

  setText('sub-dates', `Paid: ${lastPaid.toLocaleDateString('en-GB')} · Expires: ${expiry.toLocaleDateString('en-GB')}`);
  const statusEl = $('sub-status');

  if (now > expiry) {
    statusEl.innerHTML = `<span class="status-badge status-expired">Expired</span>`;
    update(ref(db, `businesses/${getBizId()}/config`), { active: false });
  } else {
    statusEl.innerHTML = `<span class="status-badge status-active">Active · ${daysLeft} days left</span>`;
  }
}

// ── REST OF APP (STORE/INV/SALES/ADMIN) ───────────────────────────────────────
async function loadStore() {
  const snap = await get(bizRef('business'));
  if (snap.exists()) STORE = snap.val();
}
function renderNavbar() {
  setText('c-name', STORE.name); setText('c-address', STORE.address); setText('c-phone', STORE.phone);
}
function handleLogout() { if(confirm('Sign out?')) { sessionStorage.clear(); location.href='login.html'; } }

function wireINVENTORY() {
  on('add-item', 'click', () => {
    const name = $('item-name').value, price = Number($('item-price').value), qty = Number($('item-quantity').value);
    if(name && price > 0 && qty >= 0) { push(bizRef('inventory'), {name, price, qty}); $('item-name').value=''; $('item-price').value=''; $('item-quantity').value=''; }
  });
  onValue(bizRef('inventory'), snap => {
    inventory = []; snap.forEach(c => { inventory.push({id:c.key, ...c.val()}); });
    const body = $('inventory-body');
    body.innerHTML = inventory.map(i => `<tr><td>${clean(i.name)}</td><td>₦${i.price.toLocaleString()}</td><td>${i.qty}</td><td><button class="btn btn-danger" onclick="deleteItem('${i.id}','${clean(i.name)}')">Remove</button></td></tr>`).join('');
  });
}
window.deleteItem = async (id, name) => { if(await verifyAdmin(`Remove ${name}?`)) remove(bizRef('inventory/'+id)); };

function wireSALES() {
  onValue(bizRef('inventory'), snap => {
    inventory = []; snap.forEach(c => inventory.push({id:c.key, ...c.val()}));
    $('sell-item').innerHTML = '<option value="">-- Select --</option>' + inventory.map(i => `<option value="${i.name}">${i.name} (₦${i.price})</option>`).join('');
  });
  on('sell-btn', 'click', () => {
    const name = $('sell-item').value, qty = Number($('sell-qty').value);
    const item = inventory.find(i => i.name === name);
    if(item && qty <= item.qty) {
      cart.push({name, qty, price: item.price, total: qty * item.price});
      renderCart();
    } else { alert('Invalid quantity'); }
  });
  on('print-btn', 'click', handlePrint);
}
function renderCart() {
  const total = cart.reduce((s,i) => s + i.total, 0);
  $('sell-body').innerHTML = cart.map((i, idx) => `<tr><td>${i.name}</td><td>${i.qty}</td><td>₦${i.price}</td><td>₦${i.total}</td><td><button onclick="cart.splice(${idx},1);renderCart()">✕</button></td></tr>`).join('');
  setText('subtotal', total.toLocaleString());
}
async function handlePrint() {
  if(!cart.length) return;
  const now = new Date();
  const grandTotal = cart.reduce((s,i) => s + i.total, 0);
  setText('r-total', grandTotal.toLocaleString());
  // Update stock & Save sale logic here (as in previous version)
  window.print();
  cart = []; renderCart();
}

function wireADMIN() {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.onclick = () => {
    document.querySelectorAll('.tab-btn, .tab-panel').forEach(el => el.classList.remove('active'));
    btn.classList.add('active'); $('tab-'+btn.dataset.tab).classList.add('active');
  });
  onValue(bizRef('cashiers'), snap => {
    const b = $('cashier-list'); b.innerHTML = '';
    snap.forEach(c => { b.innerHTML += `<tr><td>${c.val().username}</td><td><button onclick="remove(bizRef('cashiers/${c.key}'))">Remove</button></td></tr>`; });
  });
  on('create-cashier-btn', 'click', () => {
    push(bizRef('cashiers'), {username: $('cashier-name').value, password: $('cashier-pass').value});
  });
}
