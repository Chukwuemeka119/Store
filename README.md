# StockSavvy — by Michael Web™

## Files
- `index.html` — Dashboard
- `login.html` — Login page (Business Code + Username + Password)
- `inventory.html` — Inventory management
- `sales.html` — Sales & receipts
- `admin.html` — Admin panel (cashiers, history, business details)
- `script.js` — All app logic
- `style.css` — All styles
- `setup-business.html` — YOUR private tool to create/manage customer accounts

## Firebase Rules
Paste the contents of `firebase-rules.json` into your Firebase console:
1. Go to console.firebase.google.com
2. Select pos-store-29e58
3. Realtime Database → Rules
4. Paste and Publish

## Setup Business Tool
- URL: yoursite/setup-business.html
- Owner password: mwowner2026
- Change this in setup-business.html line: `const PASS = 'mwowner2026'`

## Default Admin Login (new businesses)
- Business Code: whatever you set
- Username: admin
- Password: whatever you set in setup tool

## Subscription Control
- Set "lastPaymentDate" when customer pays
- Account auto-deactivates 3 days after next month
- Manual Kill/Wake in setup-business.html
- Deactivated users are kicked out in real-time
