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
window.logout = () => {
    sessionStorage.clear();
    window.location.href = 'login.html';
};

const bizId = sessionStorage.getItem('bizId');

// --- 1. LOGIN PAGE LOGIC ---
const loginBtn = document.getElementById('login-btn');
if (loginBtn) {
    loginBtn.onclick = async () => {
        const biz = document.getElementById('bizcode').value.toUpperCase().trim();
        const user = document.getElementById('username').value.trim();
        const pass = document.getElementById('password').value;

        if(!biz || !user || !pass) return alert("All fields required");

        try {
            const snap = await get(ref(db, `businesses/${biz}`));
            if (!snap.exists()) return alert("Store not found");
            const data = snap.val();

            // 31+3 Expiry Check
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
        } catch (e) { alert("Connection Error. Check Firebase Rules."); }
    };
}

// --- 2. SETUP BUSINESS (OWNER PANEL) ---
const unlockBtn = document.getElementById('unlock');
if (unlockBtn) {
    unlockBtn.onclick = () => {
        if (document.getElementById('owner-pass').value === 'mwowner2026') {
            document.getElementById('manager').style.display = 'block';
            unlockBtn.parentElement.style.display = 'none';
            loadBusinessList();
        } else { alert("Incorrect Password"); }
    };

    const createBtn = document.getElementById('create');
    if (createBtn) {
        createBtn.onclick = async () => {
            const id = document.getElementById('new-id').value.toUpperCase().trim();
            const name = document.getElementById('new-name').value.trim();
            if (!id || !name) return alert("Enter ID and Name");

            await set(ref(db, `businesses/${id}`), {
                config: { active: true, lastPaymentDate: new Date().toISOString(), adminPassword: "admin" },
                business: { name: name }
            });
            await set(ref(db, `business_registry/${id}`), { name: name });
            alert("Business Created!");
            loadBusinessList();
        };
    }
}

async function loadBusinessList() {
    const listDiv = document.getElementById('biz-list');
    if (!listDiv) return;
    listDiv.innerHTML = "Loading...";
    try {
        const snap = await get(ref(db, 'business_registry'));
        listDiv.innerHTML = "";
        if (snap.exists()) {
            snap.forEach(child => {
                listDiv.innerHTML += `
                    <div class="card" style="margin-top:10px; border-left:4px solid var(--accent)">
                        <strong>ID: ${child.key}</strong><br>Name: ${child.val().name}
                    </div>`;
            });
        }
    } catch(e) { listDiv.innerHTML = "Error loading list. Check Rules."; }
}

// --- 3. INVENTORY PAGE LOGIC ---
const addItemBtn = document.getElementById('add-item');
if (addItemBtn && bizId) {
    onValue(ref(db, `businesses/${bizId}/inventory`), (snap) => {
        const list = document.getElementById('inventory-list');
        if (!list) return;
        list.innerHTML = "";
        snap.forEach(c => {
            list.innerHTML += `<tr><td>${c.val().name}</td><td>₦${c.val().price}</td></tr>`;
        });
    });

    addItemBtn.onclick = () => {
        const name = document.getElementById('item-name').value;
        const price = document.getElementById('item-price').value;
        if (name && price) push(ref(db, `businesses/${bizId}/inventory`), { name, price: Number(price) });
    };
}

// --- 4. SALES PAGE LOGIC ---
const sellItemSelect = document.getElementById('sell-item');
if (sellItemSelect && bizId) {
    onValue(ref(db, `businesses/${bizId}/inventory`), (snap) => {
        sellItemSelect.innerHTML = '<option value="">-- Select Item --</option>';
        snap.forEach(c => {
            sellItemSelect.innerHTML += `<option value="${c.key}">${c.val().name}</option>`;
        });
    });
}
