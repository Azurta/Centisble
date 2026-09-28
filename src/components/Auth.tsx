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
  if (!me?.user) return <AuthScreen firstRun={Boolean(me?.firstRun)} onDone={load} />;
  return <>{children(me)}</>;
}

function AuthScreen({ firstRun, onDone }: { firstRun: boolean; onDone: () => void }) {
  const invite = new URLSearchParams(window.location.search).get("invite") ?? "";
  const [mode, setMode] = useState<"signin" | "signup">(firstRun || invite ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState(invite);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") await api.signup({ name, email, password, invite: code || undefined });
      else await api.login(email, password);
      if (invite) window.history.replaceState(null, "", "/");
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
          <h1>{mode === "signin" ? `Sign in to ${APP_NAME}` : firstRun ? "Create the owner account" : `Join ${APP_NAME}`}</h1>
          <p className="muted small">
            {mode === "signin"
              ? "Your banks and budgets are private to your account."
              : firstRun
                ? "You're the first person here, so you'll be the owner: you can invite family and see how many bank connections are left."
                : "Each person gets their own private budget. Your data isn't visible to anyone else."}
          </p>
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
            <label className="field">Invite code<input id="auth-invite" value={code} onChange={(e) => setCode(e.target.value)} placeholder="From your invite link" /></label>
          )}
          {error && <p className="small bad">{error}</p>}
          <button className="btn" disabled={busy}>{busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}</button>
          {!firstRun && (
            <p className="small">
              {mode === "signin" ? "New here? " : "Already have an account? "}
              <button type="button" className="link" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}>
                {mode === "signin" ? "Create an account with an invite" : "Sign in"}
              </button>
            </p>
          )}
          {mode === "signin" && <p className="muted small">Forgot your password? Ask the person who invited you to set a temporary one.</p>}
        </form>
      </div>
    </div>
  );
}
