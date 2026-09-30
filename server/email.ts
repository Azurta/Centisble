/**
 * Sending email (password-reset links) through Resend's API: https://resend.com (free for 3,000 emails a month).
 * Set RESEND_API_KEY and EMAIL_FROM, e.g. EMAIL_FROM="Centsible <hello@yourdomain.com>" once your domain is verified there.
 */
const API = process.env.RESEND_API_URL ?? "https://api.resend.com/emails";

export const emailEnabled = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export async function sendEmail(to: string, subject: string, text: string, html: string): Promise<void> {
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text, html }),
  });
  if (!res.ok) throw new Error(`Email failed (${res.status}): ${await res.text().catch(() => "")}`);
}
