import type { Bucket, CategoryId } from "./types";

export interface CategoryInfo {
  id: CategoryId;
  label: string;
  emoji: string;
  /** 50/30/20 rule bucket: needs (50%), wants (30%). */
  bucket: Bucket;
  /** Words that auto-sort a purchase into this category, e.g. ["starbucks", "dunkin"]. */
  keywords?: string[];
  /** Fixed chart color slot (0–7). Categories without one are grouped as "Other" in charts. */
  color?: number;
}

/** Always present and not editable: they describe money that isn't spending. */
export const SYSTEM_CATEGORIES: CategoryInfo[] = [
  { id: "income", label: "Income", emoji: "💵", bucket: "none" },
  { id: "transfer", label: "Transfer / Card Payment", emoji: "🔁", bucket: "none" },
  { id: "savings", label: "Savings", emoji: "🐖", bucket: "none" },
];

/** Fallback for anything that doesn't fit; can be renamed but not deleted. */
export const MISC_ID = "misc";

export const DEFAULT_CATEGORIES: CategoryInfo[] = [
  { id: "rent", label: "Rent", emoji: "🏠", bucket: "needs", color: 0 },
  { id: "debt", label: "Debt", emoji: "💳", bucket: "needs", color: 7 },
  { id: "car", label: "Car & Gas", emoji: "🚗", bucket: "needs", color: 5 },
  { id: "groceries", label: "Groceries", emoji: "🛒", bucket: "needs", color: 2 },
  { id: "bills", label: "Bills & Utilities", emoji: "💡", bucket: "needs" },
  { id: "going_out", label: "Eating / Going Out", emoji: "🍔", bucket: "wants", color: 1 },
  { id: "entertainment", label: "Entertainment", emoji: "🎮", bucket: "wants", color: 6 },
  { id: "alcohol", label: "Alcohol", emoji: "🍺", bucket: "wants", color: 4 },
  { id: "shopping", label: "Shopping", emoji: "🛍️", bucket: "wants", color: 3 },
  { id: "subscriptions", label: "Subscriptions", emoji: "📺", bucket: "wants" },
  { id: MISC_ID, label: "Misc", emoji: "📦", bucket: "wants" },
];

/* The active category list lives here so the classifier and analytics see the user's own categories. */
let current: CategoryInfo[] = DEFAULT_CATEGORIES;
let byId = new Map<string, CategoryInfo>();
index();

function index() {
  byId = new Map([...current, ...SYSTEM_CATEGORIES].map((c) => [c.id, c]));
}

export function setCategories(list: CategoryInfo[]) {
  const withMisc = list.some((c) => c.id === MISC_ID) ? list : [...list, DEFAULT_CATEGORIES.find((c) => c.id === MISC_ID)!];
  if (withMisc === current) return;
  current = withMisc;
  index();
}

/** Spending categories the user currently has, in their order. */
export function spendingCategories(): CategoryInfo[] {
  return current;
}

export function allCategories(): CategoryInfo[] {
  return [...current, ...SYSTEM_CATEGORIES];
}

export function hasCategory(id: CategoryId): boolean {
  return byId.has(id);
}

/** A category id that exists right now — deleted or unknown categories fall back to Misc. */
export function resolveCategory(id: CategoryId | undefined): CategoryId {
  return id && byId.has(id) ? id : MISC_ID;
}

export function categoryInfo(id: CategoryId): CategoryInfo {
  return byId.get(id) ?? byId.get(MISC_ID)!;
}

/** Id for a new category, e.g. "Coffee Runs" → "coffee_runs" (made unique against existing ids). */
export function newCategoryId(label: string, existing: CategoryInfo[]): CategoryId {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "category";
  const taken = new Set([...existing, ...SYSTEM_CATEGORIES].map((c) => c.id));
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}_${i}`;
  return id;
}

/** The first chart color no other category is using, if any are left. */
export function freeColorSlot(list: CategoryInfo[]): number | undefined {
  const used = new Set(list.map((c) => c.color));
  for (let i = 0; i < 8; i++) if (!used.has(i)) return i;
  return undefined;
}

/** Map a free-text category label (e.g. from a spreadsheet) to one of ours. */
export function matchCategoryLabel(label: string | undefined): CategoryId | undefined {
  if (!label) return undefined;
  const l = label.trim().toLowerCase();
  if (!l) return undefined;
  const own = current.find((c) => c.label.toLowerCase() === l || c.id === l);
  if (own) return own.id;
  const table: [RegExp, CategoryId][] = [
    [/rent|mortgage|housing/, "rent"],
    [/debt|dept|loan|student|tuition|credit card/, "debt"],
    [/\bcar\b|gas|fuel|auto|transport/, "car"],
    [/going out|restaurant|dining|eat(ing)? out|takeout|take out/, "going_out"],
    [/grocer|food|supermarket/, "groceries"],
    [/alcohol|\balc\b|liquor|beer|wine|\bbar\b/, "alcohol"],
    [/entertain|personal|fun|game|hobby/, "entertainment"],
    [/shop|cloth|amazon|apt\b|apartment|furniture|home/, "shopping"],
    [/sub(scription)?s?\b|streaming|netflix|spotify/, "subscriptions"],
    [/bill|utilit|phone|internet|electric/, "bills"],
    [/health|medical|doctor|pharm|gym/, "health"],
    [/travel|flight|hotel/, "travel"],
    [/income|paycheck|salary|pay\b/, "income"],
    [/saving|invest/, "savings"],
    [/transfer|card payment/, "transfer"],
    [/misc|other/, "misc"],
  ];
  for (const [re, id] of table) if (re.test(l)) return id;
  return undefined;
}
