import { useEffect, useState, type ReactNode } from "react";
import { api, type Me } from "../api";
import { APP_NAME } from "../brand";
import { STATIC } from "../useAppData";

/** Everything this app keeps in the browser starts with this prefix. */
const LOCAL_PREFIX = "azurta.";
const USER_KEY = "centsible.userId";

/** Wipe this browser's copy of app data (used when someone else signs in on the same device, or on sign-out). */
export function clearLocalData() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(LOCAL_PREFIX)) localStorage.removeItem(k);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* storage unavailable */
  }
}

export async function signOut() {
  await api.logout().catch(() => {});
  clearLocalData();
  window.location.assign("/");
}

/**
 * Shows sign-in / sign-up until there's a session, then renders the app.
 * With no server (the online preview, or the server not running) the app runs on this device only.
 */
export function AuthGate({ children }: { children: (me: Me | null) => ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(STATIC ? null : undefined);
  const [offline, setOffline] = useState(false);

  const load = () =>
    api
      .me()
      .then((m) => {
        if (m.user) {
          // A different person than last time on this device: start from a clean slate so nothing carries over.
          let prev: string | null = null;
          try {
            prev = localStorage.getItem(USER_KEY);
          } catch {
            /* ignore */
          }
          if (prev !== m.user.id && (prev || m.user.role !== "owner")) clearLocalData();
          try {
            localStorage.setItem(USER_KEY, m.user.id);
          } catch {
            /* ignore */
          }
        }
        setMe(m);
      })
      .catch(() => {
        setOffline(true);
        setMe(null);
      });

  useEffect(() => {
    if (!STATIC) load();
  }, []);

  if (me === undefined) return <div className="shell"><div className="app muted">Loading…</div></div>;
  if (STATIC || offline) return <>{children(null)}</>;
  if (!me?.user) return <AuthScreen firstRun={Boolean(me?.firstRun)} google={Boolean(me?.google)} email={Boolean(me?.email)} onDone={load} />;
  return <>{children(me)}</>;
}

function AuthScreen({ firstRun, google, email: canEmail, onDone }: { firstRun: boolean; google: boolean; email: boolean; onDone: () => void }) {
  const params = new URLSearchParams(window.location.search);
  const invite = params.get("invite") ?? "";
  const resetToken = params.get("reset") ?? "";
  const returnedError = params.get("signin_error");
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "reset">(resetToken ? "reset" : firstRun || invite ? "signup" : "signin");
  const [sent, setSent] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState(invite);
  const [error, setError] = useState<string | null>(returnedError);
  useEffect(() => {
    if (returnedError) window.history.replaceState(null, "", invite ? `/?invite=${encodeURIComponent(invite)}` : "/");
  }, [returnedError, invite]);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "forgot") {
        await api.forgot(email);
        setSent(true);
        return;
      }
      if (mode === "reset") await api.resetPassword(resetToken, password);
      else if (mode === "signup") await api.signup({ name, email, password, invite: code || undefined });
      else await api.login(email, password);
      if (invite || resetToken) window.history.replaceState(null, "", "/");
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner"><div className="brand">{APP_NAME}</div></div>
      </header>
      <div className="app">
        <form className="card unlock" onSubmit={submit}>
          {mode === "forgot" ? (
            <>
              <h1>Reset your password</h1>
              {sent ? (
                <p className="small">
                  If <strong>{email}</strong> has a {APP_NAME} account, a reset link is on its way. It works for one hour; check your spam
                  folder if you don't see it in a few minutes.
                </p>
              ) : (
                <>
                  <p className="muted small">Enter the email you signed up with and we'll send you a link to choose a new password.</p>
                  <label className="field">Email<input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
                  {error && <p className="small bad">{error}</p>}
                  <button className="btn" disabled={busy}>{busy ? "One moment…" : "Send reset link"}</button>
                </>
              )}
              <p className="small">
                <button type="button" className="link" onClick={() => { setMode("signin"); setSent(false); setError(null); }}>Back to sign in</button>
              </p>
            </>
          ) : mode === "reset" ? (
            <>
              <h1>Choose a new password</h1>
              <p className="muted small">After this you'll be signed in, and signed out on your other devices.</p>
              <label className="field">
                New password
                <input id="auth-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
                <span className="muted small">At least 8 characters.</span>
              </label>
              {error && <p className="small bad">{error}</p>}
              <button className="btn" disabled={busy}>{busy ? "One moment…" : "Save and sign in"}</button>
              <p className="small">
                <button type="button" className="link" onClick={() => { window.history.replaceState(null, "", "/"); setMode("signin"); setError(null); }}>Back to sign in</button>
              </p>
            </>
          ) : (
            <>
              <h1>{mode === "signin" ? `Sign in to ${APP_NAME}` : firstRun ? "Create the owner account" : `Join ${APP_NAME}`}</h1>
              <p className="muted small">
                {mode === "signin"
                  ? "Your banks and budgets are private to your account."
                  : firstRun
                    ? "You're the first person here, so you'll be the owner: you can invite family and see how many bank connections are left."
                    : "Each person gets their own private budget. Your data isn't visible to anyone else."}
              </p>
              {google && (
                <>
                  <a className="btn google" href={`/api/auth/google/start${code ? `?invite=${encodeURIComponent(code)}` : ""}`}>
                    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden>
                      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z" />
                      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z" />
                    </svg>
                    Continue with Google
                  </a>
                  <div className="or"><span>or use email</span></div>
                </>
              )}
              {mode === "signup" && (
                <label className="field">First name<input id="auth-name" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} /></label>
              )}
              <label className="field">Email<input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <label className="field">
                Password
                <input
                  id="auth-password"
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  minLength={mode === "signup" ? 8 : undefined}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {mode === "signup" && <span className="muted small">At least 8 characters.</span>}
              </label>
              {mode === "signup" && !firstRun && (
                <label className="field">
                  Invite code <span className="muted">(skip this if the owner added your email)</span>
                  <input id="auth-invite" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Filled in automatically from an invite link" />
                </label>
              )}
              {error && <p className="small bad">{error}</p>}
              {mode === "signup" && (
                <p className="muted small">
                  By creating an account you agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a> and{" "}
                  <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
                </p>
              )}
              <button className="btn" disabled={busy}>{busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}</button>
              {!firstRun && (
                <p className="small">
                  {mode === "signin" ? "New here? " : "Already have an account? "}
                  <button type="button" className="link" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}>
                    {mode === "signin" ? "Create an account" : "Sign in"}
                  </button>
                </p>
              )}
              {mode === "signin" &&
                (canEmail ? (
                  <p className="small">
                    <button type="button" className="link" onClick={() => { setMode("forgot"); setError(null); }}>Forgot your password?</button>
                  </p>
                ) : (
                  <p className="muted small">Forgot your password? Ask the person who invited you to set a temporary one.</p>
                ))}
              <p className="muted small"><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
