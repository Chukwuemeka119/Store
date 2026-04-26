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

function showToast(message, type = 'info') {
  let toast = $('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast toast-${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── STATE ─────────────────────────────────────────────────────────────────────
let STORE         = { name: '', address: '', phone: '' };
let inventory     = [];
let inventoryFilter = '';
let cart          = [];
let allSales      = [];
let salesPage     = 0;
const PAGE_SIZE   = 20;
let historyPeriod = 'daily';
let reportPeriod  = 'daily';
let adminCache    = null;
const LOW_STOCK_THRESHOLD = 5;
let lowStockAlertShown = false;

function checkLowStockAlert() {
  const lowItems = inventory.filter(i => i.qty <= LOW_STOCK_THRESHOLD);
  if (lowItems.length && !lowStockAlertShown) {
    lowStockAlertShown = true;
    const names = lowItems.map(i => i.name).join(', ');
    showToast(`\u26A0\uFE0F Low stock: ${lowItems.length} item(s) at/below ${LOW_STOCK_THRESHOLD} units (${names})`, 'warning');
  }
}

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
      showToast('\u26A0\uFE0F Your account has been deactivated. Contact Michael Web\u2122 \u2014 08033441185', 'error');
      setTimeout(() => { location.href = 'login.html'; }, 2000);
    }
  });
}

// ── ADMIN PASSWORD HELPERS ────────────────────────────────────────────────────
// FIX: Read full config object (parent .read:true allows this; avoids .read:false on adminPassword subnode)
async function getAdminPw() {
  if (adminCache) return adminCache;
  try {
    const snap = await get(bizRef('config'));
    adminCache = snap.exists() ? (snap.val().adminPassword || 'admin123') : 'admin123';
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
    const ok = await verifyAdmin('\uD83D\uDD10 Enter admin password to access this page:');
    if (!ok) {
      showToast('Incorrect password. Access denied.', 'error');
      setTimeout(() => { location.href = 'index.html'; }, 1500);
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

// ── SUBSCRIPTION ──────────────────────────────────────────────────────────────
// FIX: Expiry = last day of payment month + 3 grace days (now consistent with setup-business.html)
function calcExpiry(lastPaidDate) {
  const lastDayOfMonth = new Date(lastPaidDate.getFullYear(), lastPaidDate.getMonth() + 1, 0);
  return new Date(lastDayOfMonth.getTime() + 3 * 24 * 60 * 60 * 1000);
}

async function loadSubscriptionCard() {
  try {
    const snap = await get(ref(db, `businesses/${getBizId()}/config`));
    if (!snap.exists()) return;
    const cfg  = snap.val();
    const card = $('sub-card');
    if (!card) return;
    card.style.display = 'flex';
    setText('sub-biz', getBizId());
    if (cfg.lastPaymentDate) {
      const lastPaid = new Date(cfg.lastPaymentDate);
      const expiry   = calcExpiry(lastPaid);
      const now      = new Date();
      const daysLeft = Math.ceil((expiry - now) / 86400000);
      setText('sub-dates', `Paid: ${lastPaid.toLocaleDateString('en-GB')} \u00B7 Expires: ${expiry.toLocaleDateString('en-GB')}`);
      const statusEl = $('sub-status');
      if (now > expiry) {
        statusEl.innerHTML = `<span class="status-badge status-expired">Expired</span>`;
        update(ref(db, `businesses/${getBizId()}/config`), { active: false });
        update(ref(db, `directory/${getBizId()}/config`), { active: false });
      } else if (daysLeft <= 5) {
        statusEl.innerHTML = `<span class="status-badge" style="background:rgba(255,193,7,0.1);color:#ffc107;border:1px solid rgba(255,193,7,0.3)">\u26A0\uFE0F ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left</span>`;
      } else {
        statusEl.innerHTML = `<span class="status-badge status-active">Active \u00B7 ${daysLeft} days</span>`;
      }
    }
  } catch {}
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function wireLOGIN() {
  const bizEl = $('bizcode');
  if (bizEl) bizEl.addEventListener('input', () => { bizEl.value = bizEl.value.toUpperCase(); });
  on('login-btn', 'click', handleLogin);
  on('password', 'keydown', e => { if (e.key === 'Enter') handleLogin(); });
}

async function handleLogin() {
  const bizId = ($('bizcode')?.value  || '').trim().toUpperCase();
  const user  = ($('username')?.value || '').trim();
  const pass  = ($('password')?.value || '').trim();
  if (!bizId || !user || !pass) { showToast('Please fill in all fields.', 'error'); return; }
  const btn = $('login-btn');
  if (btn) { btn.textContent = 'Signing in...'; btn.disabled = true; }
  try {
    const snap = await get(ref(db, `businesses/${bizId}`));
    if (!snap.exists()) { alert('Business code not found.'); return; }
    const data   = snap.val();
    const config = data.config || {};
    if (config.active === false) { alert('\u26A0\uFE0F This account is deactivated. Contact Michael Web\u2122 \u2014 08033441185'); return; }

    // Subscription expiry check at login using consistent formula
    if (config.lastPaymentDate) {
      const lastPaid = new Date(config.lastPaymentDate);
      const expiry   = calcExpiry(lastPaid);
      if (new Date() > expiry) {
        await update(ref(db, `businesses/${bizId}/config`), { active: false });
        await update(ref(db, `directory/${bizId}/config`), { active: false });
        alert('\u26A0\uFE0F Subscription expired. Please renew \u2014 Michael Web\u2122 08033441185');
        return;
      }
    }

    let authenticated = false;
    if (user === 'admin') {
      authenticated = pass === (config.adminPassword || 'admin123');
    } else {
      const cashiers = data.cashiers || {};
      authenticated = Object.values(cashiers).some(c => c.username === user && c.password === pass);
    }
    if (authenticated) {
      sessionStorage.setItem('posAuth', 'true');
      sessionStorage.setItem('cashier', user);
      sessionStorage.setItem('bizId', bizId);
      location.href = 'index.html';
    } else { alert('Wrong credentials. Please try again.'); }
  } catch (err) { console.error(err); alert('Error logging in. Check connection.'); }
  finally { if (btn) { btn.textContent = 'Sign In \u2192'; btn.disabled = false; } }
}

function handleLogout() {
  if (confirm('Sign out?')) { sessionStorage.clear(); location.href = 'login.html'; }
}

function wireINDEX() {}

// ── INVENTORY ─────────────────────────────────────────────────────────────────
function wireINVENTORY() {
  on('add-item', 'click', handleAddItem);
  on('inventory-search', 'input', e => {
    inventoryFilter = e.target.value.trim().toLowerCase();
    renderInventory();
  });
  on('export-csv', 'click', exportInventoryCSV);
  onValue(bizRef('inventory'), snap => {
    inventory = [];
    if (snap.exists()) snap.forEach(child => { inventory.push({ id: child.key, ...child.val() }); });
    renderInventory();
    checkLowStockAlert();
  });
}

function handleAddItem() {
  const name  = ($('item-name')?.value  || '').trim();
  const price = Number($('item-price')?.value);
  const qty   = Number($('item-quantity')?.value);
  if (!name || price < 0 || qty < 0 || isNaN(price) || isNaN(qty)) { alert('Invalid input. Name is required, price and quantity must be 0 or more.'); return; }
  push(bizRef('inventory'), { name, price, qty });
  $('item-name').value = ''; $('item-price').value = ''; $('item-quantity').value = '';
  showToast(`"${name}" added.`, 'success');
}

function renderInventory() {
  const body = $('inventory-body'); if (!body) return;
  const filtered = inventory.filter(item => item.name.toLowerCase().includes(inventoryFilter));
  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--muted)">No matching items</td></tr>`;
    return;
  }
  body.innerHTML = filtered.map(item => `
    <tr>
      <td>${clean(item.name)}</td>
      <td>\u20A6${Number(item.price).toLocaleString()}</td>
      <td${item.qty <= LOW_STOCK_THRESHOLD ? ' style="color:#d9534f;font-weight:bold"' : ''}>${item.qty}${item.qty <= LOW_STOCK_THRESHOLD ? ' \u26A0\uFE0F' : ''}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-secondary" style="padding:6px 12px;font-size:0.7rem" onclick="editItem('${item.id}','${clean(item.name).replace(/'/g,"\\'")}',${item.price},${item.qty})">&#9998; Edit</button>
        <button class="btn btn-danger" style="padding:6px 12px;font-size:0.7rem" onclick="deleteItem('${item.id}','${clean(item.name).replace(/'/g,"\\'")}')">&#10005; Remove</button>
      </td>
    </tr>`).join('');
}

window.editItem = async (id, curName, curPrice, curQty) => {
  const newName = window.prompt('Item name:', curName);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed) { alert('Name cannot be empty.'); return; }
  const rawPrice = window.prompt('Price (\u20A6):', curPrice);
  if (rawPrice === null) return;
  const newPrice = Number(rawPrice);
  if (isNaN(newPrice) || newPrice < 0) { alert('Invalid price.'); return; }
  const rawQty = window.prompt('Quantity:', curQty);
  if (rawQty === null) return;
  const newQty = Number(rawQty);
  if (isNaN(newQty) || newQty < 0) { alert('Invalid quantity.'); return; }
  await update(bizRef('inventory/' + id), { name: trimmed, price: newPrice, qty: newQty });
  showToast('Item updated.', 'success');
};

window.deleteItem = async (id, name) => {
  if (await verifyAdmin(`\uD83D\uDD10 Confirm delete "${name}":`)) {
    await remove(bizRef('inventory/' + id));
    showToast(`"${name}" removed.`, 'success');
  }
};

function exportInventoryCSV() {
  if (!inventory.length) { showToast('No inventory to export.', 'info'); return; }
  const header = ['Item Name', 'Price (NGN)', 'Quantity'];
  const rows = inventory.map(i => [
    `"${(i.name || '').replace(/"/g, '""')}"`,
    Number(i.price).toFixed(2),
    i.qty
  ]);
  const csv  = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${(STORE.name || 'inventory').replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Inventory exported.', 'success');
}

// ── SALES ─────────────────────────────────────────────────────────────────────
function wireSALES() {
  onValue(bizRef('inventory'), snap => {
    inventory = [];
    if (snap.exists()) snap.forEach(child => { inventory.push({ id: child.key, ...child.val() }); });
    renderSellDropdown();
    checkLowStockAlert();
  });
  on('sell-btn',  'click', handleAddToCart);
  on('print-btn', 'click', handlePrint);
}

function renderSellDropdown() {
  const sel = $('sell-item'); if (!sel) return;
  sel.innerHTML = `<option value="">-- Select Item --</option>` +
    inventory.map(i => `<option value="${i.id}">${clean(i.name)} \u2014 \u20A6${Number(i.price).toLocaleString()} (${i.qty} left)</option>`).join('');
}

function handleAddToCart() {
  const itemId = $('sell-item')?.value;
  const qty    = Number($('sell-qty')?.value);
  if (!itemId || qty < 1) return;
  const item = inventory.find(i => i.id === itemId);
  if (!item) { alert('Item not found.'); return; }
  if (qty > item.qty) { alert(`Only ${item.qty} left in stock.`); return; }
  cart.push({ itemId: item.id, name: item.name, qty, price: item.price, total: qty * item.price });
  updateCartUI();
}

function updateCartUI() {
  const body = $('sell-body'); if (!body) return;
  body.innerHTML = cart.map((i, idx) => `
    <tr>
      <td>${clean(i.name)}</td>
      <td>${i.qty}</td>
      <td>\u20A6${Number(i.price).toLocaleString()}</td>
      <td>\u20A6${i.total.toLocaleString()}</td>
      <td><button class="btn btn-danger" onclick="removeFromCart(${idx})">&#10005;</button></td>
    </tr>`).join('');
  const total = cart.reduce((s, i) => s + i.total, 0);
  setText('subtotal', total.toLocaleString());
}

window.removeFromCart = (idx) => { cart.splice(idx, 1); updateCartUI(); };

async function handlePrint() {
  const validCart = cart.filter(Boolean);
  if (!validCart.length) { alert('Cart is empty.'); return; }

  // PRE-CHECK: client-side stock guard before committing transactions
  const preErrors = [];
  for (const ci of validCart) {
    const inv = inventory.find(i => i.id === ci.itemId) || inventory.find(i => i.name === ci.name);
    if (!inv) { preErrors.push(`"${ci.name}" not found in inventory.`); continue; }
    if (inv.qty < ci.qty) { preErrors.push(`"${ci.name}" has only ${inv.qty} left (need ${ci.qty}).`); }
  }
  if (preErrors.length) { alert('Stock check failed:\n' + preErrors.join('\n')); return; }

  const now          = new Date();
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
        <td style="text-align:left;padding:4px 0">${clean(i.name)}</td>
        <td style="text-align:center">${i.qty}</td>
        <td style="text-align:right">\u20A6${Number(i.price).toLocaleString()}</td>
        <td style="text-align:right">\u20A6${(i.qty * i.price).toLocaleString()}</td>
      </tr>`).join('');
  }

  const grandTotal = validCart.reduce((s, i) => s + i.total, 0);
  setText('r-subtotal', grandTotal.toLocaleString());
  setText('r-total',    grandTotal.toLocaleString());

  // Atomic stock deduction via transactions
  const stockErrors = [];
  await Promise.all(validCart.map(ci => {
    const inv = inventory.find(i => i.id === ci.itemId) || inventory.find(i => i.name === ci.name);
    if (!inv) return Promise.resolve();
    return runTransaction(bizRef('inventory/' + inv.id + '/qty'), currentQty => {
      const qty = currentQty ?? 0;
      if (qty < ci.qty) { stockErrors.push(`"${ci.name}" has only ${qty} left.`); return; }
      return Math.max(0, qty - ci.qty);
    }).then(result => {
      if (result.committed && result.snapshot.val() === 0) {
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

  cart = []; updateCartUI();
  if ($('customer-name')) $('customer-name').value = '';
  window.print();
}

// ── ADMIN ─────────────────────────────────────────────────────────────────────
function wireADMIN() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn, .tab-panel').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
      $('tab-' + btn.dataset.tab)?.classList.add('active');
      // Refresh reports when switching to that tab
      if (btn.dataset.tab === 'reports') renderReports();
    });
  });
  wireCashiers();
  wireHistory();
  wireBusiness();
  wireReports();                         // FIX: direct call, no setTimeout
  loadCashiersForPasswordChange();       // FIX: direct call, no setTimeout
  const passBtn = $('btn-change-pass');
  if (passBtn) passBtn.addEventListener('click', updateCashierPassword);
  on('clear-history-btn', 'click', clearHistory);
  on('change-pass-btn',   'click', changeAdminPassword);
}

// ── CASHIERS ──────────────────────────────────────────────────────────────────
function wireCashiers() {
  on('create-cashier-btn', 'click', async () => {
    const u = ($('cashier-name')?.value || '').trim();
    const p = ($('cashier-pass')?.value || '').trim();
    if (!u || !p) { showToast('Enter both username and password.', 'error'); return; }
    if (p.length < 4) { showToast('Password must be at least 4 characters.', 'error'); return; }
    await push(bizRef('cashiers'), { username: u, password: p });
    $('cashier-name').value = ''; $('cashier-pass').value = '';
    showToast(`Cashier "${u}" created.`, 'success');
  });
  onValue(bizRef('cashiers'), snap => {
    const list = $('cashier-l
