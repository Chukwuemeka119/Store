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

// --- GLOBAL UTILS ---
window.logout = () => { sessionStorage.clear(); window.location.href = 'login.html'; };
const bizId = sessionStorage.getItem('bizId');
const role = sessionStorage.getItem('role');

// Display Store Name
if (bizId && document.getElementById('c-name')) {
    get(ref(db, `businesses/${bizId}/business`)).then(s => {
        if(s.exists()) {
            document.getElementById('c-name').innerText = s.val().name;
            if(document.getElementById('c-address')) document.getElementById('c-address').innerText = s.val().address || '';
        }
    });
}

// --- 1. LOGIN & EXPIRATION (31+3) ---
const loginBtn = document.getElementById('login-btn');
if (loginBtn) {
    loginBtn.onclick = async () => {
        const biz = document.getElementById('bizcode').value.toUpperCase().trim();
        const user = document.getElementById('username').value.trim();
        const pass = document.getElementById('password').value;

        try {
            const snap = await get(ref(db, `businesses/${biz}`));
            if (!snap.exists()) return alert("Store not found");
            const data = snap.val();

            const lastPaid = new Date(data.config.lastPaymentDate);
            const expiry = new Date(lastPaid.getFullYear(), lastPaid.getMonth() + 1, 3, 12, 0, 0);
            if (new Date() > expiry || data.config.active === false) {
                await update(ref(db, `businesses/${biz}/config`), { active: false });
                return alert("Subscription Expired. Contact Michael Web™.");
            }

            if ((user === 'admin' && pass === data.config.adminPassword) || (data.cashiers?.[user]?.password === pass)) {
                sessionStorage.setItem('bizId', biz);
                sessionStorage.setItem('role', user);
                window.location.href = 'index.html';
            } else { alert("Invalid Credentials"); }
        } catch (e) { alert("Error connecting"); }
    };
}

// --- 2. INVENTORY (FIXED: Added Stock Amount) ---
const addItemBtn = document.getElementById('add-item');
if (addItemBtn && bizId) {
    onValue(ref(db, `businesses/${bizId}/inventory`), (snap) => {
        const list = document.getElementById('inventory-list');
        if (!list) return;
        list.innerHTML = "";
        snap.forEach(c => {
            const item = c.val();
            list.innerHTML += `
                <tr>
                    <td>${item.name}</td>
                    <td>₦${item.price}</td>
                    <td>${item.stock || 0}</td>
                    <td><button onclick="window.delItem('${c.key}')" style="background:var(--danger); padding:4px 8px; width:auto;">Delete</button></td>
                </tr>`;
        });
    });

    addItemBtn.onclick = async () => {
        const name = document.getElementById('item-name').value;
        const price = document.getElementById('item-price').value;
        const stock = document.getElementById('item-stock')?.value || 0; // Fixed: Captures amount
        if (name && price) {
            await push(ref(db, `businesses/${bizId}/inventory`), { 
                name, 
                price: Number(price), 
                stock: Number(stock) 
            });
            alert("Stock Added!");
        }
    };
    window.delItem = (id) => { if(confirm("Delete item?")) remove(ref(db, `businesses/${bizId}/inventory/${id}`)); };
}

// --- 3. ADMIN PAGE (SECURE PASSWORD CHANGE) ---
if (window.location.pathname.includes('admin.html')) {
    if (role !== 'admin') { window.location.href = 'index.html'; } // Admin only

    // Tab Switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn, .tab-panel').forEach(el => el.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        };
    });

    // Change Admin Password
    const savePassBtn = document.getElementById('save-biz-btn');
    if (savePassBtn) {
        savePassBtn.onclick = async () => {
            const newP = document.getElementById('new-pass').value;
            const confP = document.getElementById('confirm-pass').value;
            if (newP && newP === confP) {
                await update(ref(db, `businesses/${bizId}/config`), { adminPassword: newP });
                alert("Admin Password Changed!");
            } else { alert("Passwords don't match!"); }
        };
    }
}

// --- 4. SETUP TOOL (OWNER PANEL) ---
const unlockBtn = document.getElementById('unlock');
if (unlockBtn) {
    unlockBtn.onclick = () => {
        if (document.getElementById('owner-pass').value === 'mwowner2026') {
            document.getElementById('manager').style.display = 'block';
            unlockBtn.parentElement.style.display = 'none';
            loadBusinessList();
        }
    };
    document.getElementById('create').onclick = async () => {
        const id = document.getElementById('new-id').value.toUpperCase().trim();
        const name = document.getElementById('new-name').value.trim();
        await set(ref(db, `businesses/${id}`), {
            config: { active: true, lastPaymentDate: new Date().toISOString(), adminPassword: "admin" },
            business: { name: name }
        });
        await set(ref(db, `business_registry/${id}`), { name: name });
        alert("Created!");
        loadBusinessList();
    };
}

async function loadBusinessList() {
    const listDiv = document.getElementById('biz-list');
    if (!listDiv) return;
    const snap = await get(ref(db, 'business_registry'));
    listDiv.innerHTML = "";
    if (snap.exists()) {
        snap.forEach(c => {
            listDiv.innerHTML += `<div class="card" style="margin-top:10px;"><strong>${c.key}</strong>: ${c.val().name}</div>`;
        });
    }
}

// --- 5. SALES DROPDOWN ---
const sellSel = document.getElementById('sell-item');
if (sellSel && bizId) {
    onValue(ref(db, `businesses/${bizId}/inventory`), (snap) => {
        sellSel.innerHTML = '<option value="">-- Select Item --</option>';
        snap.forEach(c => {
            sellSel.innerHTML += `<option value="${c.key}">${c.val().name} (₦${c.val().price})</option>`;
        });
    });
                }    const listDiv = document.getElementById('biz-list');
    if (!listDiv) return;
    const snap = await get(ref(db, '
