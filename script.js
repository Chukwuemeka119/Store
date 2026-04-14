
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, push, onValue, get, update, remove, set }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAF7q176rxAoCFqhH0Djquhu0MphaUMLyQ",
  authDomain: "pos-store-29e58.firebaseapp.com",
  databaseURL: "https://pos-store-29e58-default-rtdb.firebaseio.com",
  projectId: "pos-store-29e58",
  appId: "1:494046387333:web:44ef67eeac8e40e4f19dec"
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// Sanitization to prevent XSS attacks
const clean = (str) => String(str).replace(/[<>]/g, '');

// AUTH & SUBSCRIPTION CHECK
window.login = async (bizCode, user, pass) => {
    bizCode = clean(bizCode.toUpperCase());
    user = clean(user);
    
    try {
        const snap = await get(ref(db, `businesses/${bizCode}`));
        if (!snap.exists()) return alert("Business not found");
        
        const data = snap.val();
        const config = data.config;

        // 1. Manual Deactivation Check
        if (config.active === false) return alert("Account Disabled by Michael Web™");

        // 2. Automated 3-Day Grace Period Check
        const lastPaid = new Date(config.lastPaymentDate);
        const expiry = new Date(lastPaid.getFullYear(), lastPaid.getMonth() + 1, 3, 12, 0, 0);
        const now = new Date();

        if (now > expiry) {
            await update(ref(db, `businesses/${bizCode}/config`), { active: false });
            return alert("Subscription Expired (3-day grace period ended).");
        }

        // 3. Reminder (5 days before the 3rd)
        const reminderDate = new Date(expiry);
        reminderDate.setDate(reminderDate.getDate() - 5);
        if (now > reminderDate) {
            const days = Math.ceil((expiry - now) / (86400000));
            alert(`⚠️ PAYMENT REMINDER: Account deactivates in ${days} days.`);
        }

        // 4. Password Verification
        if (user === 'admin' && pass === config.adminPassword) {
            proceed(bizCode, 'admin');
        } else if (data.cashiers?.[user]?.password === pass) {
            proceed(bizCode, user);
        } else {
            alert("Wrong credentials");
        }
    } catch (e) { console.error(e); }
};

function proceed(id, role) {
    sessionStorage.setItem('bizId', id);
    sessionStorage.setItem('role', role);
    location.href = 'index.html';
}
