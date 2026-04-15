import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, set, update, push, remove, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// 1. CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyAF7q176rxAoCFqhH0Djquhu0MphaUMLyQ",
  authDomain: "pos-store-29e58.firebaseapp.com",
  databaseURL: "https://pos-store-29e58-default-rtdb.firebaseio.com",
  projectId: "pos-store-29e58",
  appId: "1:494046387333:web:44ef67eeac8e40e4f19dec"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 2. SHARED UTILITIES
window.logout = () => { 
    sessionStorage.clear(); 
    window.location.href = 'login.html'; 
};

const bizId = sessionStorage.getItem('bizId');
const role = sessionStorage.getItem('role');

// 3. LOGIN LOGIC
const loginBtn = document.getElementById('login-btn');
if (loginBtn) {
    loginBtn.onclick = async () => {
        const biz = document.getElementById('bizcode').value.toUpperCase().trim();
        const user = document.getElementById('username').value.trim();
        const pass = document.getElementById('password').value;

        if(!biz || !user || !pass) return alert("Please fill all fields");

        try {
            const snap = await get(ref(db, `businesses/${biz}`));
            if(!snap.exists()) return alert("Invalid Business Code");
            
            const data = snap.val();
            // 31+3 Subscription Logic
            const lastPaid = new Date(data.config.lastPaymentDate);
            const expiry = new Date(lastPaid.getFullYear(), lastPaid.getMonth() + 1, 3, 12, 0, 0);
            
            if(new Date() > expiry || data.config.active === false) {
                await update(ref(db, `businesses/${biz}/config`), { active: false });
                return alert("Subscription Expired. Contact Michael Web™.");
            }

            const isAdmin = user === 'admin' && pass === data.config.adminPassword;
            const isCashier = data.cashiers && data.cashiers[user] && data.cashiers[user].password === pass;

            if(isAdmin || isCashier) {
                sessionStorage.setItem('bizId', biz);
                sessionStorage.setItem('role', user);
                window.location.href = 'index.html';
            } else {
                alert("Incorrect username or password");
            }
        } catch(e) { alert("Access Denied. Check your Firebase Rules."); }
    };
}

// 4. SETUP BUSINESS (OWNER PANEL)
if (document.getElementById('unlock')) {
    document.getElementById('unlock').onclick = () => {
        if(document.getElementById('owner-pass').value === 'mwowner2026') {
            document.getElementById('manager').style.display = 'block';
            document.querySelector('.card').style.display = 'none';
        }
    };

    document.getElementById('create').onclick = async () => {
        const id = document.getElementById('new-id').value.toUpperCase().trim();
        const name = document.getElementById('new-name').value.trim();
        if(!id || !name) return alert("Fill all fields");

        await set(ref(db, `businesses/${id}`), {
            business: { name: name, address: "", phone: "" },
            config: { active: true, lastPaymentDate: new Date().toISOString(), adminPassword: "admin" }
        });
        // Also add to registry for the list to work
        await set(ref(db, `business_registry/${id}`), { name: name });
        alert("Business Created! Default Admin Password: admin");
    };
}

// 5. INVENTORY LOGIC
if (document.getElementById('add-item')) {
    onValue(ref(db, `businesses/${bizId}/inventory`), (snap) => {
        const list = document.getElementById('inventory-list');
        list.innerHTML = '';
        snap.forEach(child => {
            const item = child.val();
            list.innerHTML += `<tr><td>${item.name}</td><td>₦${item.price}</td><td><button onclick="window.delItem('${child.key}')">Del</button></td></tr>`;
        });
    });

    document.getElementById('add-item').onclick = () => {
        const name = document.getElementById('item-name').value;
        const price = document.getElementById('item-price').value;
        if(name && price) push(ref(db, `businesses/${bizId}/inventory`), { name, price: Number(price) });
    };

    window.delItem = (key) => remove(ref(db, `businesses/${bizId}/inventory/${key}`));
}

// 6. SALES LOGIC
if (document.getElementById('sell-item')) {
    let cart = [];
    onValue(ref(db, `businesses/${bizId}/inventory`), (snap) => {
        const select = document.getElementById('sell-item');
        select.innerHTML = '<option value="">-- Select --</option>';
        window.tempInv = {};
        snap.forEach(c => {
            window.tempInv[c.key] = c.val();
            select.innerHTML += `<option value="${c.key}">${c.val().name}</option>`;
        });
    });

    document.getElementById('sell-btn').onclick = () => {
        const id = document.getElementById('sell-item').value;
        const qty = Number(document.getElementById('sell-qty').value) || 1;
        if(!id) return;
        const item = window.tempInv[id];
        cart.push({ name: item.name, qty, price: item.price, total: item.price * qty });
        renderCart();
    };

    function renderCart() {
        const body = document.getElementById('sell-body');
        let total = 0;
        body.innerHTML = '';
        cart.forEach(i => {
            total += i.total;
            body.innerHTML += `<tr><td>${i.name}</td><td>${i.qty}</td><td>₦${i.price}</td><td>₦${i.total}</td></tr>`;
        });
        document.getElementById('subtotal').innerText = total;
    }
}

// 7. ADMIN PANEL TABS
if (document.querySelector('.tab-bar')) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn, .tab-panel').forEach(el => el.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        };
    });
}            list.innerHTML = '<tr><td colspan="3">No items yet</td></tr>';
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
