import type { Bucket, CategoryId } from "./types";

export interface CategoryInfo {
  id: CategoryId;
  label: string;
  emoji: string;
  /** 50/30/20 rule bucket: needs (50%), wants (30%). */
  bucket: Bucket;
}

export const CATEGORIES: CategoryInfo[] = [
  { id: "rent", label: "Rent", emoji: "🏠", bucket: "needs" },
  { id: "debt", label: "Debt", emoji: "💳", bucket: "needs" },
  { id: "car", label: "Car", emoji: "🚗", bucket: "needs" },
  { id: "groceries", label: "Groceries", emoji: "🛒", bucket: "needs" },
  { id: "bills", label: "Bills & Utilities", emoji: "💡", bucket: "needs" },
  { id: "health", label: "Health", emoji: "🩺", bucket: "needs" },
  { id: "going_out", label: "Eating / Going Out", emoji: "🍔", bucket: "wants" },
  { id: "entertainment", label: "Entertainment / Personal", emoji: "🎮", bucket: "wants" },
  { id: "alcohol", label: "Alcohol", emoji: "🍺", bucket: "wants" },
  { id: "shopping", label: "Shopping", emoji: "🛍️", bucket: "wants" },
  { id: "subscriptions", label: "Subscriptions", emoji: "📺", bucket: "wants" },
  { id: "travel", label: "Travel", emoji: "✈️", bucket: "wants" },
  { id: "misc", label: "Misc", emoji: "📦", bucket: "wants" },
  { id: "income", label: "Income", emoji: "💵", bucket: "none" },
  { id: "transfer", label: "Transfer / Card Payment", emoji: "🔁", bucket: "none" },
  { id: "savings", label: "Savings", emoji: "🐖", bucket: "none" },
];

export const SPENDING_CATEGORIES = CATEGORIES.filter((c) => c.bucket !== "none");

const byId = new Map(CATEGORIES.map((c) => [c.id, c]));
export function categoryInfo(id: CategoryId): CategoryInfo {
  return byId.get(id) ?? byId.get("misc")!;
}

/** Map a free-text category label (e.g. from a Google Sheet) to one of ours. */
export function matchCategoryLabel(label: string | undefined): CategoryId | undefined {
  if (!label) return undefined;
  const l = label.trim().toLowerCase();
  if (!l) return undefined;
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
    [/transfer|credit card payment|card payment/, "transfer"],
    [/misc|other/, "misc"],
  ];
  for (const [re, id] of table) if (re.test(l)) return id;
  return undefined;
}
