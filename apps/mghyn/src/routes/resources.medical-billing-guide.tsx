import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, CheckCircle, ShieldCheck, CalendarDays, Package, FileText, TrendingUp, ArrowRight } from "lucide-react";

const SITE_URL = "https://mediglo-vision.lovable.app";
const OG_IMAGE = `${SITE_URL}/medical-billing-guide-og.jpg`;

export const Route = createFileRoute("/resources/medical-billing-guide")({
  head: () => ({
    meta: [
      { title: "Selecting Medical Billing Software for Aesthetic Clinics — MGHYN" },
      {
        name: "description",
        content:
          "A practical guide to choosing medical billing software for aesthetic clinics. Learn how to handle GST compliance, package session tracking, split payments, and invoice edits without ledger errors.",
      },
      {
        property: "og:title",
        content: "Selecting Medical Billing Software for Aesthetic Clinics",
      },
      {
        property: "og:description",
        content:
          "A practical guide to choosing medical billing software for aesthetic clinics. Learn how to handle GST compliance, package session tracking, split payments, and invoice edits without ledger errors.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: `${SITE_URL}/resources/medical-billing-guide` },
      { property: "og:image", content: OG_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Selecting Medical Billing Software for Aesthetic Clinics" },
      {
        name: "twitter:description",
        content:
          "A practical guide to choosing medical billing software for aesthetic clinics. Learn how to handle GST compliance, package session tracking, split payments, and invoice edits without ledger errors.",
      },
      { name: "twitter:image", content: OG_IMAGE },
      { name: "author", content: "MGHYN Clinic ERP" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/resources/medical-billing-guide` }],

  }),
  component: MedicalBillingGuidePage,
});

function MedicalBillingGuidePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 md:px-6">
          <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
            <Activity className="h-5 w-5 text-primary" />
            <span>MGHYN</span>
          </Link>
          <Link
            to="/auth"
            className="text-sm font-medium text-primary hover:underline"
          >
            Staff Sign In
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-12 md:py-16">
        {/* Hero */}
        <div className="mb-10 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
            <FileText className="h-3.5 w-3.5" />
            Clinic Operations Guide
          </span>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl lg:text-5xl">
            Selecting Medical Billing Software for Aesthetic Clinics
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Medical billing software is the financial backbone of a clinic. For aesthetic,
            dermatology, and wellness practices, the right system must do far more than print
            receipts — it must protect GST compliance, track package sessions, and keep the
            ledger balanced even when invoices are edited or voided.
          </p>
        </div>

        <img
          src="/medical-billing-guide-og.jpg"
          alt="Aesthetic clinic billing dashboard with GST invoices, appointment calendar, and package session tracker"
          width={1200}
          height={630}
          className="mb-12 w-full rounded-2xl shadow-[var(--shadow-elegant)]"
        />

        {/* Intro */}
        <section className="prose prose-lg max-w-none">
          <p>
            Choosing medical billing software for a clinic is not only a technology decision —
            it is a compliance and cash-flow decision. In India, aesthetic clinics must bill
            services under specific SAC codes, separate GST-exempt doctor consultations from
            taxable procedures, and maintain a clear audit trail for tax filings. A generic
            POS or accounting tool often fails because it does not understand the clinic
            workflow: a patient books a consultation, buys a package of six laser sessions,
            pays partly in cash and partly via UPI, and later asks for a revised invoice.
          </p>
          <p>
            This guide explains what to look for in medical billing software, with a focus on
            the pain points that matter most to aesthetic clinics: GST compliance, package and
            session tracking, split-payment accounting, and safe invoice editing.
          </p>
        </section>

        {/* Table of contents */}
        <nav aria-label="Guide sections" className="my-10 rounded-xl border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">What this guide covers</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            <li className="flex items-start gap-2">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <a href="#gst" className="text-sm hover:underline">GST compliance for clinic services</a>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <a href="#packages" className="text-sm hover:underline">Package session tracking</a>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <a href="#splits" className="text-sm hover:underline">Split payments and ledger mapping</a>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <a href="#edits" className="text-sm hover:underline">Safe invoice editing and voiding</a>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <a href="#checklist" className="text-sm hover:underline">Software selection checklist</a>
            </li>
          </ul>
        </nav>

        {/* Section 1: GST */}
        <section id="gst" className="mt-12">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-bold">GST compliance for clinic services</h2>
          </div>
          <p className="text-muted-foreground">
            Aesthetic clinics in India typically charge 5% GST on clinical services and
            products, while doctor consultations (OPD) are GST-exempt under SAC 999312.
            Your billing software must apply the correct rate automatically based on the
            service master, not on manual entry at the counter.
          </p>
          <div className="mt-6 rounded-xl border bg-card p-6">
            <h3 className="mb-3 font-semibold">Key GST capabilities to demand</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm">
                  <strong>SAC-code-aware tax rates:</strong> The system should know that
                  “Dr. Consultation / OPD” is 0% while most other services are 5%.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm">
                  <strong>CGST/SGST split:</strong> A 5% invoice should break into 2.5% CGST
                  and 2.5% SGST, with rounding handled so the ledger always balances.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm">
                  <strong>Tax export hub:</strong> One-click GSTR-1-ready reports with city,
                  invoice number, taxable value, and tax amounts.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm">
                  <strong>Invoice numbering by financial year:</strong> Indian FY runs April to
                  March. Invoice series should reset and pad safely so numbers like
                  MG/26-27/0001 never collide or truncate.
                </span>
              </li>
            </ul>
          </div>
          <p className="mt-6 text-muted-foreground">
            Manual GST entry at the POS is a common source of audit variance. The best medical
            billing software for clinics encodes tax rules in the service catalog and enforces
            them at every sale.
          </p>
        </section>

        {/* Section 2: Packages */}
        <section id="packages" className="mt-12">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Package className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-bold">Package session tracking</h2>
          </div>
          <p className="text-muted-foreground">
            Aesthetic clinics sell packages — six laser hair removal sessions, four
            microneedling visits, or a combined skin-care bundle. The billing system must turn
            a single package sale into a redeemable wallet of sessions, then decrement that
            wallet accurately every time the patient checks in.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border bg-card p-5">
              <h3 className="mb-2 font-semibold">What goes wrong</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Staff forgets how many sessions remain.</li>
                <li>Redemptions are logged on paper or in a separate sheet.</li>
                <li>Package revenue is recognized all at once instead of per session.</li>
                <li>Refunds become guesswork because usage history is missing.</li>
              </ul>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <h3 className="mb-2 font-semibold">What to look for</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Service wallet tied to the customer record.</li>
                <li>Session-level redemption with date and staff notes.</li>
                <li>Backdated entry support for missed logs.</li>
                <li>Visibility at reception, appointments, and billing.</li>
              </ul>
            </div>
          </div>
          <p className="mt-6 text-muted-foreground">
            When package tracking is integrated into the billing and appointment workflow,
            front-desk staff can see remaining sessions at a glance, clinicians know what was
            already delivered, and accountants can defer revenue correctly.
          </p>
        </section>

        {/* Section 3: Split payments */}
        <section id="splits" className="mt-12">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <TrendingUp className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-bold">Split payments and ledger mapping</h2>
          </div>
          <p className="text-muted-foreground">
            Patients rarely pay with a single tender. A ₹10,000 bill might be split as
            ₹6,000 cash and ₹4,000 UPI. If your software records this as one opaque string, your
            cash/bank reconciliation becomes impossible. Each tender must post to its own
            ledger account.
          </p>
          <div className="mt-6 rounded-xl border bg-card p-6">
            <h3 className="mb-3 font-semibold">Tender buckets a clinic needs</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {["Cash", "UPI", "Card", "Net Banking", "Razorpay", "Save in Finance", "Credit / Pending"].map((t) => (
                <div key={t} className="rounded-lg bg-muted px-3 py-2 text-sm font-medium">
                  {t}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-6 text-muted-foreground">
            Look for medical billing software that decomposes every payment into structured
            splits and posts one balanced receipt voucher per tender. The cash position,
            bank position, and outstanding receivables should update automatically — not
            after a manual spreadsheet exercise.
          </p>
        </section>

        {/* Section 4: Safe edits */}
        <section id="edits" className="mt-12">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-bold">Safe invoice editing and voiding</h2>
          </div>
          <p className="text-muted-foreground">
            Invoices sometimes need revision: a service was added, a discount was missed, or a
            patient changed their mind. The wrong approach is to overwrite the original
            invoice. That destroys the audit trail and makes GST reconciliation unreliable.
          </p>
          <div className="mt-6 rounded-xl border bg-card p-6">
            <h3 className="mb-3 font-semibold">The safer pattern: void and replace</h3>
            <ol className="list-decimal space-y-3 pl-5 text-sm text-muted-foreground">
              <li>
                Mark the original invoice as void, preserving its line items and voucher
                history.
              </li>
              <li>
                Create a replacement invoice with a new number and corrected line items.
              </li>
              <li>
                Reverse the original accounting entries and post fresh vouchers for the
                replacement.
              </li>
              <li>
                Update customer outstanding balance and inventory stock automatically.
              </li>
            </ol>
          </div>
          <p className="mt-6 text-muted-foreground">
            The best systems also warn about duplicate invoices before saving, and let
            administrators lock billing during maintenance or month-end closing so no one
            accidentally corrupts the books.
          </p>
        </section>

        {/* Section 5: Checklist */}
        <section id="checklist" className="mt-12">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarDays className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-bold">Software selection checklist</h2>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <ul className="space-y-4">
              {[
                "Role-based access for doctors, reception, accountants, and counselors.",
                "Appointment calendar with concurrency guards to prevent double booking.",
                "Inventory deduction tied to each sale or session using FIFO batch logic.",
                "GST-ready invoices with SAC codes, CGST/SGST split, and financial-year numbering.",
                "Package wallets and session redemption visible across modules.",
                "Split-payment posting to separate ledgers with automatic reconciliation.",
                "Atomic invoice edit/void with full audit trail and balance sync.",
                "Bank statement import with duplicate detection and day-first date parsing.",
                "Data export for tax filing and accountant review.",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mt-14 rounded-2xl border bg-gradient-to-br from-primary/5 to-accent/30 p-8 text-center">
          <h2 className="text-2xl font-bold">Built for the checklist above</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            MGHYN is a clinic ERP designed around the billing, compliance, and package
            workflows described in this guide. If you are evaluating medical billing software
            for your aesthetic clinic, sign in and explore the POS, inventory, and tax export
            modules.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Explore MGHYN <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Back to home
            </Link>
          </div>
        </section>
      </article>

      {/* Footer */}
      <footer className="border-t bg-muted/30 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground md:flex-row">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">MGHYN Clinic ERP</span>
          </div>
          <p>© {new Date().getFullYear()} MGHYN · HMU Softwares. GST/ITR Ready.</p>
        </div>
      </footer>
    </div>
  );
}
