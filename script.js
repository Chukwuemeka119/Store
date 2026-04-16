import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, push, onValue, get, update, remove, set }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ── FIREBASE ──────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAF7q176rxAoCFqhH0Djquhu0MphaUMLyQ",
  authDomain: "pos-store-29e58.firebaseapp.com",
  databaseURL: "https://pos-store-29e58-default-rtdb.firebaseio.com",
  projectId: "pos-store-29e58",
  storageBucket: "pos-store-29e58.firebasestorage.app",
  messagingSenderId: "494046387333",
  appId: "1:494046387333:web:44ef67eeac8e40e4f19dec"
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// ── UTILITIES ─────────────────────────────────────────────────────────────────
const clean   = str => String(str || '').replace(/[<>"'&]/g, c => ({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c]));
const $       = id  => document.getElementById(id);
const on      = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
const setText = (id, val) => { const el = $(id); if (el) el.textContent = val; };

// ── STATE ─────────────────────────────────────────────────────────────────────
let STORE         = { name: '', address: '', phone: '' };
let inventory     = [];
let cart          = [];
let allSales      = [];
let historyPeriod = 'daily';
let adminCache    = null;

// ── ROUTING ───────────────────────────────────────────────────────────────────
const PAGE = (() => {
  // Clean the path to handle cases like login.html, /login, or /Store/login
  const p = location.pathname.toLowerCase().split('/').pop().split('?')[0].split('#')[0];
  if (p === 'login.html' || p === 'login') return 'login.html';
  return p || 'index.html';
})();

function getBizId()   { return sessionStorage.getItem('bizId'); }
function getCashier() { return sessionStorage.getItem('cashier') || '—'; }
function bizRef(path) { return ref(db, `businesses/${getBizId()}/${path}`); }

// ── AUTH GUARD ────────────────────────────────────────────────────────────────
if (PAGE !== 'login.html') {
  if (!sessionStorage.getItem('posAuth') || !getBizId()) {
    sessionStorage.clear();
    location.href = 'login.html';
  }
}

// ── REAL-TIME SUBSCRIPTION GUARD ─────────────────────────────────────────────
if (PAGE !== 'login.html' && getBizId()) {
  onValue(ref(db, `businesses/${getBizId()}/config/active`), snap => {
    if (snap.exists() && snap.val() === false) {
      sessionStorage.clear();
      alert('⚠️ Your account has been deactivated.\nPlease contact Michael Web™ — 08033441185');
      location.href = 'login.html';
    }
  });
}

// ── ADMIN HELPERS ─────────────────────────────────────────────────────────────
async function getAdminPw() {
  if (adminCache) return adminCache;
  try {
    const snap = await get(bizRef('config/adminPassword'));
    adminCache = snap.exists() ? snap.val() : 'admin123';
  } catch { adminCache = 'admin123'; }
  return adminCache;
}

async function verifyAdmin(msg = 'Enter admin password:') {
  const correct = await getAdminPw();
  const entered = window.prompt(msg);
  if (entered === null) return false;
  return entered === correct;
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
const initApp = async () => {
  // Wire logout link if it exists
  on('logout-link', 'click', e => { e.preventDefault(); handleLogout(); });

  // CHECK: If the login button exists on this page, wire the login logic immediately
  if ($('login-btn')) {
    wireLOGIN();
    return;
  }

  // Load business details for navbar + other pages
  await loadStore();
  renderNavbar();

  if (PAGE === 'index.html') {
    wireINDEX();
    loadSubscriptionCard();
  } else if (PAGE === 'inventory.html') {
    wireINVENTORY();
  } else if (PAGE === 'sales.html') {
    wireSALES();
  } else if (PAGE === 'admin.html') {
    const ok = await verifyAdmin('🔐 Enter admin password to access this page:');
    if (!ok) {
      alert('Incorrect password. Access denied.');
      location.href = 'index.html';
    } else {
      wireADMIN();
    }
  }
};

// Start logic
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function wireLOGIN() {
  const bizEl = $('bizcode');
  if (bizEl) {
    bizEl.addEventListener('input', () => { bizEl.value = bizEl.value.toUpperCase(); });
  }

  on('login-btn', 'click', handleLogin);
  on('password', 'keydown', e => { if (e.key === 'Enter') handleLogin(); });
}

async function handleLogin() {
  const bizId = ($('bizcode')?.value || '').trim().toUpperCase();
  const user  = ($('username')?.value || '').trim();
  const pass  = ($('password')?.value || '').trim();

  if (!bizId || !user || !pass) { 
    alert('Please fill in all fields.'); 
    return; 
  }

  const btn = $('login-btn');
  if (btn) { 
    btn.textContent = 'Signing in...'; 
    btn.disabled = true; 
  }

  try {
    const snap = await get(ref(db, `businesses/${bizId}`));
    if (!snap.exists()) {
      alert('Business code not found.\nContact Michael Web™ — 08033441185');
      if (btn) { btn.textContent = 'Sign In →'; btn.disabled = false; }
      return;
    }

    const data   = snap.val();
    const config = data.config || {};

    if (config.active === false) {
      alert('⚠️ This account is deactivated.\nPlease contact Michael Web™ — 08033441185');
      if (btn) { btn.textContent = 'Sign In →'; btn.disabled = false; }
      return;
    }

    // Subscription check (34 days strict math)
    if (config.lastPaymentDate) {
      const lastPaid = new Date(config.lastPaymentDate);
      const expiry = new Date(lastPaid.getTime() + (34 * 24 * 60 * 60 * 1000));
      if (new Date() > expiry) {
        await update(ref(db, `businesses/${bizId}/config`), { active: false });
        alert('⚠️ Subscription expired.\nPlease contact Michael Web™ — 08033441185');
        if (btn) { btn.textContent = 'Sign In →'; btn.disabled = false; }
        return;
      }
    }

    let authenticated = false;
    if (user === 'admin') {
      if (pass === (config.adminPassword || 'admin123')) {
        sessionStorage.setItem('isAdmin', 'true');
        authenticated = true;
      }
    } else {
      const cashiers = data.cashiers || {};
      authenticated = Object.values(cashiers).some(c => c.username === user && c.password === pass);
    }

    if (authenticated) {
      sessionStorage.setItem('posAuth', 'true');
      sessionStorage.setItem('cashier', user);
      sessionStorage.setItem('bizId', bizId);
      location.href = 'index.html';
    } else {
      alert('Wrong username or password.');
      if (btn) { btn.textContent = 'Sign In →'; btn.disabled = false; }
    }
  } catch (err) {
    alert('Connection error. Please check your internet and try again.');
    console.error(err);
    if (btn) { btn.textContent = 'Sign In →'; btn.disabled = false; }
  }
}

// ── LOGOUT ────────────────────────────────────────────────────────────────────
function handleLogout() {
  if (!confirm('Sign out?')) return;
  sessionStorage.clear();
  location.href = 'login.html';
}

// ── REMAINING FUNCTIONS (loadStore, wireINVENTORY, etc.) ──────────────────────
async function loadStore() {
  try {
    const snap = await get(bizRef('business'));
    if (snap.exists()) STORE = snap.val();
  } catch {}
}

function renderNavbar() {
  setText('c-name', STORE.name || '');
  setText('c-address', STORE.address || '');
  setText('c-phone', STORE.phone || '');
}

function wireINDEX() { /* ... Dashboard Logic ... */ }
function loadSubscriptionCard() { /* ... Card Logic ... */ }
function wireINVENTORY() { /* ... Inventory Logic ... */ }
function wireSALES() { /* ... Sales Logic ... */ }
function wireADMIN() { /* ... Admin Logic ... */ }
