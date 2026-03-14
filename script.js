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
const db = getDatabase(app);

const STORE_NAME    = "Michael POS Store";
const STORE_ADDRESS = "Abuja Nigeria";
const STORE_PHONE   = "08012345678";

let inventory = [];
let cart = [];

// ── Auth guard ───────────────────────────────────────────────────────────────
if (!location.href.includes("login.html")) {
  if (!sessionStorage.getItem("posAuth")) {
    location.href = "login.html";
  }
}

// ── DOM ready ────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  loadCompany();
  wireInventoryPage();
  wireSalesPage();
  wireAdminPage();
  wireLoginPage();
  wireDashboard();

  // Listen to Firebase inventory changes on any page that needs it
  onValue(ref(db, "inventory"), snapshot => {
    inventory = [];
    const data = snapshot.val();
    if (data) {
      for (let id in data) {
        inventory.push({ id, ...data[id] });
      }
    }
    loadInventoryTable();
    loadSellList();
  });
});

// ── Company info ─────────────────────────────────────────────────────────────
function loadCompany() {
  setText("c-name",    STORE_NAME);
  setText("c-address", STORE_ADDRESS);
  setText("c-phone",   STORE_PHONE);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

// ── Inventory page ───────────────────────────────────────────────────────────
function wireInventoryPage() {
  const btn = document.getElementById("add-item");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const name  = document.getElementById("item-name").value.trim();
    const price = Number(document.getElementById("item-price").value);
    const qty   = Number(document.getElementById("item-quantity").value);

    if (!name || isNaN(price) || isNaN(qty)) {
      alert("Please fill in all fields correctly.");
      return;
    }

    push(ref(db, "inventory"), { name, price, qty });

    document.getElementById("item-name").value = "";
    document.getElementById("item-price").value = "";
    document.getElementById("item-quantity").value = "";
  });
}

function loadInventoryTable() {
  const body = document.getElementById("inventory-body");
  if (!body) return;

  body.innerHTML = "";
  inventory.forEach(i => {
    body.innerHTML += `<tr><td>${i.name}</td><td>₦${i.price}</td><td>${i.qty}</td></tr>`;
  });
}

// ── Sales page ───────────────────────────────────────────────────────────────
function wireSalesPage() {
  const sellBtn  = document.getElementById("sell-btn");
  const printBtn = document.getElementById("print-btn");
  if (!sellBtn) return;

  sellBtn.addEventListener("click", () => {
    const name = document.getElementById("sell-item").value;
    const qty  = Number(document.getElementById("sell-qty").value);

    if (name === "Select Item" || !qty || qty < 1) {
      alert("Please select an item and enter a valid quantity.");
      return;
    }

    const item = inventory.find(i => i.name === name);
    if (!item) return;

    const total = qty * item.price;
    cart.push({ name, qty, price: item.price, total });

    document.getElementById("sell-body").innerHTML +=
      `<tr><td>${name}</td><td>${qty}</td><td>₦${item.price}</td><td>₦${total}</td></tr>`;

    updateSubtotal();
    document.getElementById("sell-qty").value = "";
  });

  printBtn?.addEventListener("click", () => {
    if (cart.length === 0) {
      alert("Cart is empty.");
      return;
    }

    const receipt = document.getElementById("receipt");
    receipt.style.display = "block";

    setText("r-store",   STORE_NAME);
    setText("r-address", STORE_ADDRESS);
    setText("r-phone",   STORE_PHONE);
    setText("r-cashier", sessionStorage.getItem("cashier") || "—");
    setText("r-date",    new Date().toLocaleString());

    const body = document.getElementById("r-items");
    body.innerHTML = "";
    cart.forEach(i => {
      body.innerHTML +=
        `<tr><td>${i.name}</td><td>${i.qty}</td><td>₦${i.price}</td><td>₦${i.total}</td></tr>`;
    });

    setText("r-total", document.getElementById("subtotal").innerText);

    window.print();
  });
}

function loadSellList() {
  const sell = document.getElementById("sell-item");
  if (!sell) return;

  sell.innerHTML = "<option>Select Item</option>";
  inventory.forEach(i => {
    sell.innerHTML += `<option value="${i.name}">${i.name}</option>`;
  });
}

function updateSubtotal() {
  const subtotal = cart.reduce((s, i) => s + i.total, 0);
  const el = document.getElementById("subtotal");
  if (el) el.innerText = subtotal;
}

// ── Admin page ───────────────────────────────────────────────────────────────
function wireAdminPage() {
  const btn = document.getElementById("cashier-name");
  if (!btn) return; // not on admin page

  document.querySelector("button[onclick='createCashier()']")
    ?.addEventListener("click", createCashier);
}

function createCashier() {
  const name = document.getElementById("cashier-name").value.trim();
  const pass = document.getElementById("cashier-pass").value.trim();

  if (!name || !pass) {
    alert("Please enter both username and password.");
    return;
  }

  push(ref(db, "cashiers"), { username: name, password: pass });
  alert("Cashier created!");

  document.getElementById("cashier-name").value = "";
  document.getElementById("cashier-pass").value = "";
}

// ── Login page ───────────────────────────────────────────────────────────────
function wireLoginPage() {
  const loginBtn = document.querySelector("button[onclick='login()']");
  if (!loginBtn) return;

  // Remove the inline onclick and use addEventListener instead
  loginBtn.removeAttribute("onclick");
  loginBtn.addEventListener("click", login);

  // Allow pressing Enter to log in
  document.getElementById("password")?.addEventListener("keydown", e => {
    if (e.key === "Enter") login();
  });
}

async function login() {
  const u = document.getElementById("username").value.trim();
  const p = document.getElementById("password").value;

  if (!u || !p) {
    alert("Please enter username and password.");
    return;
  }

  // Admin shortcut
  if (u === "admin" && p === "admin") {
    sessionStorage.setItem("posAuth", "true");
    sessionStorage.setItem("cashier", u);
    location.href = "index.html";
    return;
  }

  // Check cashiers in Firebase
  try {
    const snapshot = await get(ref(db, "cashiers"));
    const data = snapshot.val();
    let found = false;

    for (let id in data) {
      if (data[id].username === u && data[id].password === p) {
        found = true;
        break;
      }
    }

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

// ── Dashboard logout ─────────────────────────────────────────────────────────
function wireDashboard() {
  const logoutBtn = document.querySelector("button[onclick='logout()']");
  if (!logoutBtn) return;

  logoutBtn.removeAttribute("onclick");
  logoutBtn.addEventListener("click", logout);
}

function logout() {
  sessionStorage.removeItem("posAuth");
  sessionStorage.removeItem("cashier");
  location.href = "login.html";
}

// Expose to global scope for any remaining inline handlers
window.login         = login;
window.logout        = logout;
window.createCashier = createCashier;
