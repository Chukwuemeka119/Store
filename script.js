// ================= LOGIN =================
document.addEventListener("DOMContentLoaded", function () {
  if (!location.href.includes("login.html")) {
    if (!sessionStorage.getItem("posAuth")) {
      location.href = "login.html";
    }
  }

  loadCompany();
  loadInventory();
  loadSellList();
});


// ================= COMPANY INFO =================
let company = {
  name: "Michael POS Store",
  address: "Abuja, Nigeria",
  phone: "08012345678"
};

function loadCompany() {
  let n = document.getElementById("c-name");
  let a = document.getElementById("c-address");
  let p = document.getElementById("c-phone");

  if (n) n.innerText = company.name;
  if (a) a.innerText = company.address;
  if (p) p.innerText = company.phone;
}
// Load inventory
let inventory = JSON.parse(localStorage.getItem("inventory")) || [];
let cart = [];
let sales = JSON.parse(localStorage.getItem("sales")) || [];


// Add inventory
document.getElementById("add-item")?.addEventListener("click", function () {
  let name = document.getElementById("item-name").value.trim();
  let price = Number(document.getElementById("item-price").value);
  let qty = Number(document.getElementById("item-quantity").value);

  if (!name || price <= 0 || qty <= 0) {
    alert("Fill all fields");
    return;
  }

  inventory.push({ name, price, qty });

  // SAVE permanently
  localStorage.setItem("inventory", JSON.stringify(inventory));

  alert("Item Added!");
  loadInventory();
  loadSellList();
});

// Load inventory table
function loadInventory() {
  let body = document.getElementById("inventory-body");
  if (!body) return;
  body.innerHTML = "";

  inventory.forEach(i => {
    body.innerHTML += `<tr><td>${i.name}</td><td>${i.price}</td><td>${i.qty}</td></tr>`;
  });
}


// ================= SELL DROPDOWN =================
function loadSellList() {
  let sell = document.getElementById("sell-item");
  if (!sell) return;

  sell.innerHTML = "<option>Select Item</option>";
  inventory.forEach(i => {
    sell.innerHTML += `<option value="${i.name}">${i.name}</option>`;
  });
}

// ================= SELL BUTTON =================
document.getElementById("sell-btn")?.addEventListener("click", () => {
  let name = document.getElementById("sell-item").value;
  let qty = Number(document.getElementById("sell-qty").value);

  if (name === "Select Item" || !name) {
    alert("Select an item");
    return;
  }

  if (qty <= 0) {
    alert("Enter quantity");
    return;
  }

  let item = inventory.find(i => i.name === name);
  if (!item) {
    alert("Item not found in inventory");
    return;
  }

  if (item.qty < qty) {
    alert("Not enough stock");
    return;
  }

  let total = qty * item.price;

  cart.push({ name, qty, price: item.price, total });

  let row = `
    <tr>
      <td>${name}</td>
      <td>${qty}</td>
      <td>${item.price}</td>
      <td>${total}</td>
    </tr>
  `;

  document.getElementById("sell-body").innerHTML += row;

  updateSubtotal();
});


// ================= SUBTOTAL =================
function updateSubtotal() {
  let subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  document.getElementById("subtotal").innerText = subtotal;
}


// ================= PRINT =================
document.getElementById("print-btn")?.addEventListener("click", () => {
  if (cart.length === 0) {
    alert("No items to print");
    return;
  }

  let receipt = `
  <h2>Michael POS Store</h2>
  <p>Abuja, Nigeria</p>
  <p>08012345678</p>
  <hr>
  <table border="1" width="100%">
  <tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>
  `;

  cart.forEach(c => {
    receipt += `<tr>
      <td>${c.name}</td>
      <td>${c.qty}</td>
      <td>${c.price}</td>
      <td>${c.total}</td>
    </tr>`;
  });

  

  let total = cart.reduce((s, i) => s + i.total, 0);
  receipt += `<tr><td colspan="3"><b>Total</b></td><td><b>${total}</b></td></tr>`;
  receipt += "</table><h3>Thank you for your patronage</h3><h3>No refund after payment</h3>";

  let win = window.open("", "", "width=400,height=600");
  win.document.write(receipt);
  win.print();

   cart.forEach(c => {
      let item = inventory.find(i => i.name === c.name);
      item.qty -= c.qty;
      sales.push({ ...c, date: new Date().toLocaleString() });
    });

    localStorage.setItem("inventory", JSON.stringify(inventory));
    localStorage.setItem("sales", JSON.stringify(sales));
});



function saveCompany() {
  company.name = document.getElementById("company-name").value;
  company.address = document.getElementById("company-address").value;
  company.phone = document.getElementById("company-phone").value;

  localStorage.setItem("company", JSON.stringify(company));
  loadCompany();
}
// Set default password ONCE
if (!localStorage.getItem("password")) {
  localStorage.setItem("password", "admin");
}

// Login function
function login() {
  let pass = document.getElementById("password").value;
  let realPass = localStorage.getItem("password");

  if (pass === realPass) {
    sessionStorage.setItem("posAuth", "true");
    window.location.href = "index.html";
  } else {
    alert("Wrong Password");
  }
}

// Protect pages
document.addEventListener("DOMContentLoaded", function () {
  if (!location.href.includes("login.html")) {
    if (!sessionStorage.getItem("posAuth")) {
      window.location.href = "login.html";
    }
  }
});

function logout() {
  sessionStorage.removeItem("posAuth");
  window.location.href = "login.html";
}
// CHANGE PASSWORD
document.getElementById("change-password-btn")?.addEventListener("click", () => {
  let oldPass = document.getElementById("old-password").value;
  let newPass = document.getElementById("new-password").value;
  let confirmPass = document.getElementById("confirm-password").value;

  let savedPass = localStorage.getItem("password");

  if (oldPass !== savedPass) {
    alert("Old password is wrong");
    return;
  }

  if (newPass.length < 4) {
    alert("Password must be at least 4 characters");
    return;
  }

  if (newPass !== confirmPass) {
    alert("Passwords do not match");
    return;
  }

  localStorage.setItem("password", newPass);
  alert("Password changed successfully!");
});


// Admin History
function loadHistory() {
  let body = document.getElementById("history-body");
  if (!body) return;
  body.innerHTML = "";
  sales.forEach(s => body.innerHTML += `<tr><td>${s.name}</td><td>${s.qty}</td><td>${s.total}</td><td>${s.date}</td></tr>`);
}

loadInventory();
loadSellList();
loadHistory();