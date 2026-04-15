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
const db  = getDatabase(app);

window.login = async (bizCode, user, pass) => {
    bizCode = bizCode.toUpperCase().trim();
    try {
        const snap = await get(ref(db, `businesses/${bizCode}`));
        if (!snap.exists()) return alert("Invalid Code");

        const data = snap.val();
        const config = data.config;

        if (config.active === false) return alert("ACCOUNT DISABLED. Contact Michael Web™.");

        // 31 Days + 3 Day Grace Logic
        const lastPaid = new Date(config.lastPaymentDate);
        const expiry = new Date(lastPaid.getFullYear(), lastPaid.getMonth() + 1, 3, 12, 0, 0);
        const now = new Date();

        if (now > expiry) {
            await update(ref(db, `businesses/${bizCode}/config`), { active: false });
            return alert("Subscription Expired. Access Denied.");
        }

        if (user === 'admin' && pass === config.adminPassword) {
            sessionStorage.setItem('bizId', bizCode);
            sessionStorage.setItem('role', 'admin');
            location.href = 'index.html';
        } else if (data.cashiers?.[user]?.password === pass) {
            sessionStorage.setItem('bizId', bizCode);
            sessionStorage.setItem('role', user);
            location.href = 'index.html';
        } else {
            alert("Wrong Password");
        }
    } catch (e) { alert("Database Error: Check connection/rules"); }
};
