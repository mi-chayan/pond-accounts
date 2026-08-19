# Natun Bari Pond Accounts

A small web app for the pond. Anyone with the link sees the dashboard.
Only Rafique can add entries. The Google Sheet stays the single source of truth.

Installs to a phone home screen like an app (Chrome: menu → **Add to Home screen**).

---

## What it does

| Tab | Who | What it is for |
|---|---|---|
| **Dashboard** | everyone | Cash, cost breakdown, monthly cost, partner positions, monthly plan, latest entries |
| **Round** | Rafique | Announce a funding round. Enter one total, it splits 40 / 40 / 20 and writes 3 ledger rows plus each partner's due |
| **Expense** | Rafique | Money out: date, paid to, what was bought, amount |
| **Sale** | Rafique | Fish out: date, buyer and species, kg, rate, discount, Sold or Eaten |
| **Payments** | Rafique | Money a partner hands over, or money returned to him |

Rafique funds his own share automatically as manager, so he is not in the Payments list.

---

## Setup, three parts

### 1. The backend (Google Apps Script)

1. Open the **Pond Acct** sheet → **Extensions → Apps Script**
2. Delete whatever is there, paste the whole of `../05 Apps Script/Code.gs`, save
3. In the editor, open `setPasscode()` and run it once. The passcode is stored in Google's Script Properties, not in the sheet.
   **Never upload `Code.gs` to GitHub. It holds the passcode. Only the `02 Web App` folder goes to GitHub.**
4. **Deploy → New deployment → Web app**
   - Description: `Pond API`
   - **Execute as: Me**
   - **Who has access: Anyone**
5. Copy the web app URL. It ends in `/exec`

> The sheet tab is named `Pond with Shahidullah ` **with a space at the end**. `Code.gs` already accounts for it. If you ever rename that tab, change `SHEET_LEDGER` at the top of `Code.gs`.

### 2. The app

Open `app.js`, first line, replace the placeholder:

```js
const API = 'https://script.google.com/macros/s/AKfy…/exec';
```

### 3. Hosting

**GitHub**

```bash
git init
git add .
git commit -m "Pond accounts app"
git branch -M main
git remote add origin https://github.com/<you>/pond-accounts.git
git push -u origin main
```

**Cloudflare Pages**

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**
2. Pick the repo
3. Build command: **leave empty**. Build output directory: **`/`**
4. Deploy

You get a URL like `https://pond-accounts.pages.dev`. Send that to the investors.

---

## Adding it to a phone home screen

**Android / Chrome** — open the link, menu (⋮) → *Add to Home screen* → *Install*.
**iPhone / Safari** — open the link, Share → *Add to Home Screen*.

It then opens full screen with the fish icon, no browser bar.

---

## About the passcode, read this honestly

This is a **shared passcode**, not real user accounts. It is checked on the server
side inside Apps Script, so the app files on Cloudflare contain no secret and a
curious investor cannot unlock editing by reading the page source.

But it is only as strong as the passcode itself. So:

- Use something long, 12 characters or more. Not a birthday.
- Give it to Rafique only.
- If it ever leaks, run `setPasscode()` again with a new one. Nothing else changes.
- Anyone with the API URL can *read* the data. That is intended, the dashboard is public.

If you later want proper per-person logins, that needs a real backend such as
Cloudflare Workers with D1. This design was chosen because it keeps the Google
Sheet as the single source of truth and costs nothing to run.

---

## Files

```
index.html               the app shell, all five screens
app.js                   logic, charts, forms  ← set API here
styles.css               styling, light and dark
manifest.webmanifest     makes it installable
sw.js                    offline cache for the shell
icons/                   app icons
_headers                 Cloudflare security headers
```

## How the numbers work

- **Investments column** = the *projected* investment. A round is announced, everyone owes their share.
- **Person tabs** = what each man actually handed over.
- **Cash in hand** = projected investment + fish money received − total cost.
- **Eaten fish** counts as income for the profit split but never as cash.
- **True monthly cost** = running cost per month + lease spread over 60 months.
- **Break-even** = true monthly cost ÷ rate per kg.

## If something looks wrong

- Dashboard blank and it says *not connected*: `API` in `app.js` was not set.
- *Wrong passcode*: run `setPasscode()` again and use that value.
- *Could not reach the sheet*: the deployment access is probably not set to **Anyone**.
- Entries save but do not appear: pull to refresh, or reopen the app. It refetches every 2 minutes.
