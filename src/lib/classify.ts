import { matchCategoryLabel } from "./categories";
import type {
  Account,
  AccountType,
  CategoryId,
  ClassifiedTransaction,
  Overrides,
  Transaction,
  TxKind,
} from "./types";

/* ------------------------------------------------------------------ */
/* Keyword rules                                                       */
/* ------------------------------------------------------------------ */

const CARD_PAYMENT =
  /(payment\s*(-|–)?\s*thank\s*you|autopay|auto\s*pay|credit\s*c(ar)?d\s*(pmt|payment|pymt|epay)|card\s*payment|e-?payment|online\s*(pmt|payment)|mobile\s*payment|crd\s*epay|applecard\s*gsbank|amex\s*epayment|discover\s*e-?payment|capital\s*one.*(pymt|payment)|chase\s*credit\s*crd|citi\s*(card\s*)?(autopay|payment)|barclaycard\s*payment|bank\s*of\s*america\s*payment)/i;
const SAVINGS_TRANSFER = /(transfer|xfer|trnsfr).*(saving|sav\b|hysa|brokerage|robinhood|fidelity|vanguard|schwab|acorns|betterment|wealthfront|roth|ira\b|401k)|(saving|acorns|betterment|wealthfront).*(transfer|deposit)/i;
const GENERIC_TRANSFER = /(online\s*transfer|internal\s*transfer|transfer\s*(to|from)\s*(chk|checking|sav|share)|funds\s*transfer|xfer)/i;
const INTEREST = /(interest\s*charge|purchase\s*interest|finance\s*charge|interest\s*charged|cash\s*advance\s*interest)/i;
const FEES = /(late\s*fee|annual\s*fee|overdraft|nsf\s*fee|returned\s*payment\s*fee|foreign\s*transaction\s*fee|cash\s*advance\s*fee|over\s*limit\s*fee)/i;
const REFUND = /(refund|return|reversal|credit\s*adjustment|chargeback|cashback\s*redemption|statement\s*credit)/i;
const INCOME = /(payroll|direct\s*dep|paycheck|salary|adp\b|gusto|zelle\s*from|venmo\s*cashout|irs\s*treas|tax\s*refund|dividend|interest\s*paid|interest\s*earned)/i;

const CATEGORY_RULES: [RegExp, CategoryId][] = [
  [/rent|apartment|property\s*mgmt|leasing|zillow\s*rent|avail\s*rent|mortgage/i, "rent"],
  [/student\s*loan|navient|nelnet|sallie\s*mae|mohela|aidvantage|great\s*lakes|affirm|klarna|afterpay|sofi\s*loan|upstart|personal\s*loan/i, "debt"],
  [/liquor|wine|spirits|brewery|brewing|beer|bevmo|total\s*wine|taproom|pub\b|tavern|saloon|\bbar\b|lounge|drizly/i, "alcohol"],
  [/shell|chevron|exxon|mobil|bp\b|arco|valero|sunoco|speedway|circle\s*k|wawa|sheetz|76\b|gas\s*station|fuel|auto\s*loan|car\s*payment|toyota\s*financial|honda\s*financial|ally\s*auto|geico|progressive|state\s*farm|allstate|jiffy|autozone|o'?reilly|car\s*wash|parking|dmv|tesla\s*supercharger|uber\s*trip|lyft/i, "car"],
  [/netflix|spotify|hulu|disney\+?|hbo|max\.com|youtube\s*premium|apple\.com\/bill|icloud|amazon\s*prime|paramount|peacock|audible|xbox|playstation|nintendo|patreon|chatgpt|openai|adobe|dropbox|onlyfans|twitch/i, "subscriptions"],
  [/whole\s*foods|trader\s*joe|kroger|safeway|aldi|publix|wegmans|h-?e-?b\b|food\s*lion|giant|stop\s*&?\s*shop|albertsons|sprouts|winco|meijer|costco|sam'?s\s*club|grocery|market|supermarket|instacart|walmart\s*grocery/i, "groceries"],
  [/mcdonald|starbucks|chipotle|taco\s*bell|wendy|burger|subway|domino|pizza|doordash|uber\s*eats|grubhub|postmates|chick-?fil|panera|dunkin|kfc|popeyes|restaurant|cafe|coffee|grill|sushi|diner|bistro|kitchen|ticketmaster|stubhub|cinema|amc\s*theat|regal|bowling|concert|eventbrite/i, "going_out"],
  [/amazon|amzn|target|walmart|best\s*buy|nike|adidas|h&m|zara|old\s*navy|gap\b|shein|temu|etsy|ebay|macy|nordstrom|tj\s*maxx|marshalls|ross\s*stores|ulta|sephora|apple\s*store|home\s*depot|lowe'?s|ikea|wayfair/i, "shopping"],
  [/verizon|at&t|t-?mobile|comcast|xfinity|spectrum|electric|energy|power|water|utility|pg&e|duke\s*energy|con\s*ed|internet|insurance/i, "bills"],
  [/cvs|walgreens|rite\s*aid|pharmacy|doctor|dental|clinic|hospital|medical|urgent\s*care|planet\s*fitness|gym|la\s*fitness|equinox|optometr/i, "health"],
  [/airline|delta\s*air|united\s*air|american\s*air|southwest|jetblue|spirit\s*air|frontier|airbnb|hotel|marriott|hilton|hyatt|expedia|booking\.com|amtrak|greyhound/i, "travel"],
];

/** Map Plaid personal_finance_category.primary -> our category. */
const BANK_PRIMARY: Record<string, CategoryId> = {
  RENT_AND_UTILITIES: "bills",
  FOOD_AND_DRINK: "going_out",
  GENERAL_MERCHANDISE: "shopping",
  TRANSPORTATION: "car",
  TRAVEL: "travel",
  MEDICAL: "health",
  PERSONAL_CARE: "health",
  ENTERTAINMENT: "going_out",
  LOAN_PAYMENTS: "debt",
  GENERAL_SERVICES: "misc",
  HOME_IMPROVEMENT: "shopping",
  GOVERNMENT_AND_NON_PROFIT: "misc",
  BANK_FEES: "debt",
};
const BANK_DETAILED: Record<string, CategoryId> = {
  RENT_AND_UTILITIES_RENT: "rent",
  FOOD_AND_DRINK_GROCERIES: "groceries",
  FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR: "alcohol",
  LOAN_PAYMENTS_CAR_PAYMENT: "car",
  TRANSPORTATION_GAS: "car",
  TRANSPORTATION_PARKING: "car",
  GENERAL_SERVICES_INSURANCE: "bills",
  GENERAL_SERVICES_AUTOMOTIVE: "car",
  ENTERTAINMENT_TV_AND_MOVIES: "subscriptions",
  ENTERTAINMENT_MUSIC_AND_AUDIO: "subscriptions",
};

export function merchantKey(t: Pick<Transaction, "merchant" | "description">): string {
  return (t.merchant || t.description)
    .toLowerCase()
    .replace(/#?\d{3,}/g, "") // store numbers, reference ids
    .replace(/[^a-z&' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function guessCategory(t: Transaction, overrides?: Overrides): CategoryId {
  if (overrides?.category[t.id]) return overrides.category[t.id];
  const key = merchantKey(t);
  if (overrides?.merchantRules[key]) return overrides.merchantRules[key];
  const imported = matchCategoryLabel(t.importedCategory);
  if (imported && !["income", "transfer", "savings"].includes(imported)) return imported;
  const text = `${t.merchant ?? ""} ${t.description}`;
  for (const [re, id] of CATEGORY_RULES) if (re.test(text)) return id;
  const d = t.bankCategory?.detailed;
  if (d && BANK_DETAILED[d]) return BANK_DETAILED[d];
  const p = t.bankCategory?.primary;
  if (p && BANK_PRIMARY[p]) return BANK_PRIMARY[p];
  return "misc";
}

/* ------------------------------------------------------------------ */
/* Transfer pairing                                                    */
/* ------------------------------------------------------------------ */

const DAY = 86_400_000;
const isAsset = (t: AccountType) => t === "checking" || t === "savings" || t === "cash";

/**
 * Find money moving between two of your own accounts: the same amount leaving one
 * account and arriving in another within a few days. Returns txId -> partner txId.
 */
export function pairTransfers(txs: Transaction[], accountType: (id: string) => AccountType): Map<string, string> {
  const pairs = new Map<string, string>();
  const outs = txs.filter((t) => t.amount > 0 && isAsset(accountType(t.accountId)));
  const ins = txs.filter((t) => t.amount < 0);
  // Group inflows by cents for fast lookup.
  const inByCents = new Map<number, Transaction[]>();
  for (const t of ins) {
    const c = Math.round(-t.amount * 100);
    (inByCents.get(c) ?? inByCents.set(c, []).get(c)!).push(t);
  }
  for (const out of outs.sort((a, b) => a.date.localeCompare(b.date))) {
    if (pairs.has(out.id)) continue;
    const candidates = inByCents.get(Math.round(out.amount * 100)) ?? [];
    const outType = accountType(out.accountId);
    const outTime = Date.parse(out.date);
    let best: Transaction | undefined;
    let bestGap = Infinity;
    for (const inc of candidates) {
      if (pairs.has(inc.id) || inc.accountId === out.accountId) continue;
      const inType = accountType(inc.accountId);
      // Paying a card/loan, or moving money between checking & savings.
      const plausible =
        inType === "credit" || inType === "loan" || (isAsset(inType) && outType !== inType) ||
        (isAsset(inType) && (GENERIC_TRANSFER.test(out.description) || GENERIC_TRANSFER.test(inc.description)));
      if (!plausible) continue;
      if (inType === "credit" && REFUND.test(inc.description)) continue; // a store refund, not a payment
      const gap = Math.abs(Date.parse(inc.date) - outTime);
      if (gap <= 5 * DAY && gap < bestGap) {
        best = inc;
        bestGap = gap;
      }
    }
    if (best) {
      pairs.set(out.id, best.id);
      pairs.set(best.id, out.id);
    }
  }
  return pairs;
}

/* ------------------------------------------------------------------ */
/* Main classifier                                                     */
/* ------------------------------------------------------------------ */

export function classifyAll(
  txs: Transaction[],
  accounts: Account[],
  overrides: Overrides = { category: {}, kind: {}, merchantRules: {} },
): ClassifiedTransaction[] {
  const typeById = new Map(accounts.map((a) => [a.id, a.type]));
  const accountType = (id: string): AccountType => typeById.get(id) ?? "checking";
  const hasCreditAccount = accounts.some((a) => a.type === "credit");
  const pairs = pairTransfers(txs, accountType);
  const byId = new Map(txs.map((t) => [t.id, t]));

  return txs.map((t) => {
    const type = accountType(t.accountId);
    const text = `${t.merchant ?? ""} ${t.description}`;
    const bp = t.bankCategory?.primary ?? "";
    const bd = t.bankCategory?.detailed ?? "";
    const imported = matchCategoryLabel(t.importedCategory);

    const result = (kind: TxKind, reason: string, category?: CategoryId): ClassifiedTransaction => {
      const cat: CategoryId =
        kind === "income" ? "income"
        : kind === "transfer" ? "transfer"
        : kind === "savings" ? "savings"
        : kind === "interest" ? (overrides.category[t.id] ?? "debt")
        : category ?? guessCategory(t, overrides);
      return { ...t, kind, category: cat, reason, accountType: type };
    };

    // 1. The user always wins.
    const manualKind = overrides.kind[t.id];
    if (manualKind) return result(manualKind, "Set by you");
    const manualCat = overrides.category[t.id];
    if (manualCat === "transfer") return result("transfer", "Set by you");
    if (manualCat === "income") return result("income", "Set by you");
    if (manualCat === "savings") return result("savings", "Set by you");

    // 2. Budget-sheet rows were already sorted by the importer.
    if (t.sheetKind) {
      const why: Record<TxKind, string> = {
        transfer: "Credit card payment — the purchases are already listed in your sheet",
        savings: "Moved to savings",
        income: "Income",
        expense: "Purchase",
        interest: "Interest / fee",
        refund: "Refund",
      };
      return result(t.sheetKind, why[t.sheetKind]);
    }

    // 3. Interest & fees are real costs — the only time a credit card "costs extra".
    if (t.amount > 0 && (INTEREST.test(text) || bd === "BANK_FEES_INTEREST_CHARGE"))
      return result("interest", "Interest charge — this is money lost, not spent on anything");
    if (t.amount > 0 && (FEES.test(text) || bp === "BANK_FEES"))
      return result("interest", "Bank / card fee");

    // 4. Matched transfer between two of your accounts.
    const partnerId = pairs.get(t.id);
    if (partnerId) {
      const partner = byId.get(partnerId)!;
      const partnerType = accountType(partner.accountId);
      if (partnerType === "credit" || type === "credit")
        return result("transfer", "Credit card payment — the purchases were already counted on the card");
      if (partnerType === "loan" && t.amount > 0)
        return result("expense", "Loan payment", guessLoanCategory(t, overrides));
      if (type === "loan") return result("transfer", "Payment received by loan account");
      // Money between checking and savings: count the non-savings side as saving / un-saving.
      if (partnerType === "savings" && type !== "savings")
        return result("savings", t.amount > 0 ? "Moved to savings" : "Pulled from savings");
      return result("transfer", "Moved between your own accounts");
    }

    // 5. Unpaired transfer signals.
    const looksLikeCardPayment = CARD_PAYMENT.test(text) || bd === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT";
    if (type === "credit" && t.amount < 0 && (looksLikeCardPayment || bp === "TRANSFER_IN" || imported === "transfer"))
      return result("transfer", "Credit card payment received — not income");
    if (t.amount > 0 && looksLikeCardPayment) {
      if (hasCreditAccount)
        return result("transfer", "Credit card payment — the purchases were already counted on the card");
      // No card linked: the payment is the only record of that spending, so count it once.
      return result("expense", "Card payment counted as spending because the card itself isn't linked yet", "debt");
    }
    if (t.amount > 0 && (SAVINGS_TRANSFER.test(text) || bd.startsWith("TRANSFER_OUT_SAVINGS") || bd === "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS" || imported === "savings"))
      return result("savings", "Moved to savings / investing");
    if (type === "savings") return result("transfer", "Savings account activity");
    if (bp === "TRANSFER_IN" || bp === "TRANSFER_OUT" || GENERIC_TRANSFER.test(text) || imported === "transfer")
      return result("transfer", "Transfer between accounts");

    // 6. Loans.
    if (type === "loan") return t.amount > 0 ? result("interest", "Loan interest") : result("transfer", "Loan payment received");

    // 7. Money in.
    if (t.amount < 0) {
      if (REFUND.test(text) || type === "credit") return result("refund", "Refund / credit back");
      if (imported === "income" || bp === "INCOME" || INCOME.test(text)) return result("income", "Income");
      return result("income", "Money received");
    }

    // 8. Everything else is a real purchase.
    if (imported === "income") return result("income", "Marked as income in your sheet");
    return result("expense", "Purchase");
  });
}

function guessLoanCategory(t: Transaction, overrides: Overrides): CategoryId {
  const c = guessCategory(t, overrides);
  return c === "car" ? "car" : c === "rent" ? "rent" : "debt";
}
