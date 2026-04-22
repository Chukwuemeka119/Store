import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, push, onValue, get, update, remove, set, runTransaction }
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
function getCashier() { return sessionStorage.getItem('cashier') || 'Admin'; }
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
  if (PAGE === 'login.html') { wireLOGIN(); return; }
  await loadStore();
  renderNavbar();
  if (PAGE === 'index.html' || PAGE === '') { wireINDEX(); loadSubscriptionCard(); }
  if (PAGE === 'inventory.html') { wireINVENTORY(); }
  if (PAGE === 'sales.html') { wireSALES(); }
  if (PAGE === 'admin.html') { wireADMIN(); }
});

async function loadStore() {
  try {
    const snap = await get(bizRef('business'));
    if (snap.exists()) {
      const d = snap.val();
      STORE.name = d.name || ''; STORE.address = d.address || ''; STORE.phone = d.phone || '';
    }
  } catch {}
}

function renderNavbar() {
  setText('c-name', STORE.name); setText('c-address', STORE.address); setText('c-phone', STORE.phone);
}

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
      const expiry = new Date(lastPaid.getFullYear(), lastPaid.getMonth() + 1, lastPaid.getDate() + 3);
      const now = new Date();
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

function wireLOGIN() {
  const bizEl = $('bizcode');
  if (bizEl) bizEl.addEventListener('input', () => { bizEl.value = bizEl.value.toUpperCase(); });
  on('login-btn', 'click', handleLogin);
  on('password', 'keydown', e => { if (e.key === 'Enter') handleLogin(); });
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
    if (!snap.exists()) { alert('Business code not found.'); return; }
    const data = snap.val(); const config = data.config || {};
    if (config.active === false) { alert('⚠️ Deactivated.'); return; }
    let authenticated = false;
    if (user === 'admin') {
      if (pass === (config.adminPassword || 'admin123')) { authenticated = true; }
    } else {
      const cashiers = data.cashiers || {};
      authenticated = Object.values(cashiers).some(c => c.username === user && c.password === pass);
    }
    if (authenticated) {
      sessionStorage.setItem('posAuth', 'true');
      sessionStorage.setItem('cashier', user);
      sessionStorage.setItem('bizId', bizId);
      location.href = 'index.html';
    } else { alert('Wrong credentials.'); }
  } catch (err) { alert('Error logging in.'); } finally { if (btn) { btn.textContent = 'Sign In →'; btn.disabled = false; } }
}

function handleLogout() { if (confirm('Sign out?')) { sessionStorage.clear(); location.href = 'login.html'; } }

function wireINDEX() {}

function wireINVENTORY() {
  on('add-item', 'click', handleAddItem);
  onValue(bizRef('inventory'), snap => {
    inventory = [];
    if (snap.exists()) snap.forEach(child => { inventory.push({ id: child.key, ...child.val() }); });
    renderInventory();
  });
}

function handleAddItem() {
  const name = ($('item-name')?.value || '').trim();
  const price = Number($('item-price')?.value);
  const qty = Number($('item-quantity')?.value);
  if (!name || price <= 0 || qty <= 0) { alert('Invalid input.'); return; }
  push(bizRef('inventory'), { name, price, qty });
  $('item-name').value = ''; $('item-price').value = ''; $('item-quantity').value = '';
}

function renderInventory() {
  const body = $('inventory-body'); if (!body) return;
  if (!inventory.length) { body.innerHTML = `<tr><td colspan="4" style="text-align:center">Empty</td></tr>`; return; }
  body.innerHTML = inventory.map(item => `
    <tr><td>${clean(item.name)}</td><td>₦${Number(item.price).toLocaleString()}</td><td>${item.qty}</td>
    <td><button class="btn btn-danger" onclick="deleteItem('${item.id}','${clean(item.name)}')">Remove</button></td></tr>`).join('');
}

window.deleteItem = async (id, name) => {
  if (await verifyAdmin(`🔐 Confirm delete "${name}":`)) await remove(bizRef('inventory/' + id));
};

function wireSALES() {
  onValue(bizRef('inventory'), snap => {
    inventory = [];
    if (snap.exists()) snap.forEach(child => { inventory.push({ id: child.key, ...child.val() }); });
    renderSellDropdown();
  });
  on('sell-btn', 'click', handleAddToCart);
  on('print-btn', 'click', handlePrint);
}

function renderSellDropdown() {
  const sel = $('sell-item'); if (!sel) return;
  sel.innerHTML = `<option value="">-- Select Item --</option>` +
    inventory.map(i => `<option value="${clean(i.name)}">${clean(i.name)} — ₦${Number(i.price).toLocaleString()} (${i.qty} left)</option>`).join('');
}

function handleAddToCart() {
  const name = $('sell-item')?.value; const qty = Number($('sell-qty')?.value);
  if (!name || qty < 1) return;
  const item = inventory.find(i => i.name === name);
  if (!item || qty > item.qty) { alert('Stock limit exceeded.'); return; }
  cart.push({ name: item.name, qty, price: item.price, total: qty * item.price });
  updateCartUI();
}

function updateCartUI() {
  const body = $('sell-body'); if (!body) return;
  body.innerHTML = cart.map((i, idx) => `
    <tr><td>${clean(i.name)}</td><td>${i.qty}</td><td>₦${Number(i.price).toLocaleString()}</td><td>₦${i.total.toLocaleString()}</td>
    <td><button class="btn btn-danger" onclick="removeFromCart(${idx})">✕</button></td></tr>`).join('');
  const total = cart.reduce((s, i) => s + i.total, 0);
  setText('subtotal', total.toLocaleString());
}

window.removeFromCart = (idx) => { cart.splice(idx, 1); updateCartUI(); };

// FIX: ENHANCED PRINT DETAIL
async function handlePrint() {
  const validCart = cart.filter(Boolean);
  if (!validCart.length) { alert('Cart is empty.'); return; }

  const now = new Date();
  const customerName = ($('customer-name')?.value.trim()) || 'Walk-in';
  const cashierName  = getCashier();

  const receiptEl = $('receipt');
  if (receiptEl) receiptEl.style.display = 'block';

  setText('r-store',    STORE.name || 'StockSavvy Store');
  setText('r-address',  STORE.address || '');
  setText('r-phone',    STORE.phone || '');
  setText('r-customer', customerName);
  setText('r-cashier',  cashierName);
  setText('r-date',     now.toLocaleString('en-GB'));

  const rItems = $('r-items');
  if (rItems) {
    rItems.innerHTML = validCart.map(i => `
      <tr>
        <td style="text-align:left; padding: 4px 0;">${clean(i.name)}</td>
        <td style="text-align:center;">${i.qty}</td>
        <td style="text-align:right;">₦${Number(i.price).toLocaleString()}</td>
        <td style="text-align:right;">₦${(i.qty * i.price).toLocaleString()}</td>
      </tr>`).join('');
  }

  const grandTotal = validCart.reduce((s, i) => s + i.total, 0);
  setText('r-subtotal', grandTotal.toLocaleString());
  setText('r-total',    grandTotal.toLocaleString());

  // Use runTransaction for each item — ensures accurate stock even with concurrent sales
  const stockErrors = [];
  await Promise.all(validCart.map(ci => {
    const inv = inventory.find(i => i.name === ci.name);
    if (!inv) return Promise.resolve();
    return runTransaction(bizRef('inventory/' + inv.id + '/qty'), currentQty => {
      const qty = currentQty ?? inv.qty;
      if (qty < ci.qty) {
        // Not enough stock — abort transaction
        stockErrors.push(`"${ci.name}" has only ${qty} left in stock.`);
        return; // returning undefined aborts the transaction
      }
      const newQty = qty - ci.qty;
      return newQty <= 0 ? null : newQty; // null removes the item
    }).then(result => {
      // If qty reaches 0, remove the whole inventory entry
      if (result.snapshot.val() === null || result.snapshot.val() === 0) {
        return remove(bizRef('inventory/' + inv.id));
      }
    });
  }));

  if (stockErrors.length) {
    alert('Stock error:\n' + stockErrors.join('\n') + '\n\nSale cancelled.');
    return;
  }

  await push(bizRef('sales'), {
    cashier:   cashierName,
    customer:  customerName,
    timestamp: now.toISOString(),
    total:     grandTotal,
    items:     validCart.map(i => ({ name: i.name, qty: i.qty, price: i.price, total: i.total }))
  });
  cart = []; updateCartUI(); if ($('customer-name')) $('customer-name').value = '';
  window.print();
}

function wireADMIN() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn, .tab-panel').forEach(el => el.classList.remove('active'));
      btn.classList.add('active'); $('tab-' + btn.dataset.tab)?.classList.add('active');
    });
  });
  wireCashiers(); wireHistory(); wireBusiness();
}

function wireCashiers() {
  on('create-cashier-btn', 'click', async () => {
    const u = $('cashier-name').value.trim(); const p = $('cashier-pass').value.trim();
    if (u && p) { await push(bizRef('cashiers'), { username: u, password: p }); $('cashier-name').value = ''; $('cashier-pass').value = ''; }
  });
  onValue(bizRef('cashiers'), snap => {
    const list = $('cashier-list'); if (!list) return;
    const items = []; if (snap.exists()) snap.forEach(c => { items.push([c.key, c.val()]); });
    list.innerHTML = items.map(([id, c]) => `<tr><td>${clean(c.username)}</td><td><button onclick="deleteCashier('${id}')">Remove</button></td></tr>`).join('');
  });
}
window.deleteCashier = (id) => remove(bizRef('cashiers/' + id));

function wireBusiness() {
  if ($('biz-name')) { $('biz-name').value = STORE.name; $('biz-address').value = STORE.address; $('biz-phone').value = STORE.phone; }
  on('save-biz-btn', 'click', () => {
    const n = $('biz-name').value; const a = $('biz-address').value; const p = $('biz-phone').value;
    update(bizRef('business'), { name: n, address: a, phone: p });
  });
}

function wireHistory() {
  onValue(bizRef('sales'), snap => {
    allSales = []; if (snap.exists()) snap.forEach(c => { allSales.push({ id: c.key, ...c.val() }); });
    renderHistory();
  });
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); historyPeriod = btn.dataset.period; renderHistory();
    });
  });
}

// FIX: ENHANCED SALES HISTORY WITH CASHIER NAMES
function renderHistory() {
  const container = $('history-content'); if (!container) return;
  if (!allSales.length) { container.innerHTML = `<div style="text-align:center;padding:40px">No records</div>`; return; }

  const groups = {};
  allSales.forEach(sale => {
    const d = new Date(sale.timestamp);
    const key = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    if (!groups[key]) groups[key] = []; groups[key].push(sale);
  });

  container.innerHTML = Object.keys(groups).reverse().map(key => {
    const sales = groups[key];
    const groupTotal = sales.reduce((s, sale) => s + (Number(sale.total) || 0), 0);
    const rows = [...sales].reverse().map(sale => {
      const time = new Date(sale.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const itemsText = (sale.items || []).map(i => `${clean(i.name)} (x${i.qty})`).join(', ');
      return `
        <tr>
          <td style="color:var(--muted); font-size:0.75rem">${time}</td>
          <td><span style="font-weight:600; color:var(--primary)">${clean(sale.cashier || 'Admin')}</span></td>
          <td>${clean(sale.customer || 'Walk-in')}</td>
          <td style="font-size:0.7rem; color:var(--muted)">${itemsText}</td>
          <td style="color:var(--accent3); font-weight:600">₦${(Number(sale.total) || 0).toLocaleString()}</td>
        </tr>`;
    }).join('');

    return `
      <div class="history-group">
        <div class="history-group-title">${key} <span>Total: ₦${groupTotal.toLocaleString()}</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Time</th><th>Cashier</th><th>Customer</th><th>Items</th><th>Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
  }).join('');
}