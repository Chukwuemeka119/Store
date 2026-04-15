import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAF7q176rxAoCFqhH0Djquhu0MphaUMLyQ",
  authDomain: "pos-store-29e58.firebaseapp.com",
  databaseURL: "https://pos-store-29e58-default-rtdb.firebaseio.com",
  projectId: "pos-store-29e58",
  appId: "1:494046387333:web:44ef67eeac8e40e4f19dec"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

window.logout = () => { sessionStorage.clear(); window.location.href = 'login.html'; };

const loginBtn = document.getElementById('login-btn');
if(loginBtn) {
    loginBtn.onclick = async () => {
        const biz = document.getElementById('bizcode').value.toUpperCase().trim();
        const user = document.getElementById('username').value.trim();
        const pass = document.getElementById('password').value;
        if(!biz || !user || !pass) return alert("All fields required");

        try {
            const snap = await get(ref(db, `businesses/${biz}`));
            if(!snap.exists()) return alert("Store not found");
            const data = snap.val();
            if(data.config.active === false) return alert("Account Disabled. Contact Michael Web.");

            const lastPaid = new Date(data.config.lastPaymentDate);
            const expiry = new Date(lastPaid.getFullYear(), lastPaid.getMonth() + 1, 3, 12, 0, 0);
            if(new Date() > expiry) {
                await update(ref(db, `businesses/${biz}/config`), { active: false });
                return alert("Subscription Expired");
            }

            if((user === 'admin' && pass === data.config.adminPassword) || (data.cashiers?.[user]?.password === pass)) {
                sessionStorage.setItem('bizId', biz);
                sessionStorage.setItem('role', user);
                window.location.href = 'index.html';
            } else { alert("Wrong credentials"); }
        } catch(e) { alert("Error: Check internet/Rules"); }
    };
}