export type AccountType = "checking" | "savings" | "credit" | "loan" | "cash";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Where the account came from: a linked bank, a CSV import, one you typed in, or demo data. */
  source: "plaid" | "import" | "manual" | "demo";
  /**
   * Current balance as a positive number: money you have for checking/savings/cash,
   * money you owe for credit cards and loans.
   */
  balance?: number;
  /** Spendable right now (checking) or credit still available (cards), when the bank reports it. */
  available?: number;
  creditLimit?: number;
  /** Interest rate, % per year (APR). Banks rarely report it, so you can enter it. */
  apr?: number;
  /** When the balance was last updated (ISO date-time). */
  balanceAsOf?: string;
  /** Hide from net worth and the home screen. */
  hidden?: boolean;
  /** Debts, from the bank when available: minimum payment, next due date (YYYY-MM-DD), last statement balance. */
  minPayment?: number;
  nextDue?: string;
  statementBalance?: number;
  /** Debts: the monthly amount you plan to pay, for the payoff plan. */
  plannedPayment?: number;
  /** Debts: where you pay it (your lender's website or app link). */
  payUrl?: string;
}

/** Your edits to accounts that come from a bank (name, APR, hidden) — kept separate so a sync doesn't overwrite them. */
export type AccountEdits = Record<string, Partial<Pick<Account, "name" | "apr" | "hidden" | "type" | "plannedPayment" | "payUrl">>>;

/**
 * How a transaction affects your real money.
 * - expense:  money actually spent (a purchase, a bill, a loan payment)
 * - interest: interest or card fees — real cost, counted as spending
 * - refund:   money returned from a merchant — reduces spending
 * - income:   paychecks and other money coming in
 * - transfer: money moving between your own accounts (e.g. paying off a credit card) — NOT spending
 * - savings:  money moved into savings/investments — not spending, counts toward your savings rate
 */
export type TxKind = "expense" | "interest" | "refund" | "income" | "transfer" | "savings";

export interface Transaction {
  id: string;
  accountId: string;
  date: string; // YYYY-MM-DD
  description: string;
  merchant?: string;
  /** Positive = money left the account, negative = money came in (Plaid's convention). */
  amount: number;
  pending?: boolean;
  /** Bank-provided category hints (e.g. Plaid personal_finance_category). */
  bankCategory?: { primary?: string; detailed?: string };
  /** Category label from an imported spreadsheet, if any. */
  importedCategory?: string;
  /** How a budget-sheet row was classified at import (sheets already say what each row is). */
  sheetKind?: TxKind;
  /** Card / cash / account the purchase was paid with, as written in a budget sheet. */
  paidWith?: string;
}

export interface ClassifiedTransaction extends Transaction {
  kind: TxKind;
  category: CategoryId;
  /** Why the classifier chose this kind; shown in the UI so numbers are explainable. */
  reason?: string;
  accountType: AccountType;
  /** A payment to a credit card that isn't linked (e.g. "Discover"): counted as spending until that card is linked. */
  unlinkedCard?: string;
  /** Cash taken out at an ATM ("to-wallet") or deposited at the bank ("from-wallet"), when you track a cash wallet. */
  cashMove?: "to-wallet" | "from-wallet";
}

/** Built-in ids ("rent", "going_out", …) plus any category the user creates. */
export type CategoryId = string;

export type Bucket = "needs" | "wants" | "none";

export interface Overrides {
  /** Per-transaction manual category. */
  category: Record<string, CategoryId>;
  /** Per-transaction manual kind (e.g. mark something as a transfer). */
  kind: Record<string, TxKind>;
  /** Learned rules: lower-cased merchant/description -> category. */
  merchantRules: Record<string, CategoryId>;
}

export type Budgets = Partial<Record<CategoryId, number>>;
