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

// GLOBAL UTILS
window.logout = () => { sessionStorage.clear(); window.location.href = 'login.html'; };
const bizId = sessionStorage.getItem('bizId');

// --- LOGIN LOGIC ---
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

            // 31+3 Day Expiry Logic
            const lastPaid = new Date(data.config.lastPaymentDate);
            const expiry = new Date(lastPaid.getFullYear(), lastPaid.getMonth() + 1, 3, 12, 0, 0);
            if (new Date() > expiry || data.config.active === false) {
                await update(ref(db, `businesses/${biz}/config`), { active: false });
                return alert("Subscription Expired. Contact Michael Web™.");
            }

            if ((user === 'admin' && pass === data.config.adminPassword) || (data.cashiers?.[user]?.password === pass)) {
                sessionStorage.setItem('bizId', biz);
                window.location.href = 'index.html';
            } else { alert("Wrong credentials"); }
        } catch (e) { alert("Error connecting to database"); }
    };
}

// --- SETUP BUSINESS (OWNER PANEL) ---
if (document.getElementById('unlock')) {
    document.getElementById('unlock').onclick = () => {
        if (document.getElementById('owner-pass').value === 'mwowner2026') {
            document.getElementById('manager').style.display = 'block';
            document.querySelector('.card').style.display = 'none';
            loadBusinessList();
        } else { alert("Access Denied"); }
    };

    document.getElementById('create').onclick = async () => {
        const id = document.getElementById('new-id').value.toUpperCase().trim();
        const name = document.getElementById('new-name').value.trim();
        if (!id || !name) return alert("Fill all fields");

        // 1. Save secure data
        await set(ref(db, `businesses/${id}`), {
            config: { active: true, lastPaymentDate: new Date().toISOString(), adminPassword: "admin" },
            business: { name: name }
        });
        // 2. Save to public registry (This makes the list work!)
        await set(ref(db, `business_registry/${id}`), { name: name });
        
        alert("Business Created!");
        loadBusinessList();
    };

    async function loadBusinessList() {
        const listDiv = document.getElementById('biz-list');
        listDiv.innerHTML = "Loading...";
        const snap = await get(ref(db, 'business_registry'));
        listDiv.innerHTML = "";
        if (snap.exists()) {
            snap.forEach(child => {
                const id = child.key;
                const name = child.val().name;
                listDiv.innerHTML += `
                    <div class="card" style="margin-top:10px; border-left:5px solid var(--accent)">
                        <strong>${id}</strong> - ${name}
                    </div>`;
            });
        }
    }
}

// --- INVENTORY LOGIC ---
if (document.getElementById('add-item')) {
    onValue(ref(db, `businesses/${bizId}/inventory`), (snap) => {
        const list = document.getElementById('inventory-list');
        list.innerHTML = "";
        snap.forEach(c => {
            list.innerHTML += `<tr><td>${c.val().name}</td><td>₦${c.val().price}</td></tr>`;
        });
    });
    document.getElementById('add-item').onclick = () => {
        const name = document.getElementById('item-name').value;
        const price = document.getElementById('item-price').value;
        if (name && price) push(ref(db, `businesses/${bizId}/inventory`), { name, price: Number(price) });
    };
}
