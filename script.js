import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, push, onValue, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

const STORE_NAME    = "Michael POS Store";
const STORE_ADDRESS = "Abuja Nigeria";
const STORE_PHONE   = "08012345678";

let inventory = [];
let cart      = [];

// helpers
const $  = id => document.getElementById(id);
const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
function setText(id, val) { const el = $(id); if (el) el.innerText = val; }

// auth guard
if (!location.pathname.includes("login.html") && !sessionStorage.getItem("posAuth")) {
  location.href = "login.html";
}

// boot
document.addEventListener("DOMContentLoaded", () => {
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

function loadCompany() {
  setText("c-name",    STORE_NAME);
  setText("c-address", STORE_ADDRESS);
  setText("c-phone",   STORE_PHONE);
}

function wirePage() {
  const path = location.pathname;

  if (path.includes("login.html")) {
    on("login-btn", "click", handleLogin);
    on("password",  "keydown", e => { if (e.key === "Enter") handleLogin(); });
  }

  if (path.includes("index.html") || path === "/" || path.endsWith("/")) {
    on("logout-btn", "click", handleLogout);
  }

  if (path.includes("inventory.html")) {
    on("add-item", "click", handleAddItem);
  }

  if (path.includes("sales.html")) {
    on("sell-btn",  "click", handleAddToCart);
    on("print-btn", "click", handlePrint);
  }

  if (path.includes("admin.html")) {
    on("create-cashier-btn", "click", handleCreateCashier);
  }
}

async function handleLogin() {
  const u = $("username").value.trim();
  const p = $("password").value;

  if (!u || !p) { alert("Please enter username and password."); return; }

  if (u === "admin" && p === "admin") {
    sessionStorage.setItem("posAuth", "true");
    sessionStorage.setItem("cashier", u);
    location.href = "index.html";
    return;
  }

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

function handleLogout() {
  sessionStorage.clear();
  location.href = "login.html";
}

function handleAddItem() {
  const name  = $("item-name").value.trim();
  const price = Number($("item-price").value);
  const qty   = Number($("item-quantity").value);

  if (!name || !price || !qty) { alert("Please fill in all fields."); return; }

  push(ref(db, "inventory"), { name, price, qty });

  $("item-name").value     = "";
  $("item-price").value    = "";
  $("item-quantity").value = "";
}

function renderInventoryTable() {
  const body = $("inventory-body");
  if (!body) return;
  if (inventory.length === 0) {
    body.innerHTML = `<tr><td colspan="3" style="color:var(--muted);text-align:center;padding:24px">No items yet</td></tr>`;
    return;
  }
  body.innerHTML = inventory.map(i =>
    `<tr><td>${i.name}</td><td>&#8358;${i.price.toLocaleString()}</td><td>${i.qty}</td></tr>`
  ).join("");
}

function renderSellDropdown() {
  const sel = $("sell-item");
  if (!sel) return;
  sel.innerHTML = `<option value="">-- Select Item --</option>` +
    inventory.map(i => `<option value="${i.name}">${i.name} — &#8358;${i.price.toLocaleString()}</option>`).join("");
}

function handleAddToCart() {
  const name = $("sell-item").value;
  const qty  = Number($("sell-qty").value);

  if (!name) { alert("Please select an item."); return; }
  if (!qty || qty < 1) { alert("Please enter a valid quantity."); return; }

  const item = inventory.find(i => i.name === name);
  if (!item) return;

  const total = qty * item.price;
  cart.push({ name, qty, price: item.price, total });

  const emptyRow = $("empty-row");
  if (emptyRow) emptyRow.remove();

  $("sell-body").innerHTML +=
    `<tr><td>${name}</td><td>${qty}</td><td>&#8358;${item.price.toLocaleString()}</td><td>&#8358;${total.toLocaleString()}</td></tr>`;

  updateSubtotal();
  $("sell-qty").value = "";
}

function updateSubtotal() {
  const total = cart.reduce((s, i) => s + i.total, 0);
  setText("subtotal", total.toLocaleString());
}

function handlePrint() {
  if (cart.length === 0) { alert("Cart is empty."); return; }

  $("receipt").style.display = "block";
  setText("r-store",   STORE_NAME);
  setText("r-address", STORE_ADDRESS);
  setText("r-phone",   STORE_PHONE);
  setText("r-cashier", sessionStorage.getItem("cashier") || "—");
  setText("r-date",    new Date().toLocaleString());

  $("r-items").innerHTML = cart.map(i =>
    `<tr><td>${i.name}</td><td>${i.qty}</td><td>&#8358;${i.price.toLocaleString()}</td><td>&#8358;${i.total.toLocaleString()}</td></tr>`
  ).join("");

  setText("r-total", cart.reduce((s, i) => s + i.total, 0).toLocaleString());
  window.print();
}

function handleCreateCashier() {
  const name = $("cashier-name").value.trim();
  const pass = $("cashier-pass").value.trim();

  if (!name || !pass) { alert("Please enter both username and password."); return; }

  push(ref(db, "cashiers"), { username: name, password: pass });
  alert(`Cashier "${name}" created!`);

  $("cashier-name").value = "";
  $("cashier-pass").value = "";
}
