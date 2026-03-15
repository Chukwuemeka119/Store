import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, push, onValue, get, update, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

// Default business details (overridden by Firebase if saved)
let STORE = { name: "Michael POS Store", address: "Abuja Nigeria", phone: "08012345678" };

let inventory    = [];
let cart         = [];
let allSales     = [];
let historyPeriod = "daily";

// helpers
const $  = id => document.getElementById(id);
const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
function setText(id, val) { const el = $(id); if (el) el.innerText = val; }

const PAGE = location.pathname.split("/").pop() || "index.html";

// auth guard — general POS login
if (PAGE !== "login.html" && !sessionStorage.getItem("posAuth")) {
  location.href = "login.html";
}

// ── ADMIN PASSWORD HELPERS ────────────────────────────────────────────────────
let adminPasswordCache = null;

async function getAdminPassword() {
  if (adminPasswordCache) return adminPasswordCache;
  try {
    const snap = await get(ref(db, "config/adminPassword"));
    adminPasswordCache = snap.exists() ? snap.val() : "admin123";
  } catch (e) {
    adminPasswordCache = "admin123";
  }
  return adminPasswordCache;
}

async function verifyAdminPassword(promptMsg = "Enter admin password:") {
  const correct = await getAdminPassword();
  const entered = window.prompt(promptMsg);
  if (entered === null) return false;
  return entered === correct;
}

// ── ADMIN PAGE GUARD ──────────────────────────────────────────────────────────
if (PAGE === "admin.html") {
  (async () => {
    const ok = await verifyAdminPassword("🔐 Enter admin password to access this page:");
    if (!ok) {
      alert("Incorrect password. Access denied.");
      location.href = "index.html";
    }
  })();
}

// boot
document.addEventListener("DOMContentLoaded", async () => {
  await loadBusinessDetails();
  loadCompany();
  wirePage();

  onValue(ref(db, "inventory"), snapshot => {
    inventory = [];
    const data = snapshot.val() || {};
    for (const id in data) inventory.push({ id, ...data[id] });
    renderInventoryTable();
    renderSellDropdown();
  });
});

// ── BUSINESS DETAILS ─────────────────────────────────────────────────────────
async function loadBusinessDetails() {
  try {
    const snap = await get(ref(db, "business"));
    if (snap.exists()) {
      const d = snap.val();
      STORE.name    = d.name    || STORE.name;
      STORE.address = d.address || STORE.address;
      STORE.phone   = d.phone   || STORE.phone;
    }
  } catch (e) { /* use defaults */ }
}

function loadCompany() {
  setText("c-name",    STORE.name);
  setText("c-address", STORE.address);
  setText("c-phone",   STORE.phone);
}

// ── PAGE ROUTER ───────────────────────────────────────────────────────────────
function wirePage() {
  if (PAGE === "login.html") {
    on("login-btn", "click", handleLogin);
    on("password",  "keydown", e => { if (e.key === "Enter") handleLogin(); });
  }

  if (PAGE === "index.html" || PAGE === "") {
    on("logout-btn", "click", handleLogout);
  }

  if (PAGE === "inventory.html") {
    on("add-item", "click", handleAddItem);
  }

  if (PAGE === "sales.html") {
    on("sell-btn",  "click", handleAddToCart);
    on("print-btn", "click", handlePrint);
  }

  if (PAGE === "admin.html") {
    wireAdminTabs();
    wireAdminCashiers();
    wireAdminBusiness();
    wireAdminHistory();
  }
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
async function handleLogin() {
  const u = $("username").value.trim();
  const p = $("password").value;
  if (!u || !p) { alert("Please enter username and password."); return; }

  // Check admin account using Firebase-stored admin password
  if (u === "admin") {
    const adminPass = await getAdminPassword();
    if (p === adminPass) {
      sessionStorage.setItem("posAuth", "true");
      sessionStorage.setItem("cashier", "admin");
      sessionStorage.setItem("isAdmin", "true");
      location.href = "index.html";
    } else {
      alert("Wrong password for admin.");
    }
    return;
  }

  // Check cashier accounts
  try {
    const snapshot = await get(ref(db, "cashiers"));
    const data = snapshot.val() || {};
    const found = Object.values(data).some(c => c.username === u && c.password === p);
    if (found) {
      sessionStorage.setItem("posAuth", "true");
      sessionStorage.setItem("cashier", u);
      location.href = "index.html";
    } else {
      alert("Wrong username or password.");
    }
  } catch (err) {
    alert("Login error: " + err.message);
  }
}

// ── LOGOUT ────────────────────────────────────────────────────────────────────
function handleLogout() {
  sessionStorage.clear();
  location.href = "login.html";
}

// ── INVENTORY ─────────────────────────────────────────────────────────────────
function handleAddItem() {
  const name  = $("item-name").value.trim();
  const price = Number($("item-price").value);
  const qty   = Number($("item-quantity").value);
  if (!name || !price || !qty) { alert("Please fill in all fields."); return; }
  push(ref(db, "inventory"), { name, price, qty });
  $("item-name").value = $("item-price").value = $("item-quantity").value = "";
}

function renderInventoryTable() {
  const body = $("inventory-body");
  if (!body) return;
  if (inventory.length === 0) {
    body.innerHTML = `<tr><td colspan="3" style="color:var(--muted);text-align:center;padding:24px">No items yet</td></tr>`;
    return;
  }
  body.innerHTML = inventory.map(i =>
    `<tr>
      <td>${i.name}</td>
      <td>&#8358;${i.price.toLocaleString()}</td>
      <td>${i.qty}</td>
      <td><button class="btn btn-danger" style="padding:5px 12px;font-size:0.7rem" onclick="deleteItem('${i.id}','${i.name}')">Remove</button></td>
    </tr>`
  ).join("");
}

async function deleteItem(id, name) {
  const ok = await verifyAdminPassword(`🔐 Enter admin password to remove "${name}":`);
  if (!ok) { alert("Incorrect password. Item not removed."); return; }
  remove(ref(db, "inventory/" + id));
}
window.deleteItem = deleteItem;

// ── SALES ─────────────────────────────────────────────────────────────────────
function renderSellDropdown() {
  const sel = $("sell-item");
  if (!sel) return;
  sel.innerHTML = `<option value="">-- Select Item --</option>` +
    inventory.map(i =>
      `<option value="${i.name}">${i.name} — &#8358;${i.price.toLocaleString()}</option>`
    ).join("");
}

function handleAddToCart() {
  const name = $("sell-item").value;
  const qty  = Number($("sell-qty").value);
  if (!name) { alert("Please select an item."); return; }
  if (!qty || qty < 1) { alert("Please enter a valid quantity."); return; }

  const item = inventory.find(i => i.name === name);
  if (!item) return;

  if (qty > item.qty) {
    alert(`Not enough stock. Only ${item.qty} left for "${name}".`);
    return;
  }

  const total = qty * item.price;
  const cartIndex = cart.length;
  cart.push({ name, qty, price: item.price, total });

  const emptyRow = $("empty-row");
  if (emptyRow) emptyRow.remove();

  const tr = document.createElement("tr");
  tr.dataset.cartIndex = cartIndex;
  tr.innerHTML = `
    <td>${name}</td>
    <td>${qty}</td>
    <td>&#8358;${item.price.toLocaleString()}</td>
    <td>&#8358;${total.toLocaleString()}</td>
    <td><button class="btn btn-danger" style="padding:5px 12px;font-size:0.7rem" onclick="removeFromCart(${cartIndex})">Remove</button></td>`;
  $("sell-body").appendChild(tr);

  updateSubtotal();
  $("sell-qty").value = "";
}

function removeFromCart(index) {
  cart[index] = null; // mark as removed
  const row = $("sell-body").querySelector(`tr[data-cart-index="${index}"]`);
  if (row) row.remove();

  // If cart is now empty, show empty row
  const remaining = cart.filter(i => i !== null);
  if (remaining.length === 0) {
    cart = [];
    $("sell-body").innerHTML = `<tr id="empty-row"><td colspan="5" style="color:var(--muted);text-align:center;padding:24px">Cart is empty</td></tr>`;
  }
  updateSubtotal();
}
window.removeFromCart = removeFromCart;

function updateSubtotal() {
  setText("subtotal", cart.filter(i => i !== null).reduce((s, i) => s + i.total, 0).toLocaleString());
}

function handlePrint() {
  cart = cart.filter(i => i !== null);
  if (cart.length === 0) { alert("Cart is empty."); return; }

  const now = new Date();
  const customerName = ($("customer-name") && $("customer-name").value.trim()) || "Walk-in";

  $("receipt").style.display = "block";
  setText("r-store",    STORE.name);
  setText("r-address",  STORE.address);
  setText("r-phone",    STORE.phone);
  setText("r-customer", customerName);
  setText("r-cashier",  sessionStorage.getItem("cashier") || "—");
  setText("r-date",     now.toLocaleString());

  $("r-items").innerHTML = cart.map(i =>
    `<tr><td>${i.name}</td><td>${i.qty}</td><td>&#8358;${i.price.toLocaleString()}</td><td>&#8358;${i.total.toLocaleString()}</td></tr>`
  ).join("");

  const grandTotal = cart.reduce((s, i) => s + i.total, 0);
  setText("r-subtotal", grandTotal.toLocaleString());
  setText("r-total",    grandTotal.toLocaleString());

  // Deduct stock — remove item entirely if qty hits 0
  cart.forEach(cartItem => {
    const inv = inventory.find(i => i.name === cartItem.name);
    if (!inv) return;
    const newQty = inv.qty - cartItem.qty;
    if (newQty <= 0) {
      remove(ref(db, "inventory/" + inv.id));
    } else {
      update(ref(db, "inventory/" + inv.id), { qty: newQty });
    }
  });

  // Save sale to Firebase history
  push(ref(db, "sales"), {
    cashier:   sessionStorage.getItem("cashier") || "—",
    customer:  customerName,
    timestamp: now.toISOString(),
    total:     grandTotal,
    items:     cart
  });

  // Reset cart
  cart = [];
  if ($("customer-name")) $("customer-name").value = "";
  $("sell-body").innerHTML = `<tr id="empty-row"><td colspan="5" style="color:var(--muted);text-align:center;padding:24px">Cart is empty</td></tr>`;
  setText("subtotal", "0");

  window.print();
}

// ── ADMIN TABS ────────────────────────────────────────────────────────────────
function wireAdminTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      $("tab-" + btn.dataset.tab).classList.add("active");
    });
  });
}

// ── ADMIN — CASHIERS ──────────────────────────────────────────────────────────
function wireAdminCashiers() {
  on("create-cashier-btn", "click", handleCreateCashier);

  onValue(ref(db, "cashiers"), snapshot => {
    const body = $("cashier-list");
    if (!body) return;
    const data = snapshot.val() || {};
    const entries = Object.entries(data);
    if (entries.length === 0) {
      body.innerHTML = `<tr><td colspan="2" style="color:var(--muted);text-align:center;padding:24px">No cashiers yet</td></tr>`;
      return;
    }
    body.innerHTML = entries.map(([id, c]) =>
      `<tr>
        <td>${c.username}</td>
        <td><button class="btn btn-danger" style="padding:6px 14px;font-size:0.7rem" onclick="deleteCashier('${id}')">Remove</button></td>
      </tr>`
    ).join("");
  });
}

function handleCreateCashier() {
  const name = $("cashier-name").value.trim();
  const pass = $("cashier-pass").value.trim();
  if (!name || !pass) { alert("Please enter both username and password."); return; }
  push(ref(db, "cashiers"), { username: name, password: pass });
  alert(`Cashier "${name}" created!`);
  $("cashier-name").value = $("cashier-pass").value = "";
}

function deleteCashier(id) {
  if (!confirm("Remove this cashier?")) return;
  remove(ref(db, "cashiers/" + id));
}
window.deleteCashier = deleteCashier;

// ── ADMIN — BUSINESS DETAILS ──────────────────────────────────────────────────
function wireAdminBusiness() {
  // Pre-fill inputs with current values
  const nameEl = $("biz-name");
  const addrEl = $("biz-address");
  const phoneEl = $("biz-phone");
  if (nameEl)  nameEl.value  = STORE.name;
  if (addrEl)  addrEl.value  = STORE.address;
  if (phoneEl) phoneEl.value = STORE.phone;

  on("save-biz-btn", "click", () => {
    const name    = $("biz-name").value.trim();
    const address = $("biz-address").value.trim();
    const phone   = $("biz-phone").value.trim();
    if (!name || !address || !phone) { alert("Please fill in all fields."); return; }

    update(ref(db, "business"), { name, address, phone });
    STORE = { name, address, phone };
    loadCompany();
    alert("Business details saved!");
  });

  on("change-pass-btn", "click", async () => {
    const current  = $("current-pass").value;
    const newPass  = $("new-pass").value.trim();
    const confirm2 = $("confirm-pass").value.trim();

    if (!current || !newPass || !confirm2) { alert("Please fill in all password fields."); return; }
    if (newPass !== confirm2) { alert("New passwords do not match."); return; }
    if (newPass.length < 4)   { alert("Password must be at least 4 characters."); return; }

    const correct = await getAdminPassword();
    if (current !== correct) { alert("Current password is incorrect."); return; }

    await update(ref(db, "config"), { adminPassword: newPass });
    adminPasswordCache = newPass; // update cache
    alert("Admin password changed successfully!");
    $("current-pass").value = $("new-pass").value = $("confirm-pass").value = "";
  });
}

// ── ADMIN — SALES HISTORY ─────────────────────────────────────────────────────
function wireAdminHistory() {
  onValue(ref(db, "sales"), snapshot => {
    allSales = [];
    const data = snapshot.val() || {};
    for (const id in data) allSales.push({ id, ...data[id] });
    renderHistory();
  });

  on("clear-history-btn", "click", () => {
    if (!confirm("Are you sure you want to clear all sales history? This cannot be undone.")) return;
    remove(ref(db, "sales"));
  });

  document.querySelectorAll(".period-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".period-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      historyPeriod = btn.dataset.period;
      renderHistory();
    });
  });
}

function renderHistory() {
  const container = $("history-content");
  if (!container) return;

  if (allSales.length === 0) {
    container.innerHTML = `<div style="color:var(--muted);text-align:center;padding:40px">No sales recorded yet</div>`;
    return;
  }

  // Group sales by period
  const groups = {};
  allSales.forEach(sale => {
    const d = new Date(sale.timestamp);
    let key;
    if (historyPeriod === "daily") {
      key = d.toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"short", year:"numeric" });
    } else if (historyPeriod === "weekly") {
      // ISO week label
      const startOfWeek = new Date(d);
      startOfWeek.setDate(d.getDate() - d.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      key = `${startOfWeek.toLocaleDateString("en-GB",{day:"numeric",month:"short"})} – ${endOfWeek.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}`;
    } else {
      key = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push(sale);
  });

  // Sort groups newest first
  const sortedKeys = Object.keys(groups).reverse();

  container.innerHTML = sortedKeys.map(key => {
    const sales = groups[key];
    const groupTotal = sales.reduce((s, sale) => s + (sale.total || 0), 0);

    const rows = sales.slice().reverse().map(sale => {
      const time = new Date(sale.timestamp).toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
      const itemList = (sale.items || []).map(i => `${i.name} x${i.qty}`).join(", ");
      return `<tr>
        <td style="color:var(--muted);font-size:0.75rem">${time}</td>
        <td>${sale.cashier || "—"}</td>
        <td>${sale.customer || "Walk-in"}</td>
        <td style="font-size:0.78rem;color:var(--muted)">${itemList}</td>
        <td style="color:var(--accent3);font-weight:600">&#8358;${(sale.total||0).toLocaleString()}</td>
      </tr>`;
    }).join("");

    return `<div class="history-group">
      <div class="history-group-title">
        ${key}
        <span class="history-group-total">Total: <span>&#8358;${groupTotal.toLocaleString()}</span></span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Time</th><th>Cashier</th><th>Customer</th><th>Items</th><th>Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }).join("");
}
