import type { ReactNode } from "react";
import { APP_NAME, CONTACT_EMAIL, LEGAL_UPDATED, OPERATOR } from "../brand";

/** The two public pages, served at /privacy and /terms (no sign-in needed; Plaid and app stores link to them). */
export type LegalDoc = "privacy" | "terms";

export function legalDocFor(pathname: string): LegalDoc | null {
  const p = pathname.replace(/\/+$/, "");
  return p === "/privacy" ? "privacy" : p === "/terms" ? "terms" : null;
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="/">{APP_NAME}</a>
        </div>
      </header>
      <div className="app">
        <article className="card legal">
          {doc === "privacy" ? <PrivacyPolicy /> : <Terms />}
          <p className="muted small legal-foot">
            <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a> · <a href="/">Back to {APP_NAME}</a>
          </p>
        </article>
      </div>
    </div>
  );
}

function Contact() {
  return CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> : <>the contact address shown in the app</>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function PrivacyPolicy() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="muted small">Last updated {LEGAL_UPDATED}</p>
      <p>
        {APP_NAME} is a personal budgeting app run by {OPERATOR} ("we", "us"). This policy explains what we collect, why, who
        else touches it, and how to delete it. The short version: we use your data only to run your budget, and we never sell it.
      </p>

      <Section title="What we collect">
        <ul>
          <li><strong>Your account:</strong> first name, email address, and a scrambled (hashed) password. If you use Continue with Google, we receive your name, email and a Google account ID, not your Google password.</li>
          <li><strong>Bank data you connect:</strong> through Plaid or SimpleFIN we receive account names, types, the last digits of account numbers, balances, transactions, and for loans and credit cards, details such as interest rate, minimum payment and due date. We never see or store your bank username or password.</li>
          <li><strong>What you enter:</strong> categories, limits, bills, goals, notes, account nicknames, appearance choices and your time zone.</li>
          <li><strong>Device details for notifications:</strong> if you turn on notifications, your browser gives us a push address for that device.</li>
          <li><strong>Basic server logs:</strong> the hosting service records IP addresses and request times to keep the site running and secure.</li>
        </ul>
        <p>We use one cookie, to keep you signed in. We don't use advertising, tracking or analytics cookies.</p>
      </Section>

      <Section title="How we use it">
        <ul>
          <li>To show your balances, spending, categories, bills, goals, debt and savings suggestions.</li>
          <li>To send the alerts and reminders you turn on.</li>
          <li>To keep your account secure, fix problems, and answer you when you contact us.</li>
          <li>To meet legal obligations.</li>
        </ul>
        <p>We do not sell your personal information, share it for advertising, or use it to offer you loans or credit cards.</p>
      </Section>

      <Section title="Who else is involved">
        <ul>
          <li>
            <strong>Plaid</strong> connects most banks. When you connect through Plaid, Plaid collects data from your bank under its own{" "}
            <a href="https://plaid.com/legal/#end-user-privacy-policy" target="_blank" rel="noreferrer">End User Privacy Policy</a>.
          </li>
          <li><strong>SimpleFIN Bridge</strong>, if you choose it, connects banks under its own terms.</li>
          <li><strong>Render</strong> hosts the app and stores its data in the United States.</li>
          <li><strong>Google</strong> handles Continue with Google if you use it, and serves the app's font.</li>
          <li><strong>Your browser's push service</strong> (for example Apple, Google or Mozilla) delivers notifications you turn on.</li>
        </ul>
        <p>
          We may also share information if the law requires it, to protect someone's safety, or as part of a sale or merger of {APP_NAME},
          in which case this policy continues to apply.
        </p>
      </Section>

      <Section title="Family accounts">
        <p>
          Each person has a private budget. The person who set up the family can see members' names and email addresses, and can
          set a temporary password for them, but cannot see their banks, balances or transactions.
        </p>
      </Section>

      <Section title="How we protect it">
        <p>
          Connections use HTTPS. Bank access tokens are encrypted before they're stored, and passwords are stored only as a
          one-way hash. No system is perfectly secure; if a breach affects your information, we will tell you as the law requires.
        </p>
      </Section>

      <Section title="Keeping and deleting your data">
        <p>
          We keep your data while you have an account. In Settings you can export it or delete your account. Deleting your account
          disconnects your banks at Plaid and erases your data from the app. Copies in the hosting service's backups are removed
          when those backups expire. You can also disconnect any bank at any time on the Accounts tab.
        </p>
      </Section>

      <Section title="Your choices and rights">
        <p>
          You can see and correct your information in the app, export it, or delete it. Depending on where you live, you may have
          additional rights, such as to know what we hold or to ask us to delete it. Contact us at <Contact /> and we'll respond within
          30 days.
        </p>
      </Section>

      <Section title="Children">
        <p>{APP_NAME} is for people 18 and older. We don't knowingly collect information from children under 13.</p>
      </Section>

      <Section title="Changes">
        <p>If we change this policy in a meaningful way, we'll tell you in the app or by email before the change takes effect.</p>
      </Section>

      <Section title="Contact">
        <p>Questions about privacy: <Contact />.</p>
      </Section>
    </>
  );
}

function Terms() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="muted small">Last updated {LEGAL_UPDATED}</p>
      <p>
        These terms are an agreement between you and {OPERATOR} ("we", "us") for using {APP_NAME}. By creating an account or using the
        app, you agree to them and to our <a href="/privacy">Privacy Policy</a>.
      </p>

      <Section title="Who can use it">
        <p>You must be 18 or older and able to agree to these terms. You're responsible for keeping your password private and for activity on your account.</p>
      </Section>

      <Section title="What the app does">
        <p>
          {APP_NAME} organizes your financial information so you can budget: it imports transactions from accounts you connect,
          sorts them into categories, and shows summaries, alerts, lessons and suggestions. You authorize us, and our providers Plaid and
          SimpleFIN, to access your connected accounts on your behalf to do this. We can only read data; we can't move your money.
        </p>
      </Section>

      <Section title="Not financial advice">
        <p>
          {APP_NAME} is an educational and organizing tool. Its lessons, scores, payoff plans and savings suggestions are general
          information, not financial, investment, tax, credit or legal advice. Decide for yourself, and talk to a qualified professional
          before making important financial decisions.
        </p>
      </Section>

      <Section title="Accuracy of your data">
        <p>
          Balances and transactions come from your banks and our data providers, and can be late, incomplete or wrong. Automatic
          categories are best guesses. Always check your bank's own records before relying on a number, for example before paying a bill
          or deciding whether you can afford something.
        </p>
      </Section>

      <Section title="Payment links">
        <p>
          "Make a payment" links open your lender's own website. We don't process those payments and aren't responsible for them.
        </p>
      </Section>

      <Section title="Fees">
        <p>
          {APP_NAME} is free during early access. If we introduce paid plans, we'll show the price and terms clearly before you're
          charged anything, and nothing will be charged without your agreement. Paid plans will be cancellable at any time.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>
          Don't connect accounts you aren't authorized to access, try to break into or overload the service or other people's accounts,
          copy or resell the app, or use it for anything illegal.
        </p>
      </Section>

      <Section title="Other services">
        <p>
          Bank connections, sign-in with Google and hosting are provided by other companies with their own terms. We aren't responsible for
          their services, and an outage on their side may interrupt ours.
        </p>
      </Section>

      <Section title="Ending your account">
        <p>
          You can delete your account at any time in Settings. We may suspend or close accounts that break these terms or put the service or
          other people at risk, or stop offering the app with reasonable notice so you can export your data.
        </p>
      </Section>

      <Section title="Disclaimers">
        <p>
          The app is provided "as is" and "as available", without warranties of any kind, including that it will be error-free,
          uninterrupted or accurate, to the extent the law allows.
        </p>
      </Section>

      <Section title="Limitation of liability">
        <p>
          To the extent the law allows, we aren't liable for indirect, incidental or consequential losses, or for decisions you make based on
          the app, such as late fees, overdrafts or missed payments. Our total liability for any claim is limited to the greater of the amount you
          paid us in the 12 months before the claim or $50.
        </p>
      </Section>

      <Section title="Changes and governing law">
        <p>
          We may update these terms. If a change is meaningful, we'll tell you in the app or by email before it takes effect; continuing to use
          the app afterwards means you accept it. These terms are governed by the laws of the State of Wisconsin, USA.
        </p>
      </Section>

      <Section title="Contact">
        <p>Questions about these terms: <Contact />.</p>
      </Section>
    </>
  );
}
