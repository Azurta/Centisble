import { useEffect, useState } from "react";
import { api, type Me } from "../api";
import { APP_NAME } from "../brand";
import { canPromptInstall, disablePush, enablePush, isStandalone, onInstallAvailable, platform, promptInstall, pushState, type PushState } from "../pwa";
import type { AppData } from "../useAppData";
import { ACCENTS, type AccentId, type ThemeChoice } from "../appearance";
import { signOut } from "./Auth";

export function Settings({ me, data }: { me: Me | null; data: AppData }) {
  return (
    <div className="settings-grid">
      {me?.user?.role === "owner" && <Family me={me} data={data} />}
      <AppearanceCard data={data} />
      {me?.user && <YourAccount me={me} />}
      <InstallApp />
      {me?.user && <Notifications data={data} />}
      {me?.user && <MoveData />}
      {!me?.user && (
        <section className="card">
          <h2>Accounts</h2>
          <p className="muted small">This copy runs on this device only. Sign-in, family sharing and notifications work once the app is running on your server.</p>
        </section>
      )}
    </div>
  );
}

function YourAccount({ me }: { me: Me }) {
  const u = me.user!;
  const [open, setOpen] = useState<"password" | "delete" | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section className="card">
      <h2>Your account</h2>
      <dl className="snapshot-lines">
        <div><dt>Name</dt><dd>{u.name}</dd></div>
        <div><dt>Email</dt><dd>{u.email}</dd></div>
        <div><dt>Role</dt><dd>{u.role === "owner" ? "Owner" : "Member"}</dd></div>
      </dl>
      <div className="row">
        <button className="btn secondary" onClick={signOut}>Sign out</button>
        <button className="link small" onClick={() => setOpen(open === "password" ? null : "password")}>{me.hasPassword ? "Change password" : "Add a password"}</button>
        <button className="link small bad" onClick={() => setOpen(open === "delete" ? null : "delete")}>Delete account</button>
      </div>
      {open === "password" && (
        <form className="stack mt-s" onSubmit={async (e) => {
          e.preventDefault();
          try { await api.changePassword(current, next); setMsg("Password changed."); setOpen(null); setCurrent(""); setNext(""); } catch (err) { setMsg((err as Error).message); }
        }}>
          {me.hasPassword && (
            <label className="field">Current password<input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
          )}
          <label className="field">New password<input id="pw-next" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} /></label>
          <button className="btn self-start">Save password</button>
        </form>
      )}
      {open === "delete" && (
        <form className="stack mt-s" onSubmit={async (e) => {
          e.preventDefault();
          try { await api.deleteAccount(current); await signOut(); } catch (err) { setMsg((err as Error).message); }
        }}>
          <p className="small">This disconnects your banks and permanently erases your transactions, budgets and settings from {APP_NAME}. It can't be undone.</p>
          <label className="field">
            {me.hasPassword ? "Enter your password to confirm" : "Type DELETE to confirm"}
            <input id="pw-delete" type={me.hasPassword ? "password" : "text"} autoComplete="off" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
          <button className="btn danger self-start" disabled={!current}>Delete my account and data</button>
        </form>
      )}
      {msg && <p className="small">{msg}</p>}
    </section>
  );
}

function InstallApp() {
  const [available, setAvailable] = useState(canPromptInstall());
  useEffect(() => onInstallAvailable(() => setAvailable(true)), []);
  const p = platform();
  if (isStandalone())
    return (
      <section className="card">
        <h2>App installed</h2>
        <p className="muted small">You're using {APP_NAME} as an app. It opens full-screen from your home screen.</p>
      </section>
    );
  return (
    <section className="card">
      <h2>Install {APP_NAME} as an app</h2>
      <p className="muted small">Get an icon on your home screen that opens full-screen, like a regular app.</p>
      {available ? (
        <button className="btn self-start" onClick={() => promptInstall().then(() => setAvailable(false))}>Install app</button>
      ) : p === "ios" ? (
        <ol className="steps small">
          <li>Open this page in <strong>Safari</strong>.</li>
          <li>Tap the <strong>Share</strong> button (square with an arrow).</li>
          <li>Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
        </ol>
      ) : p === "android" ? (
        <ol className="steps small">
          <li>In Chrome, tap the <strong>⋮</strong> menu.</li>
          <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
        </ol>
      ) : (
        <p className="small">In Chrome or Edge, click the install icon at the right end of the address bar, or open the browser menu and choose <strong>Install {APP_NAME}</strong>.</p>
      )}
    </section>
  );
}

function Notifications({ data }: { data: AppData }) {
  const [state, setState] = useState<PushState | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    pushState().then(setState);
  }, []);
  const key = data.status?.pushKey;
  return (
    <section className="card">
      <h2>Notifications</h2>
      <p className="muted small">Get an alert on this device when a purchase puts a category close to or over its limit, even when {APP_NAME} is closed.</p>
      {state === "needs-install" ? (
        <p className="small">On iPhone, first add {APP_NAME} to your Home Screen (see “Install as an app”), open it from there, then come back here.</p>
      ) : state === "unsupported" ? (
        <p className="small">This browser doesn't support notifications. Try Chrome, Edge, Firefox, or the installed app.</p>
      ) : state === "denied" ? (
        <p className="small">Notifications are blocked for this site. Allow them in your browser or phone settings, then reload.</p>
      ) : state === "on" ? (
        <div className="row">
          <span className="small good">On for this device</span>
          <button className="link small" onClick={async () => { await disablePush(); setState("off"); }}>Turn off</button>
        </div>
      ) : state === "off" ? (
        <button
          className="btn self-start"
          disabled={!key}
          onClick={async () => {
            try { await enablePush(key!); setState("on"); setMsg("Notifications are on. Set limits under Budgets to get alerts."); } catch (e) { setMsg((e as Error).message); }
          }}
        >
          Turn on notifications
        </button>
      ) : null}
      {msg && <p className="small">{msg}</p>}
    </section>
  );
}

function Family({ me, data }: { me: Me; data: AppData }) {
  const [invite, setInvite] = useState(me.invite ?? "");
  const [copied, setCopied] = useState(false);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [temp, setTemp] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const link = `${window.location.origin}/?invite=${encodeURIComponent(invite)}`;
  const conn = data.status?.plaidConnections;
  return (
    <section className="card wide">
      <h2>Family & friends</h2>
      <p className="muted small">
        Everyone gets their own login and connects their own banks. Nobody can see anyone else's money, including you.
      </p>
      <AllowedEmails initial={me.allowedEmails ?? []} />
      <h3 className="mt">Or send an invite link</h3>
      <p className="muted small">Anyone who opens this link can create an account.</p>
      <div className="copy-row">
        <input id="invite-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
        <button
          className="btn secondary"
          onClick={async () => {
            try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { document.getElementById("invite-link")?.focus(); }
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <button className="link small" onClick={async () => setInvite((await api.rotateInvite()).invite)}>Make a new link (the old one stops working)</button>

      {conn && (
        <div className="mt">
          <div className="split-head"><strong className="small">Plaid bank connections used</strong><span className="small">{conn.used} of {conn.limit}</span></div>
          <div className="meter"><div style={{ width: `${Math.min(100, (conn.used / conn.limit) * 100)}%` }} /></div>
          <p className="muted small">
            Shared by everyone on this app. Each bank someone connects uses one, and on the free Trial plan they don't come back when
            removed. When they run out, people can still connect with SimpleFIN, or you can move to Plaid's paid plan.
          </p>
        </div>
      )}

      <h3 className="mt">People ({me.members?.length ?? 1})</h3>
      <ul className="list">
        {me.members?.map((m) => (
          <li key={m.id}>
            <span>{m.name} <span className="muted small">{m.email}{m.role === "owner" ? " · owner" : ""}</span></span>
            {m.role !== "owner" && (
              <button className="link small" onClick={() => { setResetFor(resetFor === m.id ? null : m.id); setTemp(""); setMsg(null); }}>Reset password</button>
            )}
          </li>
        ))}
      </ul>
      {resetFor && (
        <form className="copy-row" onSubmit={async (e) => {
          e.preventDefault();
          try { await api.resetMemberPassword(resetFor, temp); setMsg("Temporary password set. Share it with them privately; they can change it in Settings."); setResetFor(null); } catch (err) { setMsg((err as Error).message); }
        }}>
          <input id="temp-password" placeholder="Temporary password (8+ characters)" value={temp} onChange={(e) => setTemp(e.target.value)} />
          <button className="btn secondary" disabled={temp.length < 8}>Set</button>
        </form>
      )}
      {msg && <p className="small">{msg}</p>}
    </section>
  );
}

/** Move bank connections and settings from one server to another (e.g. your computer → Render) without reconnecting. */
function MoveData() {
  const [pass, setPass] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className="card wide">
      <h2>Move your data to another server</h2>
      <p className="muted small">
        Moving from your computer to Render? Export here, then import on the new server. Your banks come along without reconnecting, so
        you don't use up more Plaid connections. The file is locked with a passphrase you choose. Keep it private and delete it after
        importing.
      </p>
      <label className="field">Passphrase (8+ characters, you'll need it to import)<input id="move-pass" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} /></label>
      <div className="row">
        <button
          className="btn secondary"
          disabled={pass.length < 8 || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const sealed = await api.exportData(pass);
              const url = URL.createObjectURL(new Blob([JSON.stringify(sealed)], { type: "application/json" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = `${APP_NAME.toLowerCase()}-export.json`;
              a.click();
              URL.revokeObjectURL(url);
              setMsg("Export downloaded. On the new server, sign in, open Settings, and import it with the same passphrase.");
            } catch (e) {
              setMsg((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Export my data
        </button>
        <span className="muted small">or import:</span>
        <input type="file" accept=".json,application/json" aria-label="Export file to import" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button
          className="btn secondary"
          disabled={!file || pass.length < 8 || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await api.importData(JSON.parse(await file!.text()), pass);
              setMsg(`Imported ${r.banks} bank connection${r.banks === 1 ? "" : "s"} and ${r.transactions} transactions. Reloading…`);
              setTimeout(() => window.location.reload(), 1200);
            } catch (e) {
              setMsg((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Import
        </button>
      </div>
      {msg && <p className="small">{msg}</p>}
    </section>
  );
}

/** The easiest way in: add someone's email, and they sign up with Google or a password. No code needed. */
function AllowedEmails({ initial }: { initial: string[] }) {
  const [list, setList] = useState(initial);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <h3 className="mt-s">Add people by email</h3>
      <p className="muted small">
        Add their email here, then tell them to open <strong>{window.location.origin}</strong> and choose <strong>Create account</strong>, or
        <strong> Continue with Google</strong> with that email.
      </p>
      <form
        className="copy-row"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            setList((await api.addAllowedEmail(email)).allowedEmails);
            setMsg(`Added. ${email} can now create an account.`);
            setEmail("");
          } catch (err) {
            setMsg((err as Error).message);
          }
        }}
      >
        <input id="allow-email" type="email" placeholder="brother@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email to invite" />
        <button className="btn secondary" disabled={!email.includes("@")}>Add</button>
      </form>
      {list.length > 0 && (
        <ul className="list">
          {list.map((e) => (
            <li key={e}>
              <span>{e} <span className="muted small">invited, hasn't joined yet</span></span>
              <button className="link small" onClick={async () => setList((await api.removeAllowedEmail(e)).allowedEmails)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="small">{msg}</p>}
    </div>
  );
}

function AppearanceCard({ data }: { data: AppData }) {
  const a = data.appearance;
  const set = (patch: Partial<typeof a>) => data.setAppearance({ ...a, ...patch });
  return (
    <section className="card">
      <h2>Appearance</h2>
      <p className="muted small">Saved to your account, so your phone and computer match.</p>
      <div className="field">
        Theme
        <div className="segmented" role="radiogroup" aria-label="Theme">
          {(["system", "light", "dark"] as ThemeChoice[]).map((t) => (
            <button key={t} role="radio" aria-checked={a.theme === t} className={a.theme === t ? "on" : ""} onClick={() => set({ theme: t })}>
              {t === "system" ? "Match device" : t === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>
      </div>
      <div className="field mt-s">
        Accent color
        <div className="swatches" role="radiogroup" aria-label="Accent color">
          {(Object.keys(ACCENTS) as AccentId[]).map((id) => (
            <button
              key={id}
              role="radio"
              aria-checked={a.accent === id}
              aria-label={ACCENTS[id].label}
              title={ACCENTS[id].label}
              className={`swatch-btn ${a.accent === id ? "on" : ""}`}
              style={{ background: `linear-gradient(135deg, ${ACCENTS[id].light} 50%, ${ACCENTS[id].dark} 50%)` }}
              onClick={() => set({ accent: id })}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
