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
// Kicks users out instantly when deactivated from the owner panel
if (PAGE !== 'login.html' && getBizId()) {
  onValue(ref(db, `businesses/${getBizId()}/config/active`), snap => {
    // Only act if value explicitly set to false (not if missing)
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

// Admin page guard
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
  // Wire logout link everywhere
  on('logout-link', 'click', e => { e.preventDefault(); handleLogout(); });

  if (PAGE === 'login.html') {
    wireLOGIN();
    return;
  }

  // Load business details for navbar + all pages
  await loadStore();
  renderNavbar();

  // Page-specific setup
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
        // Auto-deactivate
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
  // Auto-uppercase business code
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

    // Check active
    if (config.active === false) {
      alert('⚠️ This account is deactivated.\nPlease contact Michael Web™ to renew — 08033441185');
      return;
    }

    // Check subscription expiry
    if (config.lastPaymentDate) {
      const lastPaid = new Date(config.lastPaymentDate);
      const expiry   = new Date(lastPaid.getFullYear(), lastPaid.getMonth() + 1, lastPaid.getDate() + 3);
      if (new Date() > expiry) {
        await update(ref(db, `businesses/${bizId}/config`), { active: false });
        alert('⚠️ Subscription expired.\nPlease contact Michael Web™ — 08033441185');
        return;
      }
      // Reminder
      const daysLeft = Math.ceil((expiry - new Date()) / 86400000);
      if (daysLeft <= 5) {
        alert(`⚠️ Payment reminder: Subscription expires in ${daysLeft} day(s).\nContact Michael Web™ — 08033441185`);
      }
    }

    // Verify credentials
    let authenticated = false;

    if (user === 'admin') {
      if (pass === (config.adminPassword || 'admin123')) {
        sessionStorage.setItem('isAdmin', 'true');
        authenticated = true;
      }
    } else {
      // Check cashiers
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
function wireINDEX() {
  // Nothing extra needed — cards are static links
}

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
    renderSellDropdown(); // Update sales dropdown too if open
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
    body.innerHTML = `<tr><td colspan="4" style="color:var(--muted);text-align:center;padding:32px">No items yet — add your first item above</td></tr>`;
    return;
  }

  body.innerHTML = inventory.map(item => `
    <tr>
      <td>${clean(item.name)}</td>
      <td>₦${Number(item.price).toLocaleString()}</td>
      <td>${Number(item.qty).toLocaleString()}</td>
      <td>
        <button class="btn btn-danger" style="padding:5px 12px;font-size:0.7rem"
          onclick="deleteItem('${item.id}','${clean(item.name)}')">Remove</button>
      </td>
    </tr>`).join('');
}

window.deleteItem = async (id, name) => {
  const ok = await verifyAdmin(`🔐 Enter admin password to remove "${name}":`);
  if (!ok) { alert('Incorrect password. Item not removed.'); return; }
  await remove(bizRef('inventory/' + id));
};

// ── SALES ─────────────────────────────────────────────────────────────────────
function wireSALES() {
  // Load inventory for dropdown
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
    inventory.map(i =>
      `<option value="${clean(i.name)}" ${i.name === current ? 'selected' : ''}>
        ${clean(i.name)} — ₦${Number(i.price).toLocaleString()} (${i.qty} left)
      </option>`
    ).join('');
}

function handleAddToCart() {
  const name = $('sell-item')?.value;
  const qty  = Number($('sell-qty')?.value);

  if (!name)       { alert('Please select an item.'); return; }
  if (!qty || qty < 1) { alert('Please enter a valid quantity.'); return; }

  const item = inventory.find(i => i.name === name);
  if (!item) { alert('Item not found. Please refresh the page.'); return; }
  if (qty > item.qty) { alert(`Only ${item.qty} in stock for "${item.name}".`); return; }

  const total     = qty * item.price;
  const cartIndex = cart.length;
  cart.push({ name: item.name, qty, price: item.price, total });

  const emptyRow = $('empty-row');
  if (emptyRow) emptyRow.remove();

  const tr = document.createElement('tr');
  tr.dataset.cartIndex = cartIndex;
  tr.innerHTML = `
    <td>${clean(item.name)}</td>
    <td>${qty}</td>
    <td>₦${Number(item.price).toLocaleString()}</td>
    <td>₦${total.toLocaleString()}</td>
    <td><button class="btn btn-danger" style="padding:5px 10px;font-size:0.7rem"
        onclick="removeFromCart(${cartIndex})">✕</button></td>`;
  $('sell-body').appendChild(tr);

  updateSubtotal();
  if ($('sell-qty')) $('sell-qty').value = '';
}

window.removeFromCart = (index) => {
  cart[index] = null;
  const row = $('sell-body')?.querySelector(`tr[data-cart-index="${index}"]`);
  if (row) row.remove();
  if (!cart.filter(Boolean).length) {
    cart = [];
    if ($('sell-body')) {
      $('sell-body').innerHTML = `<tr id="empty-row"><td colspan="5" style="color:var(--muted);text-align:center;padding:32px">Cart is empty</td></tr>`;
    }
  }
  updateSubtotal();
};

function updateSubtotal() {
  const total = cart.filter(Boolean).reduce((s, i) => s + i.total, 0);
  setText('subtotal', total.toLocaleString());
}

async function handlePrint() {
  cart = cart.filter(Boolean);
  if (!cart.length) { alert('Cart is empty.'); return; }

  const now          = new Date();
  const customerName = ($('customer-name')?.value.trim()) || 'Walk-in';

  // Show receipt
  const receiptEl = $('receipt');
  if (receiptEl) receiptEl.style.display = 'block';

  setText('r-store',    STORE.name);
  setText('r-address',  STORE.address);
  setText('r-phone',    STORE.phone);
  setText('r-customer', customerName);
  setText('r-cashier',  getCashier());
  setText('r-date',     now.toLocaleString());

  const rItems = $('r-items');
  if (rItems) {
    rItems.innerHTML = cart.map(i =>
      `<tr>
        <td>${clean(i.name)}</td>
        <td>${i.qty}</td>
        <td>₦${Number(i.price).toLocaleString()}</td>
        <td>₦${i.total.toLocaleString()}</td>
      </tr>`
    ).join('');
  }

  const grandTotal = cart.reduce((s, i) => s + i.total, 0);
  setText('r-subtotal', grandTotal.toLocaleString());
  setText('r-total',    grandTotal.toLocaleString());

  // Deduct stock from Firebase
  const updates = [];
  cart.forEach(cartItem => {
    const inv = inventory.find(i => i.name === cartItem.name);
    if (!inv) return;
    const newQty = inv.qty - cartItem.qty;
    if (newQty <= 0) {
      updates.push(remove(bizRef('inventory/' + inv.id)));
    } else {
      updates.push(update(bizRef('inventory/' + inv.id), { qty: newQty }));
    }
  });

  // Save sale record
  updates.push(push(bizRef('sales'), {
    cashier:   getCashier(),
    customer:  customerName,
    timestamp: now.toISOString(),
    total:     grandTotal,
    items:     cart.map(i => ({ name: i.name, qty: i.qty, price: i.price, total: i.total }))
  }));

  await Promise.all(updates).catch(console.error);

  // Reset cart
  cart = [];
  if ($('customer-name')) $('customer-name').value = '';
  if ($('sell-body')) {
    $('sell-body').innerHTML = `<tr id="empty-row"><td colspan="5" style="color:var(--muted);text-align:center;padding:32px">Cart is empty</td></tr>`;
  }
  setText('subtotal', '0');

  window.print();
}

// ── ADMIN ─────────────────────────────────────────────────────────────────────
function wireADMIN() {
  // Tabs
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

// ── CASHIERS ──────────────────────────────────────────────────────────────────
function wireCashiers() {
  on('create-cashier-btn', 'click', handleCreateCashier);

  onValue(bizRef('cashiers'), snap => {
    const body = $('cashier-list');
    if (!body) return;
    if (!snap.exists()) {
      body.innerHTML = `<tr><td colspan="2" style="color:var(--muted);text-align:center;padding:24px">No cashiers yet</td></tr>`;
      return;
    }
    const entries = [];
    snap.forEach(child => entries.push([child.key, child.val()]));
    body.innerHTML = entries.map(([id, c]) =>
      `<tr>
        <td>${clean(c.username)}</td>
        <td><button class="btn btn-danger" style="padding:6px 14px;font-size:0.7rem"
            onclick="deleteCashier('${id}','${clean(c.username)}')">Remove</button></td>
      </tr>`
    ).join('');
  });
}

async function handleCreateCashier() {
  const name = ($('cashier-name')?.value || '').trim();
  const pass = ($('cashier-pass')?.value || '').trim();
  if (!name || !pass) { alert('Please enter both username and password.'); return; }
  if (pass.length < 3) { alert('Password must be at least 3 characters.'); return; }
  await push(bizRef('cashiers'), { username: name, password: pass });
  alert(`Cashier "${name}" created successfully!`);
  if ($('cashier-name')) $('cashier-name').value = '';
  if ($('cashier-pass')) $('cashier-pass').value = '';
}

window.deleteCashier = async (id, name) => {
  if (!confirm(`Remove cashier "${name}"?`)) return;
  await remove(bizRef('cashiers/' + id));
};

// ── BUSINESS DETAILS ──────────────────────────────────────────────────────────
function wireBusiness() {
  // Pre-fill current values
  if ($('biz-name'))    $('biz-name').value    = STORE.name;
  if ($('biz-address')) $('biz-address').value = STORE.address;
  if ($('biz-phone'))   $('biz-phone').value   = STORE.phone;

  on('save-biz-btn', 'click', async () => {
    const name    = ($('biz-name')?.value    || '').trim();
    const address = ($('biz-address')?.value || '').trim();
    const phone   = ($('biz-phone')?.value   || '').trim();
    if (!name || !address || !phone) { alert('Please fill in all fields.'); return; }
    await update(bizRef('business'), { name, address, phone });
    STORE = { name, address, phone };
    renderNavbar();
    alert('Business details saved!');
  });

  on('change-pass-btn', 'click', async () => {
    const current  = ($('current-pass')?.value || '');
    const newPass  = ($('new-pass')?.value      || '').trim();
    const confirm2 = ($('confirm-pass')?.value  || '').trim();
    if (!current || !newPass || !confirm2) { alert('Please fill in all password fields.'); return; }
    if (newPass !== confirm2) { alert('New passwords do not match.'); return; }
    if (newPass.length < 4)  { alert('Password must be at least 4 characters.'); return; }
    const correct = await getAdminPw();
    if (current !== correct) { alert('Current password is incorrect.'); return; }
    await update(bizRef('config'), { adminPassword: newPass });
    adminCache = newPass;
    alert('Admin password changed successfully!');
    if ($('current-pass')) $('current-pass').value = '';
    if ($('new-pass'))     $('new-pass').value     = '';
    if ($('confirm-pass')) $('confirm-pass').value = '';
  });
}

// ── HISTORY ───────────────────────────────────────────────────────────────────
function wireHistory() {
  onValue(bizRef('sales'), snap => {
    allSales = [];
    if (snap.exists()) {
      snap.forEach(child => allSales.push({ id: child.key, ...child.val() }));
    }
    renderHistory();
  });

  on('clear-history-btn', 'click', async () => {
    if (!confirm('Clear ALL sales history? This cannot be undone.')) return;
    await remove(bizRef('sales'));
  });

  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      historyPeriod = btn.dataset.period;
      renderHistory();
    });
  });
}

function renderHistory() {
  const container = $('history-content');
  if (!container) return;

  if (!allSales.length) {
    container.innerHTML = `<div style="color:var(--muted);text-align:center;padding:40px">No sales recorded yet</div>`;
    return;
  }

  // Group sales by period
  const groups = {};
  allSales.forEach(sale => {
    const d = new Date(sale.timestamp);
    let key;
    if (historyPeriod === 'daily') {
      key = d.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'short', year:'numeric' });
    } else if (historyPeriod === 'weekly') {
      const sow = new Date(d); sow.setDate(d.getDate() - d.getDay());
      const eow = new Date(sow); eow.setDate(sow.getDate() + 6);
      key = `${sow.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${eow.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`;
    } else {
      key = d.toLocaleDateString('en-GB', { month:'long', year:'numeric' });
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push(sale);
  });

  container.innerHTML = Object.keys(groups).reverse().map(key => {
    const sales      = groups[key];
    const groupTotal = sales.reduce((s, sale) => s + (sale.total || 0), 0);

    const rows = [...sales].reverse().map(sale => {
      const time     = new Date(sale.timestamp).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
      const itemList = (sale.items || []).map(i => `${clean(i.name)} ×${i.qty}`).join(', ');
      return `<tr>
        <td style="color:var(--muted);font-size:0.75rem">${time}</td>
        <td>${clean(sale.cashier || '—')}</td>
        <td>${clean(sale.customer || 'Walk-in')}</td>
        <td style="font-size:0.75rem;color:var(--muted)">${itemList}</td>
        <td style="color:var(--accent3);font-weight:600">₦${(sale.total || 0).toLocaleString()}</td>
      </tr>`;
    }).join('');

    return `<div class="history-group">
      <div class="history-group-title">
        ${key}
        <span class="history-group-total">Total: <span>₦${groupTotal.toLocaleString()}</span></span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Time</th><th>Cashier</th><th>Customer</th><th>Items</th><th>Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');
}
