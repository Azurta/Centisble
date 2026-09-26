export interface Lesson {
  id: string;
  title: string;
  minutes: number;
  summary: string;
  points: string[];
  /** YouTube search used for the "Watch videos" button. */
  videoQuery: string;
  quiz: { q: string; options: string[]; answer: number; why: string };
}

export const LESSONS: Lesson[] = [
  {
    id: "budget-basics",
    title: "Budgeting basics: give every dollar a job",
    minutes: 4,
    summary: "A budget isn't a restriction — it's a plan for your paycheck made before the money arrives.",
    points: [
      "List your take-home pay (after taxes), not your salary.",
      "Subtract fixed bills first: rent, car, insurance, minimum debt payments.",
      "Decide what's left for savings BEFORE deciding what's left for fun.",
      "Check in weekly — five minutes a week beats a two-hour panic at month end.",
    ],
    videoQuery: "how to make a budget for beginners young adults",
    quiz: {
      q: "What should you budget from?",
      options: ["Your yearly salary", "Your take-home pay", "Your credit limit"],
      answer: 1,
      why: "Take-home pay is what actually lands in your account after taxes and deductions.",
    },
  },
  {
    id: "50-30-20",
    title: "The 50/30/20 rule",
    minutes: 3,
    summary: "A simple split: 50% needs, 30% wants, 20% savings & extra debt payoff.",
    points: [
      "Needs: rent, groceries, car, insurance, utilities, minimum debt payments.",
      "Wants: going out, alcohol, shopping, subscriptions, travel.",
      "Savings: emergency fund, retirement, and paying debt beyond the minimum.",
      "If rent eats more than 50% alone, shrink wants first — not savings.",
    ],
    videoQuery: "50 30 20 budget rule explained",
    quiz: {
      q: "Which of these is a “want”?",
      options: ["Groceries", "Car insurance", "Bar tab on Friday"],
      answer: 2,
      why: "Groceries and insurance are needs. Nights out are wants — that's where cuts go first.",
    },
  },
  {
    id: "credit-cards",
    title: "Credit cards & points without the trap",
    minutes: 5,
    summary: "Using a card for points is smart only if you pay the full statement balance every month.",
    points: [
      "A card payment is NOT new spending — the purchases already happened. This app hides payments so you're never counted twice.",
      "Set autopay to the STATEMENT BALANCE, not the minimum.",
      "Typical card APR is 20–30%. $1,000 carried for a year costs ~$250 — far more than 2% points earn.",
      "Keep utilization under 30% of your limit to help your credit score.",
    ],
    videoQuery: "how credit cards work pay statement balance avoid interest",
    quiz: {
      q: "You pay the minimum on a $1,200 statement. What happens?",
      options: ["Nothing, you're fine", "You pay interest on the rest", "Your points double"],
      answer: 1,
      why: "Anything not paid by the due date starts charging interest — which is why the app penalizes interest charges.",
    },
  },
  {
    id: "pay-yourself-first",
    title: "Pay yourself first",
    minutes: 3,
    summary: "Move savings out on payday automatically, then spend what's left — not the other way around.",
    points: [
      "Set an automatic transfer to a separate high-yield savings account on payday.",
      "Start with 5% if 20% feels impossible; bump it 1% every raise.",
      "Keep savings at a different bank so it's not one tap away.",
    ],
    videoQuery: "pay yourself first automate savings",
    quiz: {
      q: "When is the best time to save?",
      options: ["Whatever is left at month end", "Right when you get paid", "Only after a bonus"],
      answer: 1,
      why: "Saving first means spending adapts to what's left, instead of savings being whatever survives.",
    },
  },
  {
    id: "emergency-fund",
    title: "Build an emergency fund",
    minutes: 4,
    summary: "An emergency fund is what stops a flat tire from becoming credit card debt.",
    points: [
      "Step 1: save $1,000 as fast as you can.",
      "Step 2: grow it to 3–6 months of essential expenses.",
      "Keep it in a high-yield savings account (FDIC-insured), not investments.",
    ],
    videoQuery: "how to build an emergency fund",
    quiz: {
      q: "Where should an emergency fund live?",
      options: ["High-yield savings account", "Crypto", "Checking account you use daily"],
      answer: 0,
      why: "It needs to be safe and available — but separate enough that you don't spend it.",
    },
  },
  {
    id: "latte-factor",
    title: "Small purchases, big totals",
    minutes: 3,
    summary: "$8 a day is $240 a month and ~$2,900 a year. Small, frequent buys are the easiest leak to fix.",
    points: [
      "Look at the count of purchases, not just the size.",
      "Pick one or two you really enjoy and keep those — cut the autopilot ones.",
      "Try a weekly “fun money” amount; when it's gone, it's gone.",
    ],
    videoQuery: "stop wasting money on small purchases tips",
    quiz: {
      q: "$12 a day on food & drinks out adds up to about how much a year?",
      options: ["$1,200", "$4,400", "$12,000"],
      answer: 1,
      why: "$12 × 365 ≈ $4,380.",
    },
  },
  {
    id: "subscriptions",
    title: "Subscription audit",
    minutes: 2,
    summary: "Recurring charges are designed to be forgotten. Audit them every 3 months.",
    points: [
      "Open the Insights tab — the app lists every charge that repeats each month.",
      "Cancel anything you haven't used in 30 days. Re-subscribe later if you miss it.",
      "Rotate streaming services instead of paying for all of them at once.",
    ],
    videoQuery: "how to cancel unused subscriptions save money",
    quiz: {
      q: "Best way to handle 4 streaming services?",
      options: ["Keep all of them", "Rotate one or two at a time", "Share passwords illegally"],
      answer: 1,
      why: "Rotating gives you the same shows for a fraction of the cost.",
    },
  },
  {
    id: "debt-payoff",
    title: "Paying off debt: avalanche vs snowball",
    minutes: 5,
    summary: "Always pay every minimum, then throw extra money at one debt at a time.",
    points: [
      "Avalanche: extra money to the highest interest rate first — saves the most.",
      "Snowball: extra to the smallest balance first — fastest wins, keeps you motivated.",
      "Either works; the one you'll actually stick with is the right one.",
    ],
    videoQuery: "debt avalanche vs snowball explained",
    quiz: {
      q: "Which method saves the most in interest?",
      options: ["Snowball", "Avalanche", "Paying minimums only"],
      answer: 1,
      why: "Targeting the highest rate first reduces total interest paid.",
    },
  },
  {
    id: "investing-101",
    title: "Investing 101: make saved money grow",
    minutes: 5,
    summary: "Once you have an emergency fund, invest for the long term — time matters more than amount.",
    points: [
      "Take any employer 401(k) match — it's free money.",
      "A Roth IRA with a low-cost index fund is a great first account.",
      "$200/month at 7% for 40 years grows to roughly $500,000.",
    ],
    videoQuery: "investing for beginners index funds roth ira",
    quiz: {
      q: "What's the biggest advantage young investors have?",
      options: ["Time", "Stock tips", "Luck"],
      answer: 0,
      why: "Compound growth needs time. Starting at 22 vs 32 can double the end result.",
    },
  },
];

export function youtubeSearchUrl(q: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

/** Extract a YouTube video id from any common YouTube URL form. */
export function youtubeId(url: string): string | undefined {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
  return m?.[1];
}
