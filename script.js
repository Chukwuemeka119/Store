
// ================= FIREBASE SETUP =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, push, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

// ================= GLOBAL DATA =================
let inventory = [];
let cart = [];
let sales = [];

// ================= AUTH CHECK =================
document.addEventListener("DOMContentLoaded", () => {

  if (!location.href.includes("login.html")) {
    if (!sessionStorage.getItem("posAuth")) {
      location.href = "login.html";
    }
  }

  loadCompany();
  loadInventoryRealtime();
  loadSellList();

});

// ================= LOGIN =================
function login() {

  let user = document.getElementById("username").value;
  let pass = document.getElementById("password").value;

  onValue(ref(db,"cashiers"), snapshot => {

    let found = false;

    snapshot.forEach(c => {

      let data = c.val();

      if(data.username === user && data.password === pass){

        sessionStorage.setItem("posAuth","true");
        sessionStorage.setItem("cashier", user);

        location.href = "index.html";
        found = true;

      }

    });

    if(!found){
      alert("Wrong username or password");
    }

  }, { onlyOnce:true });

}

function logout(){
  sessionStorage.removeItem("posAuth");
  location.href="login.html";
}

// ================= COMPANY =================
let company = {
  name:"Michael POS Store",
  address:"Abuja Nigeria",
  phone:"08012345678"
};

function loadCompany(){

  let n = document.getElementById("c-name");
  let a = document.getElementById("c-address");
  let p = document.getElementById("c-phone");

  if(n) n.innerText = company.name;
  if(a) a.innerText = company.address;
  if(p) p.innerText = company.phone;

}

// ================= ADD INVENTORY =================
document.getElementById("add-item")?.addEventListener("click", () => {

  let name = document.getElementById("item-name").value;
  let price = Number(document.getElementById("item-price").value);
  let qty = Number(document.getElementById("item-quantity").value);

  if(!name || price <= 0 || qty <= 0){
    alert("Fill all fields");
    return;
  }

  push(ref(db,"inventory"),{
    name:name,
    price:price,
    qty:qty
  });

  alert("Item added");

});

// ================= LOAD INVENTORY =================
function loadInventoryRealtime(){

  onValue(ref(db,"inventory"), snapshot => {

    inventory = [];
    let data = snapshot.val();

    for(let id in data){
      inventory.push(data[id]);
    }

    loadInventory();
    loadSellList();

  });

}

function loadInventory(){

  let body = document.getElementById("inventory-body");
  if(!body) return;

  body.innerHTML="";

  inventory.forEach(i => {

    body.innerHTML += `
      <tr>
        <td>${i.name}</td>
        <td>${i.price}</td>
        <td>${i.qty}</td>
      </tr>
    `;

  });

}

// ================= SELL DROPDOWN =================
function loadSellList(){

  let sell = document.getElementById("sell-item");
  if(!sell) return;

  sell.innerHTML = "<option>Select Item</option>";

  inventory.forEach(i=>{

    sell.innerHTML += `<option value="${i.name}">${i.name}</option>`;

  });

}

// ================= ADD TO CART =================
document.getElementById("sell-btn")?.addEventListener("click", () => {

  let name = document.getElementById("sell-item").value;
  let qty = Number(document.getElementById("sell-qty").value);

  if(name === "Select Item"){
    alert("Select item");
    return;
  }

  let item = inventory.find(i=>i.name === name);

  if(!item){
    alert("Item not found");
    return;
  }

  if(qty <= 0 || qty > item.qty){
    alert("Invalid quantity");
    return;
  }

  let total = qty * item.price;

  cart.push({
    name:name,
    qty:qty,
    price:item.price,
    total:total
  });

  document.getElementById("sell-body").innerHTML += `
  <tr>
    <td>${name}</td>
    <td>${qty}</td>
    <td>${item.price}</td>
    <td>${total}</td>
  </tr>`;

  updateSubtotal();

});

// ================= SUBTOTAL =================
function updateSubtotal(){

  let subtotal = cart.reduce((sum,i)=> sum + i.total ,0);

  let el = document.getElementById("subtotal");
  if(el) el.innerText = subtotal;

}

// ================= PRINT RECEIPT =================
document.getElementById("print-btn")?.addEventListener("click", () => {

  if(cart.length === 0){
    alert("No items");
    return;
  }

  document.getElementById("receipt").style.display="block";

  document.getElementById("r-store").innerText = company.name;
  document.getElementById("r-address").innerText = company.address;
  document.getElementById("r-phone").innerText = company.phone;

  document.getElementById("r-cashier").innerText =
    sessionStorage.getItem("cashier");

  document.getElementById("r-date").innerText =
    new Date().toLocaleString();

  let body = document.getElementById("r-items");
  body.innerHTML="";

  cart.forEach(i=>{

    body.innerHTML += `
    <tr>
      <td>${i.name}</td>
      <td>${i.qty}</td>
      <td>${i.price}</td>
      <td>${i.total}</td>
    </tr>`;

  });

  document.getElementById("r-total").innerText =
    document.getElementById("subtotal").innerText;

  window.print();

});
