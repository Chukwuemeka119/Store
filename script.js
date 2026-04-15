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

// --- GLOBAL UTILITIES ---
window.logout = () => { sessionStorage.clear(); window.location.href = 'login.html'; };
const bizId = sessionStorage.getItem('bizId');
const role = sessionStorage.getItem('role');

// Navbar Store Name Display
if (bizId && document.getElementById('c-name')) {
    get(ref(db, `businesses/${bizId}/business`)).then(s => {
        if(s.exists()) document.getElementById('c-name').innerText = s.val().name;
    });
}

// --- 1. LOGIN & EXPIRATION ---
const loginBtn = document.getElementById('login-btn');
if (loginBtn) {
    loginBtn.onclick = async () => {
        const biz = document.getElementById('bizcode').value.toUpperCase().trim();
        const user = document.getElementById('username').value.trim();
        const pass = document.getElementById('password').value;

        try {
            const snap = await get(ref(db, `businesses/${biz}`));
            if (!snap.exists()) return alert("Invalid Business Code");
            const data = snap.val();

            // Expiry Logic (31+3 Days)
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
            } else { alert("Wrong credentials"); }
        } catch (e) { alert("Check internet connection."); }
    };
}

// --- 2. DASHBOARD (SHOW DATE AND ACTIVATE) ---
if (window.location.pathname.includes('index.html') || window.location.pathname.endsWith('/')) {
    if (bizId) {
        get(ref(db, `businesses/${bizId}`)).then(snap => {
            if (snap.exists()) {
                const data = snap.val();
                const lastPaid = new Date(data.config.lastPaymentDate);
                const expiry = new Date(lastPaid.getFullYear(), lastPaid.getMonth() + 1, 3, 12, 0, 0);
                
                const card = document.querySelector('.card');
                if (card) {
                    card.innerHTML = `
                        <h3>${data.business.name}</h3>
                        <p style="margin-top:10px;"><b>Status:</b> ${data.config.active ? '✅ Active' : '❌ Expired'}</p>
                        <p><b>Activated:</b> ${lastPaid.toLocaleDateString()}</p>
                        <p><b>Expires:</b> ${expiry.toLocaleDateString()}</p>
                    `;
                }
            }
        });
    }
}

// --- 3. SETUP BUSINESS (OWNER PANEL) ---
const unlockBtn = document.getElementById('unlock');
if (unlockBtn) {
    unlockBtn.onclick = () => {
        if (document.getElementById('owner-pass').value === 'mwowner2026') {
            document.getElementById('manager').style.display = 'block';
            unlockBtn.parentElement.style.display = 'none';
            loadRegistry();
        } else { alert("Access Denied"); }
    };

    document.getElementById('create').onclick = async () => {
        const id = document.getElementById('new-id').value.toUpperCase().trim();
        const name = document.getElementById('new-name').value.trim();
        if (id && name) {
            await set(ref(db, `businesses/${id}`), {
                config: { active: true, lastPaymentDate: new Date().toISOString(), adminPassword: "admin" },
                business: { name: name }
            });
            await set(ref(db, `business_registry/${id}`), { name: name });
            alert("Business Created!");
            loadRegistry();
        }
    };

    async function loadRegistry() {
        const list = document.getElementById('biz-list');
        const snap = await get(ref(db, 'business_registry'));
        list.innerHTML = "";
        if (snap.exists()) {
            snap.forEach(c => {
                list.innerHTML += `<div class="card" style="margin-top:10px;"><b>${c.key}</b>: ${c.val().name}</div>`;
            });
        }
    }
}

// --- 4. INVENTORY ---
const addItemBtn = document.getElementById('add-item');
if (addItemBtn && bizId) {
    onValue(ref(db, `businesses/${bizId}/inventory`), (snap) => {
        const list = document.getElementById('inventory-list');
        list.innerHTML = "";
        snap.forEach(c => {
            list.innerHTML += `<tr><td>${c.val().name}</td><td>₦${c.val().price}</td><td><button onclick="window.delItem('${c.key}')" style="background:var(--danger); width:auto; padding:5px 10px;">Delete</button></td></tr>`;
        });
    });

    addItemBtn.onclick = () => {
        const name = document.getElementById('item-name').value;
        const price = document.getElementById('item-price').value;
        if (name && price) push(ref(db, `businesses/${bizId}/inventory`), { name, price: Number(price) });
    };

    window.delItem = (id) => remove(ref(db, `businesses/${bizId}/inventory/${id}`));
}

// --- 5. ADMIN PAGE ---
if (window.location.pathname.includes('admin.html')) {
    if (role !== 'admin') window.location.href = 'index.html'; // Security

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn, .tab-panel').forEach(el => el.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        };
    });

    const saveBtn = document.getElementById('save-biz-btn');
    if (saveBtn) {
        saveBtn.onclick = async () => {
            const name = document.getElementById('biz-name').value;
            const addr = document.getElementById('biz-address').value;
            const ph = document.getElementById('biz-phone').value;
            await update(ref(db, `businesses/${bizId}/business`), { name, address: addr, phone: ph });
            alert("Details Updated!");
        };
    }
}    document.getElementById('create').onclick = async () => {
        const id = document.getElementById('new-id').value.toUpperCase().trim();
        const name = document.getElementById('new-name').value.trim();
        if(!id || !name) return alert("Missing Info");
        
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
            listDiv.innerHTML += `<div class="card" style="margin-top:10px; border-left:4px solid var(--accent)"><strong>${c.key}</strong>: ${c.val().name}</div>`;
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
}
