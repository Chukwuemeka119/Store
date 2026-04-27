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
  return new Date(lastDayOfMonth.getTime() 30 + 3 * 24 * 60 * 60 * 1000);
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
    const list = $('cashier-list'); if (!list) return;
    const items = [];
    if (snap.exists()) snap.forEach(c => { items.push([c.key, c.val()]); });
    if (!items.length) {
      list.innerHTML = `<tr><td colspan="2" style="color:var(--muted);text-align:center;padding:24px">No cashiers yet</td></tr>`;
      return;
    }
    list.innerHTML = items.map(([id, c]) =>
      `<tr><td>${clean(c.username)}</td><td><button class="btn btn-danger" style="padding:5px 12px;font-size:0.7rem" onclick="deleteCashier('${id}','${clean(c.username).replace(/'/g,"\\'")}')">Remove</button></td></tr>`
    ).join('');
  });
}

window.deleteCashier = async (id, name) => {
  if (confirm(`Remove cashier "${name}"?`)) {
    await remove(bizRef('cashiers/' + id));
    showToast(`Cashier "${name}" removed.`, 'success');
  }
};

// ── CASHIER PASSWORD CHANGE ───────────────────────────────────────────────────
function loadCashiersForPasswordChange() {
  const select = $('select-cashier-pass'); if (!select) return;
  onValue(bizRef('cashiers'), snap => {
    select.innerHTML = '<option value="">-- Choose Cashier --</option>';
    if (snap.exists()) {
      snap.forEach(child => {
        const c = child.val();
        select.innerHTML += `<option value="${child.key}">${clean(c.username)}</option>`;
      });
    }
  });
}

// FIX: Updated to use renamed field IDs (cashier-old-pass, cashier-new-pass)
// These no longer conflict with the admin password change fields (current-pass, new-pass, confirm-pass)
async function updateCashierPassword() {
  const cashierId = ($('select-cashier-pass')?.value || '').trim();
  const oldPass   = ($('cashier-old-pass')?.value    || '').trim();
  const newPass   = ($('cashier-new-pass')?.value    || '').trim();
  const msgEl     = $('pass-result');
  if (msgEl) { msgEl.textContent = ''; msgEl.style.color = ''; }
  if (!cashierId || !oldPass || !newPass) {
    if (msgEl) { msgEl.textContent = '\u26A0\uFE0F Fill all fields.'; msgEl.style.color = 'var(--danger)'; }
    return;
  }
  if (newPass.length < 4) {
    if (msgEl) { msgEl.textContent = '\u26A0\uFE0F Password must be at least 4 characters.'; msgEl.style.color = 'var(--danger)'; }
    return;
  }
  try {
    const snap = await get(bizRef(`cashiers/${cashierId}`));
    if (!snap.exists() || snap.val().password !== oldPass) {
      if (msgEl) { msgEl.textContent = '\u274C Incorrect current password.'; msgEl.style.color = 'var(--danger)'; }
      return;
    }
    await update(bizRef(`cashiers/${cashierId}`), { password: newPass });
    if (msgEl) { msgEl.textContent = '\u2705 Password updated!'; msgEl.style.color = 'var(--success)'; }
    if ($('cashier-old-pass')) $('cashier-old-pass').value = '';
    if ($('cashier-new-pass')) $('cashier-new-pass').value = '';
    if ($('select-cashier-pass')) $('select-cashier-pass').value = '';
  } catch (e) {
    if (msgEl) { msgEl.textContent = `\u274C ${e.message}`; msgEl.style.color = 'var(--danger)'; }
  }
}

// ── SALES HISTORY ─────────────────────────────────────────────────────────────
function wireHistory() {
  onValue(bizRef('sales'), snap => {
    allSales = [];
    if (snap.exists()) snap.forEach(c => { allSales.push({ id: c.key, ...c.val() }); });
    salesPage = 0;
    renderHistory();
    renderReports(); // Keep reports in sync whenever sales data changes
  });
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      historyPeriod = btn.dataset.period;
      salesPage = 0;
      renderHistory();
    });
  });
}

// FIX: Accept optional period param so History and Reports can each use their own period
function filterSalesByPeriod(sales, period) {
  period = period || historyPeriod;
  const now = new Date();
  if (period === 'daily') {
    const today = now.toDateString();
    return sales.filter(s => new Date(s.timestamp).toDateString() === today);
  }
  if (period === 'weekly') {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return sales.filter(s => new Date(s.timestamp) >= weekAgo);
  }
  return sales.filter(s => {
    const d = new Date(s.timestamp);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
}

function renderHistory() {
  const container = $('history-content'); if (!container) return;
  if (!allSales.length) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--muted)">No records yet</div>`;
    return;
  }
  const sorted   = [...allSales].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const filtered = filterSalesByPeriod(sorted);
  if (!filtered.length) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--muted)">No records for this period</div>`;
    return;
  }
  const visible = filtered.slice(0, PAGE_SIZE * (salesPage + 1));
  const groups  = {};
  visible.forEach(sale => {
    const d   = new Date(sale.timestamp);
    const key = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(sale);
  });

  container.innerHTML = Object.keys(groups).reverse().map(key => {
    const sales      = groups[key];
    const groupTotal = sales.reduce((s, sale) => s + (Number(sale.total) || 0), 0);
    const rows       = [...sales].reverse().map(sale => {
      const time      = new Date(sale.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const itemsText = (sale.items || []).map(i => `${clean(i.name)} (x${i.qty})`).join(', ');
      return `
        <tr>
          <td style="color:var(--muted);font-size:0.75rem">${time}</td>
          <td><span style="font-weight:600;color:var(--accent)">${clean(sale.cashier || 'Admin')}</span></td>
          <td>${clean(sale.customer || 'Walk-in')}</td>
          <td style="font-size:0.7rem;color:var(--muted)">${itemsText}</td>
          <td style="color:var(--accent3);font-weight:600">\u20A6${(Number(sale.total) || 0).toLocaleString()}</td>
        </tr>`;
    }).join('');
    return `
      <div class="history-group">
        <div class="history-group-title">${key} <span>Total: \u20A6${groupTotal.toLocaleString()}</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Time</th><th>Cashier</th><th>Customer</th><th>Items</th><th>Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
  }).join('');

  if (PAGE_SIZE * (salesPage + 1) < filtered.length) {
    container.innerHTML += `<div style="text-align:center;margin:16px"><button class="btn btn-primary" id="load-more-sales">Load More</button></div>`;
    setTimeout(() => {
      const btn = $('load-more-sales');
      if (btn) btn.addEventListener('click', () => { salesPage++; renderHistory(); });
    }, 0);
  }
}

async function clearHistory() {
  if (!await verifyAdmin('\uD83D\uDD10 Confirm clear all sales history:')) return;
  if (!confirm('This will permanently delete ALL sales records. Continue?')) return;
  await remove(bizRef('sales'));
  showToast('Sales history cleared.', 'success');
}
window.clearHistory = clearHistory;

// ── BUSINESS SETTINGS ─────────────────────────────────────────────────────────
function wireBusiness() {
  if ($('biz-name')) {
    $('biz-name').value    = STORE.name;
    $('biz-address').value = STORE.address;
    $('biz-phone').value   = STORE.phone;
  }
  on('save-biz-btn', 'click', async () => {
    const n = ($('biz-name')?.value    || '').trim();
    const a = ($('biz-address')?.value || '').trim();
    const p = ($('biz-phone')?.value   || '').trim();
    if (!n) { showToast('Store name is required.', 'error'); return; }
    await update(bizRef('business'), { name: n, address: a, phone: p });
    STORE.name = n; STORE.address = a; STORE.phone = p;
    renderNavbar();
    showToast('Business details saved.', 'success');
  });
}

// Admin password change — uses unique IDs: current-pass, new-pass, confirm-pass
// FIX: These IDs no longer duplicate with cashier section (which uses cashier-old-pass, cashier-new-pass)
async function changeAdminPassword() {
  const current     = ($('current-pass')?.value  || '').trim();
  const newPass     = ($('new-pass')?.value      || '').trim();
  const confirmPass = ($('confirm-pass')?.value  || '').trim();
  if (!current || !newPass || !confirmPass) { showToast('Please fill all password fields.', 'error'); return; }
  if (newPass !== confirmPass) { showToast('New passwords do not match.', 'error'); return; }
  if (newPass.length < 4) { showToast('Password must be at least 4 characters.', 'error'); return; }
  const correct = await getAdminPw();
  if (current !== correct) { showToast('Current password is incorrect.', 'error'); return; }
  await update(bizRef('config'), { adminPassword: newPass });
  adminCache = null;
  showToast('Admin password changed successfully.', 'success');
  $('current-pass').value = ''; $('new-pass').value = ''; $('confirm-pass').value = '';
}
window.changeAdminPassword = changeAdminPassword;

// ── REPORTS TAB — NEW FEATURE ─────────────────────────────────────────────────
// Revenue analytics: summary stats, top selling items, revenue by cashier, CSV export
function wireReports() {
  document.querySelectorAll('.report-period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.report-period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      reportPeriod = btn.dataset.period;
      renderReports();
    });
  });
  on('export-history-csv', 'click', exportHistoryCSV);
}

function renderReports() {
  // Only render if the Reports tab panel exists (avoids errors on non-admin pages)
  const container = $('tab-reports'); if (!container) return;

  const filtered = filterSalesByPeriod(allSales, reportPeriod);

  // Summary stats
  const revenue = filtered.reduce((s, sale) => s + (Number(sale.total) || 0), 0);
  const txns    = filtered.length;
  const avg     = txns ? Math.round(revenue / txns) : 0;
  setText('report-revenue', `\u20A6${revenue.toLocaleString()}`);
  setText('report-txns',    txns.toString());
  setText('report-avg',     `\u20A6${avg.toLocaleString()}`);

  // Top selling items by quantity
  const itemMap = {};
  filtered.forEach(sale => {
    (sale.items || []).forEach(item => {
      if (!itemMap[item.name]) itemMap[item.name] = { qty: 0, revenue: 0 };
      itemMap[item.name].qty     += Number(item.qty)   || 0;
      itemMap[item.name].revenue += Number(item.total) || 0;
    });
  });
  const topItems = Object.entries(itemMap).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5);
  const maxQty   = topItems[0]?.[1]?.qty || 1;
  const topEl    = $('report-top-items');
  if (topEl) {
    topEl.innerHTML = !topItems.length
      ? `<div style="color:var(--muted);text-align:center;padding:24px">No sales data for this period</div>`
      : topItems.map(([name, d], i) => `
          <div style="margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;font-size:0.78rem;margin-bottom:6px">
              <span><span style="color:var(--muted)">${i + 1}.</span> ${clean(name)}</span>
              <span style="color:var(--muted);font-size:0.7rem">${d.qty} sold &nbsp;\u00B7&nbsp; \u20A6${d.revenue.toLocaleString()}</span>
            </div>
            <div style="background:var(--surface2);border-radius:4px;height:6px;overflow:hidden">
              <div style="width:${Math.round(d.qty / maxQty * 100)}%;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent3));border-radius:4px;transition:width 0.4s"></div>
            </div>
          </div>`).join('');
  }

  // Revenue by cashier
  const cashierMap = {};
  filtered.forEach(sale => {
    const name = sale.cashier || 'Unknown';
    if (!cashierMap[name]) cashierMap[name] = { revenue: 0, txns: 0 };
    cashierMap[name].revenue += Number(sale.total) || 0;
    cashierMap[name].txns++;
  });
  const cashiers = Object.entries(cashierMap).sort((a, b) => b[1].revenue - a[1].revenue);
  const maxRev   = cashiers[0]?.[1]?.revenue || 1;
  const cashEl   = $('report-cashiers');
  if (cashEl) {
    cashEl.innerHTML = !cashiers.length
      ? `<div style="color:var(--muted);text-align:center;padding:24px">No cashier data for this period</div>`
      : cashiers.map(([name, d]) => `
          <div style="margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;font-size:0.78rem;margin-bottom:6px">
              <span style="color:var(--accent)">@${clean(name)}</span>
              <span style="color:var(--muted);font-size:0.7rem">${d.txns} sale${d.txns !== 1 ? 's' : ''} &nbsp;\u00B7&nbsp; \u20A6${d.revenue.toLocaleString()}</span>
            </div>
            <div style="background:var(--surface2);border-radius:4px;height:6px;overflow:hidden">
              <div style="width:${Math.round(d.revenue / maxRev * 100)}%;height:100%;background:linear-gradient(90deg,var(--accent2),var(--accent));border-radius:4px;transition:width 0.4s"></div>
            </div>
          </div>`).join('');
  }
}

function exportHistoryCSV() {
  const filtered = filterSalesByPeriod(allSales, reportPeriod);
  if (!filtered.length) { showToast('No sales data to export.', 'info'); return; }
  const sorted = [...filtered].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const header = ['Date', 'Time', 'Cashier', 'Customer', 'Items', 'Total (NGN)'];
  const rows   = sorted.map(sale => {
    const d     = new Date(sale.timestamp);
    const items = (sale.items || []).map(i => `${i.name}(x${i.qty}@${i.price})`).join(' | ');
    return [
      d.toLocaleDateString('en-GB'),
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      `"${(sale.cashier  || 'Admin').replace(/"/g, '""')}"`,
      `"${(sale.customer || 'Walk-in').replace(/"/g, '""')}"`,
      `"${items.replace(/"/g, '""')}"`,
      Number(sale.total).toFixed(2)
    ];
  });
  const csv  = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `stocksavvy-sales-${reportPeriod}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Sales history exported.', 'success');
}
