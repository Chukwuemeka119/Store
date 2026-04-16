# StockSavvy POS — by Michael Web™

## Quick Start
1. Paste `firebase-rules.json` into Firebase Console → Realtime Database → Rules → Publish
2. Upload all files to your GitHub repo
3. Open `setup-business.html` to create your first customer account
4. Give the customer: the site URL + their business code + admin password

## Files
| File | Purpose |
|------|---------|
| `login.html` | Login page (Business Code + Username + Password) |
| `index.html` | Dashboard with subscription status |
| `inventory.html` | Add/remove stock items |
| `sales.html` | Process sales, print receipts |
| `admin.html` | Cashiers, sales history, business settings |
| `script.js` | All app logic (Firebase + UI) |
| `style.css` | Full design system |
| `setup-business.html` | **Your private owner panel** |
| `firebase-rules.json` | Firebase security rules |

## Owner Panel (setup-business.html)
- Owner password: `mwowner2026` ← change in the file
- Create business accounts
- Mark payments (sets lastPaymentDate)
- Activate / Deactivate accounts instantly
- Deactivated users are kicked out in real-time

## Subscription Logic
- Each business has a `lastPaymentDate`
- They get the rest of that month + 3 grace days
- 5-day warning shown at login
- Auto-deactivates when expired
- Manual kill/wake from owner panel

## Default Credentials (new business)
- Business Code: whatever you set (e.g. SHOP001)
- Username: `admin`
- Password: whatever you set in owner panel

## Firebase Rules
Paste `firebase-rules.json` into Firebase Console.
Rules allow read/write per business — simple and effective
since the app uses custom password auth, not Firebase Auth.
