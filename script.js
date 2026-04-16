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
  return p || 'index.html';
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

// ── REAL-TIME SUBSCRIPTION GUARD ─────────────────────────────────────────────
if (PAGE !== 'login.html' && getBizId()) {
  onValue(ref(db, `businesses/${getBizId()}/config/active`), snap => {
    if (snap.exists() && snap.val() === false) {
      sessionStorage.clear();
      alert('⚠️ Your account has been deactivated.\nPlease contact Michael Web™ to renew — 08033441185');
      location.href = 'login.html';
    }
  });
}

// ── ADMIN PASSWORD HELPERS ────────────────────────────────────────────────────
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

if (PAGE === 'admin.html') {
  (async () => {
    const ok = await verifyAdmin('🔐 Enter admin password to access this page:');
    if (!ok) {
      alert('Incorrect password. Access denied.');
      location.href = 'index.html';
    }
  })();
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  on('logout-link', 'click', e => { e.preventDefault(); handleLogout(); });

  if (PAGE === 'login.html') {
    wireLOGIN();
    return;
  }

  await loadStore();
  renderNavbar();

  if (PAGE === 'index.html' || PAGE === '') {
    wireINDEX();
    loadSubscriptionCard();
  }
  if (PAGE === 'inventory.html') {
    wireINVENTORY();
  }
  if (PAGE === 'sales.html') {
    wireSALES();
  }
  if (PAGE === 'admin.html') {
    wireADMIN();
  }
});

// ── STORE ─────────────────────────────────────────────────────────────────────
async function loadStore() {
  try {
    const snap = await get(bizRef('business'));
    if (snap.exists()) {
      const d = snap.val();
      STORE.name    = d.name    || '';
      STORE.address = d.address || '';
      STORE.phone   = d.phone   || '';
    }
  } catch {}
}

function renderNavbar() {
  setText('c-name',    STORE.name);
  setText('c-address', STORE.address);
  setText('c-phone',   STORE.phone);
}

// ── SUBSCRIPTION CARD (Dashboard) ─────────────────────────────────────────────
async function loadSubscriptionCard() {
  try {
    const snap = await get(ref(db, `businesses/${getBizId()}/config`));
    if (!snap.exists()) return;
    const cfg = snap.val();
    const card = $('sub-card');
    if (!card) return;

    card.style.display = 'flex';
    setText('sub-biz', getBizId());

    if (cfg.lastPaymentDate) {
      const lastPaid = new Date(cfg.lastPaymentDate);
      const expiry   = new Date(lastPaid.getFullYear(), lastPaid.getMonth() + 1, lastPaid.getDate() + 3);
      const now      = new Date();
      const daysLeft = Math.ceil((expiry - now) / 86400000);

      setText('sub-dates', `Paid: ${lastPaid.toLocaleDateString('en-GB')} · Expires: ${expiry.toLocaleDateString('en-GB')}`);

      const statusEl = $('sub-status');
      if (now > expiry) {
        statusEl.innerHTML = `<span class="status-badge status-expired">Expired</span>`;
        update(ref(db, `businesses/${getBizId()}/config`), { active: false });
      } else if (daysLeft <= 5) {
        statusEl.innerHTML = `<span class="status-badge" style="background:rgba(255,193,7,0.1);color:#ffc107;border:1px solid rgba(255,193,7,0.3)">⚠️ ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left</span>`;
      } else {
        statusEl.innerHTML = `<span class="status-badge status-active">Active · ${daysLeft} days</span>`;
      }
    }
  } catch {}
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
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
  if (btn) { btn.textContent = 'Signing in...'; btn.disabled = true; }

  try {
    const snap = await get(ref(db, `businesses/${bizId}`));
    if (!snap.exists()) {
      alert('Business code not found.\nContact Michael Web™ — 08033441185');
      return;
    }

    const data   = snap.val();
    const config = data.config || {};

    if (config.active === false) {
      alert('⚠️ This account is deactivated.\nPlease contact Michael Web™ to renew — 08033441185');
      return;
    }

    if (config.lastPaymentDate) {
      const lastPaid = new Date(config.lastPaymentDate);
      const expiry   = new Date(lastPaid.getFullYear(), lastPaid.getMonth() + 1, lastPaid.getDate() + 3);
      if (new Date() > expiry) {
        await update(ref(db, `businesses/${bizId}/config`), { active: false });
        alert('⚠️ Subscription expired.\nPlease contact Michael Web™ — 08033441185');
        return;
      }
      const daysLeft = Math.ceil((expiry - new Date()) / 86400000);
      if (daysLeft <= 5) {
        alert(`⚠️ Payment reminder: Subscription expires in ${daysLeft} day(s).\nContact Michael Web™ — 08033441185`);
      }
    }

    let authenticated = false;
    if (user === 'admin') {
      if (pass === (config.adminPassword || 'admin123')) {
        sessionStorage.setItem('isAdmin', 'true');
        authenticated = true;
      }
    } else {
      const cashiers = data.cashiers || {};
      authenticated = Object.values(cashiers).some(c => c.username === user && c.password === pass);
    }

    if (authenticated) {
      sessionStorage.setItem('posAuth', 'true');
      sessionStorage.setItem('cashier', user);
      sessionStorage.setItem('bizId', bizId);
      location.href = 'index.html';
    } else {
      alert('Wrong username or password.');
    }
  } catch (err) {
    alert('Connection error. Please check your internet and try again.');
    console.error(err);
  } finally {
    if (btn) { btn.textContent = 'Sign In →'; btn.disabled = false; }
  }
}

// ── LOGOUT ────────────────────────────────────────────────────────────────────
function handleLogout() {
  if (!confirm('Sign out?')) return;
  sessionStorage.clear();
  location.href = 'login.html';
}

// ── INDEX ─────────────────────────────────────────────────────────────────────
function wireINDEX() {}

// ── INVENTORY ─────────────────────────────────────────────────────────────────
function wireINVENTORY() {
  on('add-item', 'click', handleAddItem);
  onValue(bizRef('inventory'), snap => {
    inventory = [];
    if (snap.exists()) {
      snap.forEach(child => {
        inventory.push({ id: child.key, ...child.val() });
      });
    }
    renderInventory();
    renderSellDropdown();
  });
}

function handleAddItem() {
  const name  = ($('item-name')?.value || '').trim();
  const price = Number($('item-price')?.value);
  const qty   = Number($('item-quantity')?.value);

  if (!name)  { alert('Please enter an item name.'); return; }
  if (!price || price <= 0) { alert('Please enter a valid price.'); return; }
  if (!qty   || qty <= 0)   { alert('Please enter a valid quantity.'); return; }

  push(bizRef('inventory'), { name, price, qty });
  if ($('item-name'))     $('item-name').value = '';
  if ($('item-price'))    $('item-price').value = '';
  if ($('item-quantity')) $('item-quantity').value = '';
}

function renderInventory() {
  const body = $('inventory-body');
  if (!body) return;
  if (!inventory.length) {
    body.innerHTML = `<tr><td colspan="4" style="color:var(--muted);text-align:center;padding:32px">No items yet</td></tr>`;
    return;
  }
  body.innerHTML = inventory.map(item => `
    <tr>
      <td>${clean(item.name)}</td>
      <td>₦${Number(item.price).toLocaleString()}</td>
      <td>${Number(item.qty).toLocaleString()}</td>
      <td><button class="btn btn-danger" style="padding:5px 12px;font-size:0.7rem" onclick="deleteItem('${item.id}','${clean(item.name)}')">Remove</button></td>
    </tr>`).join('');
}

window.deleteItem = async (id, name) => {
  const ok = await verifyAdmin(`🔐 Enter admin password to remove "${name}":`);
  if (!ok) { alert('Incorrect password.'); return; }
  await remove(bizRef('inventory/' + id));
};

// ── SALES ─────────────────────────────────────────────────────────────────────
function wireSALES() {
  onValue(bizRef('inventory'), snap => {
    inventory = [];
    if (snap.exists()) {
      snap.forEach(child => inventory.push({ id: child.key, ...child.val() }));
    }
    renderSellDropdown();
  });
  on('sell-btn',  'click', handleAddToCart);
  on('print-btn', 'click', handlePrint);
}

function renderSellDropdown() {
  const sel = $('sell-item');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">-- Select Item --</option>` +
    inventory.map(i => `<option value="${clean(i.name)}" ${i.name === current ? 'selected' : ''}>${clean(i.name)} — ₦${Number(i.price).toLocaleString()} (${i.qty} left)</option>`).join('');
}

function handleAddToCart() {
  const name = $('sell-item')?.value;
  const qty  = Number($('sell-qty')?.value);
  if (!name || qty < 1) { alert('Invalid selection or quantity.'); return; }
  const item = inventory.find(i => i.name === name);
  if (qty > item.qty) { alert(`Only ${item.qty} left.`); return; }

  const total = qty * item.price;
  const cartIndex = cart.length;
  cart.push({ name: item.name, qty, price: item.price, total });

  const emptyRow = $('empty-row');
  if (emptyRow) emptyRow.remove();

  const tr = document.createElement('tr');
  tr.dataset.cartIndex = cartIndex;
  tr.innerHTML = `<td>${clean(item.name)}</td><td>${qty}</td><td>₦${Number(item.price).toLocaleString()}</td><td>₦${total.toLocaleString()}</td><td><button class="btn btn-danger" style="padding:5px 10px;font-size:0.7rem" onclick="removeFromCart(${cartIndex})">✕</button></td>`;
  $('sell-body').appendChild(tr);
  updateSubtotal();
  if ($('sell-qty')) $('sell-qty').value = '';
}

window.removeFromCart = (index) => {
  cart[index] = null;
  const row = $('sell-body')?.querySelector(`tr[data-cart-index="${index}"]`);
  if (row) row.remove();
  updateSubtotal();
};

function updateSubtotal() {
  const total = cart.filter(Boolean).reduce((s, i) => s + i.total, 0);
  setText('subtotal', total.toLocaleString());
}

async function handlePrint() {
  cart = cart.filter(Boolean);
  if (!cart.length) return;
  const now = new Date();
  const customerName = ($('customer-name')?.value.trim()) || 'Walk-in';

  const updates = [];
  cart.forEach(cartItem => {
    const inv = inventory.find(i => i.name === cartItem.name);
    const newQty = inv.qty - cartItem.qty;
    updates.push(newQty <= 0 ? remove(bizRef('inventory/' + inv.id)) : update(bizRef('inventory/' + inv.id), { qty: newQty }));
  });

  updates.push(push(bizRef('sales'), {
    cashier: getCashier(),
    customer: customerName,
    timestamp: now.toISOString(),
    total: cart.reduce((s, i) => s + i.total, 0),
    items: cart.map(i => ({ name: i.name, qty: i.qty, price: i.price, total: i.total }))
  }));

  await Promise.all(updates);
  cart = [];
  window.print();
  location.reload();
}

// ── ADMIN ─────────────────────────────────────────────────────────────────────
function wireADMIN() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $('tab-' + btn.dataset.tab)?.classList.add('active');
    });
  });
  wireCashiers();
  wireHistory();
  wireBusiness();
}

function wireCashiers() {
  on('create-cashier-btn', 'click', handleCreateCashier);
  onValue(bizRef('cashiers'), snap => {
    const body = $('cashier-list');
    if (!body) return;
    const entries = [];
    snap.forEach(child => entries.push([child.key, child.val()]));
    body.innerHTML = entries.map(([id, c]) => `<tr><td>${clean(c.username)}</td><td><button class="btn btn-danger" style="padding:6px 14px;font-size:0.7rem" onclick="deleteCashier('${id}','${clean(c.username)}')">Remove</button></td></tr>`).join('');
  });
}

async function handleCreateCashier() {
  const name = ($('cashier-name')?.value || '').trim();
  const pass = ($('cashier-pass')?.value || '').trim();
  if (name && pass) await push(bizRef('cashiers'), { username: name, password: pass });
}

window.deleteCashier = async (id, name) => {
  if (confirm(`Remove cashier "${name}"?`)) await remove(bizRef('cashiers/' + id));
};

function wireBusiness() {
  if ($('biz-name'))    $('biz-name').value    = STORE.name;
  on('save-biz-btn', 'click', async () => {
    const name = $('biz-name').value, address = $('biz-address').value, phone = $('biz-phone').value;
    await update(bizRef('business'), { name, address, phone });
    alert('Saved!');
  });
}

function wireHistory() {
  onValue(bizRef('sales'), snap => {
    allSales = [];
    if (snap.exists()) snap.forEach(child => allSales.push({ id: child.key, ...child.val() }));
    renderHistory();
  });
}

function renderHistory() {
  const container = $('history-content');
  if (!container || !allSales.length) return;
  const groups = {};
  allSales.forEach(sale => {
    const key = new Date(sale.timestamp).toLocaleDateString('en-GB');
    if (!groups[key]) groups[key] = [];
    groups[key].push(sale);
  });
  container.innerHTML = Object.keys(groups).reverse().map(key => {
    const sales = groups[key];
    const rows = sales.map(sale => `<tr><td>${new Date(sale.timestamp).toLocaleTimeString()}</td><td>${clean(sale.cashier)}</td><td>₦${sale.total.toLocaleString()}</td></tr>`).join('');
    return `<div class="history-group"><h3>${key}</h3><table>${rows}</table></div>`;
  }).join('');
}
