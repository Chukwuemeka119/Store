
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAF7q176rxAoCFqhH0Djquhu0MphaUMLyQ",
  authDomain: "pos-store-29e58.firebaseapp.com",
  databaseURL: "https://pos-store-29e58-default-rtdb.firebaseio.com",
  projectId: "pos-store-29e58",
  appId: "1:494046387333:web:44ef67eeac8e40e4f19dec"
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// GLOBAL LOGOUT
window.logout = () => {
    sessionStorage.clear();
    window.location.href = 'login.html';
};

// LOGIN LOGIC
const loginBtn = document.getElementById('login-btn');
if (loginBtn) {
    loginBtn.onclick = async () => {
        const bizCode = document.getElementById('bizcode').value.toUpperCase().trim();
        const user = document.getElementById('username').value.trim();
        const pass = document.getElementById('password').value;

        if (!bizCode || !user || !pass) return alert("Please fill all fields");

        try {
            const snap = await get(ref(db, `businesses/${bizCode}`));
            if (!snap.exists()) return alert("Invalid Business Code");

            const data = snap.val();
            const config = data.config;

            if (config.active === false) return alert("ACCOUNT DEACTIVATED. Contact Michael Web™.");

            // 31 + 3 Logic
            const lastPaid = new Date(config.lastPaymentDate);
            const expiry = new Date(lastPaid.getFullYear(), lastPaid.getMonth() + 1, 3, 12, 0, 0);
            if (new Date() > expiry) {
                await update(ref(db, `businesses/${bizCode}/config`), { active: false });
                return alert("Subscription Expired. Access Denied.");
            }

            if ((user === 'admin' && pass === config.adminPassword) || (data.cashiers && data.cashiers[user] && data.cashiers[user].password === pass)) {
                sessionStorage.setItem('bizId', bizCode);
                sessionStorage.setItem('role', user === 'admin' ? 'admin' : user);
                window.location.href = 'index.html';
            } else {
                alert("Incorrect credentials");
            }
        } catch (e) { alert("Connection Error. Check Firebase Rules."); }
    };
}
