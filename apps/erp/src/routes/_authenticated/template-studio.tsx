import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildPrescriptionHtml,
  buildInvoiceHtml,
  printPrescription,
  printTallyInvoice,
  type PrintInvoice,
  type PrintLine,
  type PrintPrescription,
} from "@/lib/print-layout";
import { Printer, FileText, ReceiptText, Search, UserX } from "lucide-react";

export const Route = createFileRoute("/_authenticated/template-studio")({
  head: () => ({
    meta: [
      { title: "Template Studio — MGHYN Clinic ERP" },
      { name: "description", content: "Design print and message templates used across the clinic." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Template Studio — MGHYN Clinic ERP" },
      { property: "og:description", content: "Design print and message templates used across the clinic." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/template-studio" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/template-studio" }],
  }),
  component: TemplateStudioPage,
});

type Mode = "prescription" | "invoice";

function TemplateStudioPage() {
  const { roles } = useAuth();
  const allowed = roles.some((r) => ["admin", "doctor", "reception", "accountant", "counselor"].includes(r));
  const [mode, setMode] = useState<Mode>("prescription");
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<string | null>(null);

  // Client directory for the selector.
  const { data: clients } = useQuery({
    queryKey: ["studio-clients"],
    queryFn: async () =>
      (await supabase.from("customers").select("id,name,age,gender,phone").order("name")).data ?? [],
  });
  const selected = useMemo(
    () => (clients ?? []).find((c) => c.name === selectedClient) ?? null,
    [clients, selectedClient],
  );
  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return (clients ?? []).filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [clients, search]);

  // Latest clinical record (prescription) for the chosen client.
  const { data: clientVisit } = useQuery({
    queryKey: ["studio-visit", selectedClient],
    enabled: !!selectedClient,
    queryFn: async () =>
      (
        await supabase
          .from("patient_visits")
          .select("prescription,counselor_notes,created_at")
          .ilike("customer_name", selectedClient!)
          .not("prescription", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ).data,
  });

  // Pull a real migrated record so the preview reflects live data structures.
  const { data: invoiceRow } = useQuery({
    queryKey: ["studio-invoice", selectedClient],
    queryFn: async () => {
      let q = supabase.from("invoices").select("*").order("invoice_date", { ascending: false }).limit(1);
      if (selectedClient) q = q.ilike("customer_name", selectedClient);
      return (await q.maybeSingle()).data;
    },
  });
  const { data: pkgRow } = useQuery({
    queryKey: ["studio-package", invoiceRow?.customer_name],
    enabled: !!invoiceRow?.customer_name,
    queryFn: async () =>
      (await supabase.from("treatment_packages").select("*").ilike("client_name", invoiceRow!.customer_name ?? "").limit(1).maybeSingle()).data,
  });

  const rxSample: PrintPrescription = useMemo(() => {
    // When a client is selected, bind their live record into the layout; otherwise show sample data.
    if (selected) {
      return {
        patient_name: selected.name,
        age: selected.age ?? null,
        gender: selected.gender ?? null,
        consultation_date: clientVisit?.created_at ? String(clientVisit.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10),
        provisional_diagnosis: "",
        investigations: "",
        notes: clientVisit?.prescription ?? "",
        suggested_services: clientVisit?.counselor_notes ?? "",
        suggested_products: "",
      };
    }
    return {
      patient_name: invoiceRow?.customer_name ?? "Sample Patient",
      age: 34,
      gender: "Female",
      consultation_date: invoiceRow?.invoice_date ?? new Date().toISOString().slice(0, 10),
      provisional_diagnosis: "Melasma (facial)\nAndrogenetic alopecia — Grade II",
      investigations: "CBC, Thyroid profile\nVitamin D, B12, Serum Ferritin",
      notes: "Strict photoprotection (SPF 50, reapply 3-hourly).\nAvoid hot water facial wash.\nReview after 4 weeks.",
      suggested_services: "Cosmelan Peel — 1 session\nQ-Switch Nd:YAG — 4 sessions (fortnightly)\nGFC Hair — 6 sessions",
      suggested_products: "Mediglo Brightening Serum — apply at night\nCeramide Moisturiser — twice daily\nSPF 50 Sunscreen — morning",
    };
  }, [selected, clientVisit, invoiceRow]);

  const invSample: PrintInvoice = useMemo(() => {
    if (!invoiceRow) {
      return {
        invoice_no: "INV-SAMPLE-001",
        invoice_date: new Date().toISOString().slice(0, 10),
        customer_name: "Sample Client",
        customer_phone: "98xxxxxx10",
        client_type: "Existing May",
        state_code: "06",
        payment_mode: "UPI",
        tax_mode: "inclusive",
        base_amount: 4761.9,
        cgst: 119.05,
        sgst: 119.05,
        gross_total: 6000,
        paid_amount: 5000,
        pending_balance: 1000,
        package: { total_sessions: 6, delivered_sessions: 2, remaining_sessions: 4, outstanding_balance: 1000 },
      };
    }
    return {
      invoice_no: invoiceRow.invoice_no ?? "INV-",
      invoice_date: invoiceRow.invoice_date,
      customer_name: invoiceRow.customer_name ?? "—",
      customer_phone: null,
      client_type: (invoiceRow as Record<string, unknown>).client_type as string | null ?? "Existing",
      state_code: invoiceRow.state_code ?? "06",
      payment_mode: invoiceRow.payment_mode ?? "Cash",
      tax_mode: invoiceRow.tax_mode ?? "inclusive",
      base_amount: Number(invoiceRow.base_amount),
      cgst: Number(invoiceRow.cgst),
      sgst: Number(invoiceRow.sgst),
      gross_total: Number(invoiceRow.gross_total),
      paid_amount: invoiceRow.paid_amount != null ? Number(invoiceRow.paid_amount) : null,
      pending_balance: invoiceRow.pending_balance != null ? Number(invoiceRow.pending_balance) : null,
      package: pkgRow
        ? {
            total_sessions: Number((pkgRow as Record<string, unknown>).total_sessions ?? 0) || 0,
            delivered_sessions: Number((pkgRow as Record<string, unknown>).completed_sessions ?? 0) || 0,
            remaining_sessions:
              (Number((pkgRow as Record<string, unknown>).total_sessions ?? 0) || 0) -
              (Number((pkgRow as Record<string, unknown>).completed_sessions ?? 0) || 0),
            outstanding_balance: Number((pkgRow as Record<string, unknown>).pending_amount ?? 0) || 0,
          }
        : null,
    };
  }, [invoiceRow, pkgRow]);

  const invLines: PrintLine[] = useMemo(() => {
    const base = Number(invSample.base_amount) || 0;
    const cgst = Number(invSample.cgst) || 0;
    const sgst = Number(invSample.sgst) || 0;
    return [
      {
        description: "Dr. Consultation",
        sac_code: "999312",
        qty: 1,
        base_amount: 1000,
        cgst: 0,
        sgst: 0,
        cgst_pct: 0,
        sgst_pct: 0,
        line_total: 1000,
        session_label: "GST exempt (0%)",
      },
      {
        description: "Clinical Service / Treatment",
        sac_code: "999313",
        qty: 1,
        discount_amount: 250,
        base_amount: base,
        cgst: cgst,
        sgst: sgst,
        cgst_pct: 2.5,
        sgst_pct: 2.5,
        line_total: base + cgst + sgst,
        session_label: invSample.package ? `Session ${invSample.package.delivered_sessions} of ${invSample.package.total_sessions}` : null,
      },
      {
        description: "Direct Product/Medicine Sale",
        sac_code: "300490",
        qty: 1,
        base_amount: 0,
        cgst: 0,
        sgst: 0,
        cgst_pct: 2.5,
        sgst_pct: 2.5,
        line_total: 0,
        session_label: "Generic OTC mapping",
      },
    ].filter((l) => l.line_total > 0 || l.description === "Direct Product/Medicine Sale");
  }, [invSample]);

  const previewHtml = mode === "prescription" ? buildPrescriptionHtml(rxSample) : buildInvoiceHtml(invSample, invLines);

  if (!allowed) return <AccessDenied />;

  return (
    <div>
      <PageHeader title="Print Template Studio" subtitle="Unified print layout engine · inspect both branded A4 models on-screen, then send to printer" />
      <Card className="mb-4 p-4">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Select Client</label>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search a client to load their records into the template…"
            value={selectedClient ?? search}
            onChange={(e) => { setSelectedClient(null); setSearch(e.target.value); }}
          />
          {selectedClient && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => { setSelectedClient(null); setSearch(""); }}
              aria-label="Clear selection"
            >
              <UserX className="h-4 w-4" />
            </button>
          )}
          {!selectedClient && suggestions.length > 0 && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
              {suggestions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => { setSelectedClient(c.name); setSearch(""); }}
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{[c.age ? `${c.age}y` : "", c.gender ?? "", c.phone ?? ""].filter(Boolean).join(" · ")}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {selected && (
          <p className="mt-2 text-xs text-muted-foreground">
            Loaded <b>{selected.name}</b> — records auto-populate the layout below and print output.
          </p>
        )}
      </Card>
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
        <Button variant={mode === "prescription" ? "default" : "outline"} onClick={() => setMode("prescription")}>
          <FileText className="mr-2 h-4 w-4" /> Preview Clinical Prescription Layout
        </Button>
        <Button variant={mode === "invoice" ? "default" : "outline"} onClick={() => setMode("invoice")}>
          <ReceiptText className="mr-2 h-4 w-4" /> Preview Tally-Style Invoice Layout
        </Button>
        <div className="ml-auto">
          <Button
            variant="secondary"
            onClick={() => (mode === "prescription" ? printPrescription(rxSample) : printTallyInvoice(invSample, invLines))}
          >
            <Printer className="mr-2 h-4 w-4" /> Print (window.print)
          </Button>
        </div>
      </Card>
      <Card className="overflow-hidden p-0">
        <iframe
          title="print-preview"
          srcDoc={previewHtml}
          className="h-[1100px] w-full border-0 bg-white"
        />
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">
        Preview binds to your most recent migrated invoice/package record when available; otherwise sample data is shown. Navigation and app
        chrome are automatically hidden in the print window.
      </p>
    </div>
  );
}
