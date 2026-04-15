import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, set, update, push, remove, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAF7q176rxAoCFqhH0Djquhu0MphaUMLyQ",
  authDomain: "pos-store-29e58.firebaseapp.com",
  databaseURL: "https://pos-store-29e58-default-rtdb.firebaseio.com",
  projectId: "pos-store-29e58",
  appId: "1:494046387333:web:44ef67eeac8e40e4f19dec"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 1. GLOBAL LOGOUT
window.logout = () => { 
    sessionStorage.clear(); 
    window.location.href = 'login.html'; 
};

// 2. AUTHENTICATION GUARD
const bizId = sessionStorage.getItem('bizId');
const currentPath = window.location.pathname;
const isPublicPage = currentPath.includes('login.html') || currentPath.includes('setup-business.html');

if (!bizId && !isPublicPage) {
    window.location.href = 'login.html';
}

// ==========================================
// LOGIN PAGE LOGIC
// ==========================================
if (document.getElementById('login-btn')) {
    document.getElementById('login-btn').onclick = async () => {
        const biz = document.getElementById('bizcode').value.toUpperCase().trim();
        const user = document.getElementById('username').value.trim();
        const pass = document.getElementById('password').value;
        if(!biz || !user || !pass) return alert("All fields required");

        try {
            const snap = await get(ref(db, `businesses/${biz}`));
            if(!snap.exists()) return alert("Store not found or Invalid Business Code");
            const data = snap.val();
            
            if(data.config.active === false) return alert("Account Disabled. Contact Michael Web™.");

            // 31+3 Logic
            const lastPaid = new Date(data.config.lastPaymentDate);
            const expiry = new Date(lastPaid.getFullYear(), lastPaid.getMonth() + 1, 3, 12, 0, 0);
            if(new Date() > expiry) {
                await update(ref(db, `businesses/${biz}/config`), { active: false });
                return alert("Subscription Expired. Please renew.");
            }

            if((user === 'admin' && pass === data.config.adminPassword) || (data.cashiers?.[user]?.password === pass)) {
                sessionStorage.setItem('bizId', biz);
                sessionStorage.setItem('role', user);
                window.location.href = 'index.html';
            } else { alert("Wrong Username or Password"); }
        } catch(e) { alert("Permission Denied: Check Internet Connection"); }
    };
}

// ==========================================
// MICHAEL WEB™ SETUP PANEL LOGIC
// ==========================================
if (document.getElementById('unlock')) {
    document.getElementById('unlock').onclick = () => {
        if (document.getElementById('owner-pass').value === 'mwowner2026') {
            document.getElementById('manager').style.display = 'block';
            document.querySelector('.card').style.display = 'none';
        } else { alert("Wrong Owner Password"); }
    };

    document.getElementById('create').onclick = async () => {
        const newId = document.getElementById('new-id').value.toUpperCase().trim();
        const newName = document.getElementById('new-name').value.trim();
        if (!newId) return alert("Business ID is required");
        await set(ref(db, `businesses/${newId}`), {
            config: { active: true, lastPaymentDate: new Date().toISOString(), adminPassword: 'admin' },
            business: { name: newName }
        });
        alert(`Success! Store ${newId} created. Default Admin pass is 'admin'.`);
    };
}

// ==========================================
// DASHBOARD HEADER LOGIC (For Index, Sales, Admin)
// ==========================================
if (bizId && document.getElementById('c-name')) {
    get(ref(db, `businesses/${bizId}/business`)).then(snap => {
        if(snap.exists()) {
            document.getElementById('c-name').innerText = snap.val().name || `Store: ${bizId}`;
        }
    });
}

// ==========================================
// INVENTORY PAGE LOGIC
// ==========================================
if (document.getElementById('add-item')) {
    const list = document.getElementById('inventory-list');
    
    onValue(ref(db, `businesses/${bizId}/inventory`), (snap) => {
        list.innerHTML = '';
        if(!snap.exists()) {
            list.innerHTML = '<tr><td colspan="3">No items yet</td></tr>';
            return;
        }
        snap.forEach(child => {
            const item = child.val();
            list.innerHTML += `<tr>
                <td>${item.name}</td>
                <td>₦${item.price}</td>
                <td><button onclick="window.delItem('${child.key}')" style="background:var(--danger);padding:5px;">Delete</button></td>
            </tr>`;
        });
    });

    document.getElementById('add-item').onclick = async () => {
        const name = document.getElementById('item-name').value;
        const price = document.getElementById('item-price').value;
        if(name && price) {
            await push(ref(db, `businesses/${bizId}/inventory`), { name, price: Number(price) });
            document.getElementById('item-name').value = '';
            document.getElementById('item-price').value = '';
        } else { alert("Enter name and price"); }
    };

    window.delItem = async (key) => {
        if(confirm("Delete this item?")) {
            await remove(ref(db, `businesses/${bizId}/inventory/${key}`));
        }
    };
}

// ==========================================
// SALES PAGE LOGIC
// ==========================================
if (document.getElementById('sell-btn')) {
    let cart = [];
    const select = document.getElementById('sell-item');
    
    // Load Inventory into Dropdown
    onValue(ref(db, `businesses/${bizId}/inventory`), snap => {
        select.innerHTML = '<option value="">-- Select Item --</option>';
        window.invData = {};
        if(snap.exists()){
            snap.forEach(c => {
                const item = c.val();
                window.invData[c.key] = item;
                select.innerHTML += `<option value="${c.key}">${item.name} (₦${item.price})</option>`;
            });
        }
    });

    // Add to Cart
    document.getElementById('sell-btn').onclick = () => {
        const key = select.value;
        const qty = parseInt(document.getElementById('sell-qty').value) || 1;
        if(!key) return alert("Select an item");
        
        const item = window.invData[key];
        cart.push({ key, name: item.name, price: item.price, qty, total: item.price * qty });
        renderCart();
    };

    function renderCart() {
        const tbody = document.getElementById('sell-body');
        tbody.innerHTML = '';
        let subtotal = 0;
        if(cart.length === 0) {
            tbody.innerHTML = '<tr id="empty-row"><td colspan="4" style="color:var(--muted);text-align:center;">Cart is empty</td></tr>';
        } else {
            cart.forEach(c => {
                subtotal += c.total;
                tbody.innerHTML += `<tr><td>${c.name}</td><td>${c.qty}</td><td>₦${c.price}</td><td>₦${c.total}</td></tr>`;
            });
        }
        document.getElementById('subtotal').innerText = subtotal;
    }
}

// ==========================================
// ADMIN TABS LOGIC
// ==========================================
if (document.querySelector('.tab-bar')) {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        };
    });
}