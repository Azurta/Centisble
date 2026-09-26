export type AccountType = "checking" | "savings" | "credit" | "loan" | "cash";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Where the account came from: a linked bank, a CSV import, or demo data. */
  source: "plaid" | "import" | "demo";
}

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
}

export type CategoryId =
  | "debt"
  | "rent"
  | "car"
  | "going_out"
  | "entertainment"
  | "groceries"
  | "alcohol"
  | "shopping"
  | "subscriptions"
  | "bills"
  | "health"
  | "travel"
  | "misc"
  | "income"
  | "transfer"
  | "savings";

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
