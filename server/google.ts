/**
 * "Continue with Google" (OpenID Connect, authorization-code flow).
 * Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from Google Cloud, with this redirect URI registered:
 *   <your site>/api/auth/google/callback
 */
import type { Request, Response } from "express";
import { randomToken } from "./crypto";

export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const AUTH_URL = process.env.GOOGLE_AUTH_URL ?? "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com/token";
const STATE_COOKIE = "cs_google";

/** The public address of this site: PUBLIC_URL (custom domain), Render's URL, or the request's own host. */
export function publicOrigin(req: Request): string {
  const configured = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
  if (configured) return configured.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

const redirectUri = (req: Request) => `${publicOrigin(req)}/api/auth/google/callback`;

function cookie(res: Response, value: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  // Lax so the cookie comes back on Google's top-level redirect to us.
  res.append("Set-Cookie", `${STATE_COOKIE}=${encodeURIComponent(value)}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

/** Step 1: send the browser to Google. The invite code (if any) rides along in our state cookie. */
export function startGoogle(req: Request, res: Response) {
  const state = randomToken(16);
  const invite = typeof req.query.invite === "string" ? req.query.invite : "";
  cookie(res, JSON.stringify({ state, invite }), 600);
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  }).toString();
  res.redirect(url.toString());
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name?: string;
}

/** Step 2: Google sends the browser back with a code; trade it for the person's verified identity. */
export async function finishGoogle(req: Request, res: Response): Promise<{ identity: GoogleIdentity; invite?: string }> {
  const raw = (req.headers.cookie ?? "").split(";").map((c) => c.trim()).find((c) => c.startsWith(`${STATE_COOKIE}=`));
  cookie(res, "", 0);
  let saved: { state?: string; invite?: string } = {};
  try {
    saved = JSON.parse(decodeURIComponent(raw?.slice(STATE_COOKIE.length + 1) ?? "{}"));
  } catch {
    /* treated as missing */
  }
  if (!saved.state || saved.state !== req.query.state) throw new Error("Sign-in expired. Please try again.");
  if (typeof req.query.code !== "string") throw new Error(String(req.query.error ?? "Google sign-in was cancelled."));

  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: req.query.code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(req),
      grant_type: "authorization_code",
    }),
  });
  const body = (await r.json().catch(() => ({}))) as { id_token?: string; error_description?: string; error?: string };
  if (!r.ok || !body.id_token) throw new Error(body.error_description ?? body.error ?? "Google didn't confirm the sign-in.");
  // The ID token came straight from Google's token endpoint over HTTPS, authenticated with our client secret,
  // so its contents can be trusted without re-checking the signature (OpenID Connect Core §3.1.3.7).
  const claims = JSON.parse(Buffer.from(body.id_token.split(".")[1], "base64url").toString("utf8")) as {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    aud?: string;
  };
  if (claims.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error("Google sign-in was meant for a different app.");
  if (!claims.email || !claims.email_verified) throw new Error("Your Google account's email isn't verified.");
  return { identity: { sub: claims.sub, email: claims.email, name: claims.name }, invite: saved.invite || undefined };
}
