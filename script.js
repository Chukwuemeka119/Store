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

// --- 1. LOGIN PAGE ---
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

            if ((user === 'admin' && pass === data.config.adminPassword) || (data.cashiers?.[user]?.password === pass)) {
                sessionStorage.setItem('bizId', biz);
                sessionStorage.setItem('role', user);
                window.location.href = 'index.html';
            } else { alert("Wrong credentials"); }
        } catch (e) { alert("Check Connection/Rules"); }
    };
}

// --- 2. ADMIN PAGE LOGIC (TABS & SETTINGS) ---
if (window.location.pathname.includes('admin.html') && bizId) {
    // Tab Switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn, .tab-panel').forEach(el => el.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        };
    });

    // Save Business Details
    const saveBizBtn = document.getElementById('save-biz-btn');
    if (saveBizBtn) {
        saveBizBtn.onclick = async () => {
            const name = document.getElementById('biz-name').value;
            const addr = document.getElementById('biz-address').value;
            const phone = document.getElementById('biz-phone').value;
            await update(ref(db, `businesses/${bizId}/business`), { name, address: addr, phone });
            alert("Business Details Updated!");
        };
    }

    // Create Cashier
    const addCashierBtn = document.getElementById('add-cashier-btn');
    if (addCashierBtn) {
        addCashierBtn.onclick = async () => {
            const user = document.getElementById('cashier-name').value.trim();
            const pass = document.getElementById('cashier-pass').value;
            if(user && pass) {
                await set(ref(db, `businesses/${bizId}/cashiers/${user}`), { password: pass });
                alert("Cashier Added!");
            }
        };
    }
}

// --- 3. SETUP BUSINESS (OWNER PANEL) ---
const unlockBtn = document.getElementById('unlock');
if (unlockBtn) {
    unlockBtn.onclick = () => {
        if (document.getElementById('owner-pass').value === 'mwowner2026') {
            document.getElementById('manager').style.display = 'block';
            unlockBtn.parentElement.style.display = 'none';
            loadBusinessList();
        } else { alert("Access Denied"); }
    };

    document.getElementById('create').onclick = async () => {
        const id = document.getElementById('new-id').value.toUpperCase().trim();
        const name = document.getElementById('new-name').value.trim();
        await set(ref(db, `businesses/${id}`), {
            config: { active: true, lastPaymentDate: new Date().toISOString(), adminPassword: "admin" },
            business: { name: name }
        });
        await set(ref(db, `business_registry/${id}`), { name: name });
        alert("Business Created!");
        loadBusinessList();
    };
}

async function loadBusinessList() {
    const listDiv = document.getElementById('biz-list');
    if (!listDiv) return;
    const snap = await get(ref(db, '
