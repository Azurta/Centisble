# Centsible — honest, automatic budgeting

*(Working name — change `APP_NAME` in `src/brand.ts` and the `<title>` in `index.html`.)*

Centsible tracks your spending automatically, sorts it into categories, shows where you could save, and coaches you with lessons and a Money Score.

It fixes the main problem with a hand-built budget sheet: **card payments counted as spending**. If you put everything on a credit card for points and then pay the card from checking, adding up every withdrawal counts each purchase twice. Centsible counts a purchase once, when you swipe the card. The card payment is marked "Not spending". Only **interest and fees** are added on top.

## Features

| What you asked for | How it works |
|---|---|
| **Automatic** | Link checking, savings, and credit cards through [Plaid](https://plaid.com). New purchases show up on their own. With a webhook URL set, they arrive within minutes of a swipe. Without one, the server checks every 15 minutes. The page updates live. |
| **Categories** | Starts with Rent, Debt, Car & Gas, Groceries, Bills, Eating / Going Out, Entertainment, Alcohol, Shopping, Subscriptions, Misc. **Add, rename or delete** categories under **Categories & Limits**. Give a category **auto-sort words** (e.g. Coffee → "starbucks, dunkin") and matching purchases land there automatically. Everything else is sorted by built-in merchant rules and the bank's own category data. Fix any transaction and tick "Remember category for merchant" to sort that merchant the same way from then on. Deleting a category moves its purchases to Misc. |
| **Home screen** | Opens on the spending pie chart and four tappable numbers: **Income**, **Expenses**, **You own** (checking, savings, cash, investments), **You owe** (cards and loans). Each one opens the matching transactions or accounts; tap a pie slice to see that category's purchases. Below that: limits, accounts and net worth, **debt & interest** (each debt's balance, rate, estimated interest per month/year, interest actually charged, card utilization), Money Score, and the monthly trend. **Customize home** shows, hides and reorders every section. |
| **Accounts & net worth** | Balances come from your bank with each sync. Add anything the bank connection doesn't cover (student loans, car loan, cash, a 401k) by hand, set interest rates (banks rarely report them), and choose which accounts count toward net worth. |
| **Bills** | A **Bills** tab with a monthly calendar. Each bill shows as Paid, Due soon, Due today or Overdue; a bill counts as paid when a matching charge (or, for cards and loans, a payment to that account) shows up. Bills are suggested from charges that repeat every month and from due dates your bank reports. Phone reminders go out a few days before (you pick how many), on the due date, and the day after if it still looks unpaid, sent between 9am and 9pm your time, once each. |
| **Savings goals** | Set a target and optional date; progress comes from money you add by hand or from a savings account's balance, and the app shows how much to put away each month. Goals appear at the top of the Savings tab and on the home screen. |
| **Limits** | Set a monthly limit on any category. "Want" categories warn you at 80% (adjustable), and any category is flagged when it goes over. You see how much you can still spend per day, a pop-up (plus a phone/desktop notification if you allow it) when a new purchase crosses a line, and a "Limits this month" panel on the Overview. Going over costs Money Score points and adds the overage to the penalty jar. The app can't decline a card swipe (see below). |
| **Where to save** | The **Save** tab has a pie chart of estimated monthly savings by category and a 50/30/20 check. It also lists tips (interest paid, overspending, over-budget categories, many small purchases, alcohol share, recurring charges). It shows what the savings would grow to if invested. |
| **Accurate numbers** | Card payments and moves between your own accounts are found in two ways: by matching the same amount leaving one account and arriving in another, and by text such as "PAYMENT THANK YOU" or "EPAY". Refunds reduce spending. Interest is counted as spending under Debt. Each transaction shows *why* it was counted the way it was. The Overview puts the sheet-style total next to your real spending. |
| **Education & accountability** | 9 short lessons (budgeting, 50/30/20, credit cards, paying yourself first, emergency fund, subscriptions, debt payoff, investing). Each has video links and a quick quiz. You can save your own YouTube videos to watch in the app. The **Money Score** (0–100) takes points off for spending more than you earn, saving under 20%, paying interest or late fees, going over budget, and wants above 30%. You earn points back by saving and finishing lessons. Going over budget fills a **penalty jar**: the amount you should move into savings. |

## Run it with your own accounts

### 1. Pick a bank connection (you can use both)

| | **Plaid** | **SimpleFIN Bridge** |
|---|---|---|
| Cost | Free on Plaid's **Trial plan** (up to 10 connected banks, real data, includes Chase) | About **$15/year**, paid by you to SimpleFIN, up to 25 banks |
| Speed | New purchases within minutes (webhook) | About once a day |
| Interest rates, due dates | Yes, automatically (Liabilities) | No, enter rates yourself |
| Setup | Sign up at dashboard.plaid.com, copy client ID + secret into the server's settings | Sign up at bridge.simplefin.org, connect banks there, paste a Setup Token into the app |

### 2. Host it (so it keeps syncing when your laptop is closed)

**Render (easiest):** on render.com choose **New → Blueprint** and pick the repo. `render.yaml` sets everything up (about $7/month for an always-on instance plus a small disk that keeps your data). Enter your Plaid keys when asked. `APP_TOKEN` is generated for you and encrypts stored bank connections; leave it alone. Plaid's webhook URL is set automatically from the Render address. Open the site and create the owner account.

**Your own computer:** `npm run dev`, then open http://localhost:5173 and create your account. It only syncs while the computer is on.

### 3. Use it on your phone

Open your Render URL, sign in, and install it (see "Install it as an app"). Categories, limits and edits are stored on your server, so your phone and computer show the same thing.

**Security notes:** bank connections are encrypted on your server. Passwords are stored as scrypt hashes, and sessions use HttpOnly cookies. Repeated failed sign-ins are slowed down. Hosted mode refuses to start without an encryption key. The app only reads data; it can't move money.

**About hard limits:** the app watches and warns, but only your card issuer can decline a purchase. For a true hard stop, use your bank's card controls.

## Sharing with family & friends

Everyone signs in with their own email and password and sees **only their own** banks, budgets and settings.

- **The first account created on a server is the owner.** When you update from the single-user version, your existing data moves into it.
- **Invite people:** in Settings → Family & friends, either **add their email** (they then sign up at your address with Google or a password, no code needed), or **copy the invite link** and send it. Only people you add or invite can sign up. **Make a new link** stops the old one working.
- **Continue with Google** appears on the sign-in screen once `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. In Google Cloud Console, create an OAuth client of type *Web application* with the redirect URI `https://<your site>/api/auth/google/callback`. Sign in with Apple needs a paid Apple Developer account; it's planned for later.
- **Forgot password?** appears once `RESEND_API_KEY` and `EMAIL_FROM` are set: people get a one-hour reset link by email. Create a free account at resend.com, verify your domain there, and use an address on it for `EMAIL_FROM` (e.g. `Centsible <hello@yourdomain.com>`). Without it, the owner can set a temporary password from Settings. Sign-ins last 90 days, so closing the app or browser doesn't sign anyone out.
- **Bills on your calendar:** the Bills tab gives each person a private link that Google, Apple or Outlook Calendar subscribes to.
- **Forgotten password:** the owner can set a temporary one under Settings → People.
- **Leaving:** Settings → Delete account disconnects that person's banks at Plaid and erases their data.
- **Plaid's free Trial allows 10 bank connections in total for the whole app.** Settings shows how many are used. After that, people can use SimpleFIN, or you move to Plaid's paid plan.

Bank connections (Plaid access tokens, SimpleFIN URLs) are encrypted on the server with `DATA_KEY` (or, on servers set up earlier, `APP_TOKEN`). Never change or delete that value once it's set.

### Moving from your computer to Render without reconnecting banks

1. **On your computer:** open the app, go to Settings → Move your data, choose a passphrase, and click **Export my data**.
2. **On Render:** sign up (you'll be the owner), then go to Settings → Move your data. Enter the same passphrase, choose the file and click **Import**. Plaid is told to send updates to Render from now on.
3. **Delete the export file** and stop the app on your computer.

## Install it as an app

Open the app on your phone:
- **iPhone:** Safari → Share → **Add to Home Screen**.
- **Android:** Chrome → ⋮ → **Install app**.

Then go to Settings → **Turn on notifications** to get an alert when a purchase puts a category near or over its limit, even when the app is closed. (On iPhone this only works from the Home Screen app, iOS 16.4 or later.)

## Run it

```bash
npm install
cp .env.example .env     # optional: add Plaid keys for automatic bank sync
npm run dev              # web on http://localhost:5173, API on :8787
```

Without Plaid keys you can still click **Try with demo data**, import CSVs, and add cash purchases.

### Turning on automatic bank sync (Plaid)

1. Create a free account at https://dashboard.plaid.com and copy your **client ID** and **Sandbox secret** into `.env`.
2. Restart `npm run dev`, then go to **Accounts → Connect an account**. In Sandbox, pick any bank and log in with `user_good` / `pass_good`.
3. For your real accounts, request Production access in the Plaid dashboard and set `PLAID_ENV=production`.
4. *(Optional, for near-instant updates)* Expose the API with a tunnel such as `ngrok http 8787`. Set `PLAID_WEBHOOK_URL=https://<your-tunnel>/api/plaid/webhook`. Everyone still has to sign in, so nobody else can read your data.

**Link every credit card you use**, not just checking. When a card is linked, its payment from checking is skipped. When a card isn't linked, its payment counts as spending (under Debt) so the money isn't missed, but you lose the per-category detail.

### Importing your Google Sheets

In Sheets choose **File → Download → Microsoft Excel (.xlsx)**, then go to **Accounts → Import your monthly budget sheets**. You can pick several months at once. The importer understands the monthly budget layout:
- an **Income** block (label in column A, amount in column B)
- an expense table with **Date · Item · Quantity · Price · Category · Payment · Notes · Total** columns
- per-category tabs (Food, Takeout, ALC…) where the tab title is the category
- the **Category · Actual · Goal** summary table, whose goals become your starting budgets

Rows in the **Debt** category that name a card (e.g. "Capital one pay", "Discover Debt", "Chase Debt") are treated as credit card payments and not counted as spending again. Tuition, loans, and medical bills in Debt still count. A row without a date takes the date of the row above it. Re-importing a month replaces that month.

Bank CSV exports work too (**Import a bank CSV**). Import one file per account and set the account type (credit card vs. checking) so card payments can be matched.

## Online version (no install)

`npm run build:online` builds one self-contained `dist-online/index.html` that runs entirely in the browser. It supports sheet, CSV, and manual imports but has no bank sync. `node scripts/artifact-page.mjs` turns that file into page content for hosts that add their own `<html>` skeleton.

## Data & privacy

- Bank access tokens and synced transactions are stored only on your machine, in `data/db.json` (file mode 600, git-ignored).
- Imports, category fixes, budgets, and lesson progress are kept in your browser's local storage.
- Each person has their own account; the server keeps everyone's data separate and encrypts bank connections.
- The public **Privacy Policy** and **Terms of Service** are at `/privacy` and `/terms` (linked from sign-up and Settings). Before inviting people, set `CONTACT_EMAIL` (and later `OPERATOR`, your LLC's name) in `src/brand.ts`, and paste the `/privacy` link into the Plaid dashboard. They're plain-language drafts, not legal advice; have a lawyer look them over before you charge money.

## Development

```bash
npm test          # classifier / analytics / CSV unit tests (vitest)
npm run typecheck
npm run build && npm start   # production build served by the API server
```

Code map:
- `src/lib/classify.ts` — decides what is spending, a transfer, income, savings, a refund, or interest, and assigns categories
- `src/lib/analytics.ts` — monthly totals, suggested budgets, savings tips, recurring charges, Money Score
- `src/lib/budgetSheet.ts` — monthly budget .xlsx import
- `src/lib/csv.ts` — bank CSV import
- `src/lib/lessons.ts` — lesson content
- `server/` — Express + Plaid `/transactions/sync`, webhook, and live updates (server-sent events)
