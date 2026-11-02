/**
 * Receipt scanning: a photo goes to Claude, which reads the store, date, total, tax and items
 * and suggests one of the person's own categories. Needs ANTHROPIC_API_KEY on the server.
 */
import Anthropic from "@anthropic-ai/sdk";

/** Override with RECEIPT_MODEL (e.g. a cheaper model) without a code change. */
const MODEL = process.env.RECEIPT_MODEL || "claude-opus-5-5";
/** Scans per person per month (the owner isn't limited). */
export const RECEIPT_MONTHLY_LIMIT = Number(process.env.RECEIPT_FREE_LIMIT ?? 30);

export const receiptsEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

let client: Anthropic | undefined;
const api = () => (client ??= new Anthropic());

export interface ScannedReceipt {
  merchant: string;
  /** YYYY-MM-DD, or "" when the receipt doesn't show one. */
  date: string;
  total: number;
  tax: number;
  /** One of the category labels sent in, exactly. */
  category: string;
  payment: "cash" | "card" | "unknown";
  items: { name: string; amount: number }[];
  /** False when the photo isn't a readable receipt. */
  readable: boolean;
}

const SCHEMA = {
  type: "object",
  properties: {
    readable: { type: "boolean", description: "false if the image is not a receipt or the total can't be read" },
    merchant: { type: "string", description: "Store or business name as a person would say it, e.g. 'Target', not 'TARGET T-1234'" },
    date: { type: "string", description: "Purchase date as YYYY-MM-DD, or empty string if not shown" },
    total: { type: "number", description: "Final amount paid, including tax and tip" },
    tax: { type: "number", description: "Sales tax, or 0 if not shown" },
    category: { type: "string", description: "Exactly one of the allowed category labels" },
    payment: { type: "string", enum: ["cash", "card", "unknown"] },
    items: {
      type: "array",
      description: "Up to 20 line items as printed, with their price",
      items: {
        type: "object",
        properties: { name: { type: "string" }, amount: { type: "number" } },
        required: ["name", "amount"],
        additionalProperties: false,
      },
    },
  },
  required: ["readable", "merchant", "date", "total", "tax", "category", "payment", "items"],
  additionalProperties: false,
} as const;

export class ReceiptError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export async function scanReceipt(
  image: { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" },
  categories: string[],
  today: string,
): Promise<ScannedReceipt> {
  const allowed = categories.length ? categories : ["Misc"];
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await api().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system:
        "You read photos of purchase receipts for a personal budgeting app and return the purchase as JSON. " +
        "Use the amount actually paid as the total. If a date has no year, assume the most recent past date. " +
        `Today is ${today}. Pick the category from this list only: ${allowed.join(", ")}.`,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
            { type: "text", text: "Read this receipt." },
          ],
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new ReceiptError("Receipt scanning is busy. Try again in a minute.", 503);
    if (e instanceof Anthropic.BadRequestError) throw new ReceiptError("That photo couldn't be read. Try a clearer, closer picture.", 400);
    if (e instanceof Anthropic.AuthenticationError) throw new ReceiptError("Receipt scanning isn't set up correctly on the server.", 503);
    if (e instanceof Anthropic.APIError) throw new ReceiptError("Receipt scanning failed. Try again.", 502);
    throw e;
  }
  if (response.stop_reason === "refusal") throw new ReceiptError("That image couldn't be read as a receipt.", 422);

  const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text;
  let out: ScannedReceipt;
  try {
    out = JSON.parse(text ?? "");
  } catch {
    throw new ReceiptError("Couldn't read that receipt. Try another photo.", 422);
  }
  if (!out.readable || !(out.total > 0)) throw new ReceiptError("Couldn't find a total on that receipt. Try a clearer photo.", 422);
  return {
    ...out,
    merchant: out.merchant.trim() || "Receipt",
    date: /^\d{4}-\d{2}-\d{2}$/.test(out.date) ? out.date : today,
    category: allowed.includes(out.category) ? out.category : allowed[allowed.length - 1],
    items: (out.items ?? []).slice(0, 20),
  };
}
