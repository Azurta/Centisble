# Azurta — honest, automatic budgeting

Azurta tracks your spending automatically, sorts it into categories, shows where you could save, and coaches you with lessons and a Money Score.

It fixes the main problem with a hand-built budget sheet: **card payments counted as spending**. If you put everything on a credit card for points and then pay the card from checking, adding up every withdrawal counts each purchase twice. Azurta counts a purchase once, when you swipe the card. The card payment is marked "Not spending". Only **interest and fees** are added on top.

## Features

| What you asked for | How it works |
|---|---|
| **Automatic** | Link checking, savings, and credit cards through [Plaid](https://plaid.com). New purchases show up on their own. With a webhook URL set, they arrive within minutes of a swipe. Without one, the server checks every 15 minutes. The page updates live. |
| **Categories** | Debt, Rent, Car, Going Out, Groceries, Alcohol, Shopping, Subscriptions, Bills, Health, Travel, Misc. Merchants are sorted by keyword rules and the bank's own category data. You can fix any transaction. Tick "Remember category for merchant" and every future purchase from that merchant is sorted the same way. |
| **Where to save** | The **Save** tab has a pie chart of estimated monthly savings by category and a 50/30/20 check. It also lists tips (interest paid, overspending, over-budget categories, many small purchases, alcohol share, recurring charges). It shows what the savings would grow to if invested. |
| **Accurate numbers** | Card payments and moves between your own accounts are found in two ways: by matching the same amount leaving one account and arriving in another, and by text such as "PAYMENT THANK YOU" or "EPAY". Refunds reduce spending. Interest is counted as spending under Debt. Each transaction shows *why* it was counted the way it was. The Overview puts the sheet-style total next to your real spending. |
| **Education & accountability** | 9 short lessons (budgeting, 50/30/20, credit cards, paying yourself first, emergency fund, subscriptions, debt payoff, investing). Each has video links and a quick quiz. You can save your own YouTube videos to watch in the app. The **Money Score** (0–100) takes points off for spending more than you earn, saving under 20%, paying interest or late fees, going over budget, and wants above 30%. You earn points back by saving and finishing lessons. Going over budget fills a **penalty jar**: the amount you should move into savings. |

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
4. *(Optional, for near-instant updates)* Expose the API with a tunnel such as `ngrok http 8787`. Set `PLAID_WEBHOOK_URL=https://<your-tunnel>/api/plaid/webhook` **and** an `APP_TOKEN` so nobody else can read your data. Then link your accounts again.

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
- The server has no user accounts. It is built to run for one person on your own computer. Set `APP_TOKEN` before exposing it to the internet.

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
