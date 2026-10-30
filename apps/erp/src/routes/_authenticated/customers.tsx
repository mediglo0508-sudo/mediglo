import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GST_STATES, stateName } from "@/lib/constants";
import { inr2 } from "@/lib/gst";
import { printPrescription, printTallyInvoice, printMasterStatement } from "@/lib/print-layout";
import { fmtDate } from "@/lib/date-format";
import { toast } from "sonner";
import { Plus, Trash2, Printer, Pencil, Wallet, FileText } from "lucide-react";
import { WorkflowTracker, deriveWorkflowStage } from "@/components/WorkflowTracker";
import { WalletRedeemDialog } from "@/components/WalletRedeemDialog";
import { DigitalRegistrationDialog } from "@/components/DigitalRegistrationDialog";
import { UserPlus } from "lucide-react";


export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "Clients — MGHYN Clinic ERP" },
      { name: "description", content: "Client records, service wallets, visit history and outstanding balances." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Clients — MGHYN Clinic ERP" },
      { property: "og:description", content: "Client records, service wallets, visit history and outstanding balances." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/customers" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/customers" }],
  }),
  component: CustomersPage,
});

interface Customer { id: string; name: string; phone: string | null; state_code: string; client_type: string | null; age: number | null; gender: string | null; city?: string | null; }

function CustomersPage() {
  const qc = useQueryClient();
  const { canBilling } = useAuth();
  const [active, setActive] = useState<Customer | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [regOpen, setRegOpen] = useState(false);

  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => ((await supabase.from("customers").select("*").order("name")).data ?? []) as Customer[],
  });

  const filtered = (customers ?? []).filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  async function addCustomer() {
    const { error } = await supabase.from("customers").insert({ name: "New Customer", state_code: "06", client_type: "New" });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["customers"] });
  }
  async function deleteSelected() {
    if (!selected.size || !confirm(`Delete ${selected.size} customer(s)?`)) return;
    const { error } = await supabase.from("customers").delete().in("id", Array.from(selected));
    if (error) return toast.error(error.message);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["customers"] });
  }
  async function deleteOne(c: Customer) {
    if (!confirm(`Delete ${c.name}?`)) return;
    const { error } = await supabase.from("customers").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["customers"] });
    toast.success("Customer deleted");
  }

  return (
    <div>
      <PageHeader
        title="Customers — CRM"
        subtitle="B2C profiles. Double-click or press Enter on a row to open the client drawer."
        action={canBilling && (<div className="flex items-center gap-2"><Button onClick={() => setRegOpen(true)} className="flex items-center gap-1.5 bg-primary text-primary-foreground font-semibold"><UserPlus className="h-4 w-4" /> Digital Registration</Button><Button variant="outline" onClick={addCustomer}><Plus className="mr-1 h-4 w-4" /> Quick Blank</Button></div>)}
      />
      <Card className="p-0">
        <div className="flex items-center gap-2 border-b p-3">
          <Input placeholder="Search customer…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 max-w-xs" />
          {selected.size > 0 && (
            <Button size="sm" variant="destructive" className="ml-auto" onClick={deleteSelected}>
              <Trash2 className="mr-1 h-4 w-4" /> Delete Selected ({selected.size})
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-10 p-3"></th>
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Phone</th>
                <th className="p-3 font-medium">State (POS)</th>
                <th className="p-3 font-medium">Type</th>
                {canBilling && <th className="p-3 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  tabIndex={0}
                  className="cursor-pointer outline-none hover:bg-muted/30 focus:bg-accent/40"
                  onDoubleClick={() => setActive(c)}
                  onKeyDown={(e) => e.key === "Enter" && setActive(c)}
                >
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => setSelected((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
                    />
                  </td>
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3">{c.phone || "—"}</td>
                  <td className="p-3">{c.state_code} · {stateName(c.state_code)}</td>
                  <td className="p-3">{c.client_type || "—"}</td>
                  {canBilling && (
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setActive(c)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteOne(c)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={canBilling ? 6 : 5} className="p-8 text-center text-muted-foreground">No customers.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <CustomerDrawer customer={active} onClose={() => setActive(null)} canEdit={canBilling} />
    </div>
  );
}

function CustomerDrawer({ customer, onClose, canEdit }: { customer: Customer | null; onClose: () => void; canEdit: boolean }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Customer | null>(null);
  const open = !!customer;
  // sync form when customer changes
  if (customer && (!form || form.id !== customer.id)) setForm(customer);

  const { data: ledger } = useQuery({
    queryKey: ["cust-ledger", customer?.id],
    enabled: !!customer,
    queryFn: async () => {
      const [{ data: invoices }, { data: packages }] = await Promise.all([
        // Only live (non-voided) invoices count — an edited bill replaces its original
        // instead of adding to the customer's gross/outstanding totals.
        supabase.from("invoices").select("id, invoice_no, gross_total, paid_amount, pending_balance, payment_mode, invoice_date").eq("customer_id", customer!.id).is("voided_at", null).order("invoice_date", { ascending: false }),
        supabase.from("treatment_packages").select("*").eq("customer_id", customer!.id),
      ]);
      const inv = invoices ?? [];
      const gross = inv.reduce((s, r) => s + Number(r.gross_total), 0);
      const due = inv.reduce((s, r) => s + Number(r.pending_balance), 0);
      const byMode: Record<string, number> = {};
      for (const r of inv) byMode[r.payment_mode] = (byMode[r.payment_mode] ?? 0) + Number(r.paid_amount || r.gross_total);
      return { inv, packages: packages ?? [], gross, due, byMode };
    },
  });

  // Prescriptions captured during Doctor / Counselor visits (matched by patient name).
  const { data: rxList } = useQuery({
    queryKey: ["cust-rx", customer?.id, customer?.name],
    enabled: !!customer,
    queryFn: async () => {
      if (!customer) return [];
      const { data } = await supabase
        .from("patient_visits")
        .select("id, prescription, counselor_notes, created_at")
        .ilike("customer_name", customer.name)
        .not("prescription", "is", null)
        .order("created_at", { ascending: false });
      return (data ?? []).filter((r) => (r.prescription ?? "").trim().length > 0);
    },
  });

  // Service Wallets + redemption history
  const { data: wallets } = useQuery({
    queryKey: ["cust-wallets", customer?.id],
    enabled: !!customer,
    queryFn: async () => {
      const { data } = await supabase
        .from("service_wallets")
        .select("id, service_name, total_sessions, consumed_sessions, status, created_at, invoice_id")
        .eq("customer_id", customer!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const { data: history } = useQuery({
    queryKey: ["cust-history", customer?.id, wallets?.length],
    enabled: !!customer && (wallets?.length ?? 0) > 0,
    queryFn: async () => {
      const ids = (wallets ?? []).map((w) => w.id);
      if (!ids.length) return [];
      const { data } = await supabase
        .from("wallet_redemptions")
        .select("id, wallet_id, redeemed_at, therapist_name, room_name, notes, is_initial")
        .in("wallet_id", ids)
        .order("redeemed_at", { ascending: false });
      return data ?? [];
    },
  });

  const [redeemFor, setRedeemFor] = useState<null | { id: string; service_name: string; remaining: number }>(null);


  async function save() {
    if (!form) return;
    const { error } = await supabase.from("customers").update({
      name: form.name, phone: form.phone, state_code: form.state_code, client_type: form.client_type,
      city: form.city?.trim() || null,
      age: form.age != null && String(form.age) !== "" ? Number(form.age) : null,
      gender: form.gender || null,
    }).eq("id", form.id);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
    qc.invalidateQueries({ queryKey: ["customers"] });
  }

  async function reprint(invoiceId: string) {
    const [{ data: inv }, { data: lines }] = await Promise.all([
      supabase.from("invoices").select("*").eq("id", invoiceId).single(),
      supabase.from("invoice_lines").select("*").eq("invoice_id", invoiceId),
    ]);
    if (!inv) return toast.error("Invoice not found");
    printTallyInvoice(
      {
        invoice_no: inv.invoice_no ?? "", invoice_date: inv.invoice_date, customer_name: inv.customer_name ?? "",
        customer_phone: form?.phone, customer_age: form?.age ?? null, state_code: inv.state_code ?? "", payment_mode: inv.payment_mode,
        tax_mode: inv.tax_mode, base_amount: Number(inv.base_amount),
        cgst: Number(inv.cgst), sgst: Number(inv.sgst), gross_total: Number(inv.gross_total),
        paid_amount: Number(inv.paid_amount), pending_balance: Number(inv.pending_balance),
        session_note: (lines ?? []).map((l) => l.session_label).filter(Boolean).join(" · ") || null,
      },
      (lines ?? []).map((l) => ({
        description: l.description, sac_code: l.sac_code, qty: Number(l.qty), base_amount: Number(l.base_amount),
        cgst: Number(l.cgst), sgst: Number(l.sgst), line_total: Number(l.line_total), session_label: l.session_label,
      })),
    );
  }

  /** Consolidated ledger: profile + billing history + session history + wallet balances. */
  function printStatement() {
    if (!customer) return;
    printMasterStatement({
      customer_name: customer.name,
      phone: form?.phone ?? customer.phone,
      age: form?.age ?? customer.age,
      client_type: form?.client_type ?? customer.client_type,
      gross: ledger?.gross ?? 0,
      outstanding: ledger?.due ?? 0,
      invoices: (ledger?.inv ?? []).map((i) => ({
        invoice_no: i.invoice_no, invoice_date: i.invoice_date,
        gross_total: Number(i.gross_total), payment_mode: i.payment_mode,
        paid_amount: Number(i.paid_amount), pending_balance: Number(i.pending_balance),
      })),
      sessions: (history ?? []).map((h, idx, arr) => {
        const w = wallets?.find((x) => x.id === h.wallet_id);
        // Session number counts chronologically within each wallet.
        const seq = arr.filter((r) => r.wallet_id === h.wallet_id && new Date(r.redeemed_at) <= new Date(h.redeemed_at)).length;
        return {
          service_name: w?.service_name ?? "Session",
          date: h.redeemed_at,
          session_number: seq,
          staff_name: h.therapist_name,
        };
      }),
      wallets: (wallets ?? []).map((w) => ({
        service_name: w.service_name,
        total_sessions: w.total_sessions,
        consumed_sessions: w.consumed_sessions,
        remaining: w.total_sessions - w.consumed_sessions,
      })),
    });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle>{customer?.name}</SheetTitle></SheetHeader>
        {customer && (ledger?.due ?? 0) > 0 && (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
            ⚠️ Outstanding Balance: {inr2(ledger?.due ?? 0)} — collect at check-in
          </div>
        )}
        {customer && (
          <div className="mt-3 border-b pb-3">
            <WorkflowTracker
              current={deriveWorkflowStage({
                hasConsultation: (rxList?.length ?? 0) > 0,
                hasPackage: ((ledger?.packages.length ?? 0) + (wallets?.length ?? 0)) > 0,
                hasSessions: ((ledger?.packages.length ?? 0) + (wallets?.length ?? 0)) > 0,
                hasInvoice: (ledger?.inv.length ?? 0) > 0,
                fullyPaid: (ledger?.inv.length ?? 0) > 0 && (ledger?.due ?? 0) <= 0,
              })}
              interactive={false}
            />
          </div>
        )}

        {form && (
          <div className="mt-4 space-y-6">
            {/* Segment A */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase text-primary">A · Profile</h4>
              <div className="space-y-2">
                <div className="space-y-1"><Label>Name</Label><Input value={form.name} disabled={!canEdit} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1"><Label>Phone</Label><Input value={form.phone ?? ""} disabled={!canEdit} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="space-y-1"><Label>City</Label><Input value={form.city ?? ""} disabled={!canEdit} placeholder="e.g. Jaipur" onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
                <div className="space-y-1">
                  <Label>State (Place of Supply)</Label>
                  <Select value={form.state_code} onValueChange={(v) => setForm({ ...form, state_code: v })} disabled={!canEdit}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{GST_STATES.map((s) => <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Age <span className="text-xs text-muted-foreground">(optional)</span></Label>
                    <Input type="number" min={0} value={form.age ?? ""} disabled={!canEdit} onChange={(e) => setForm({ ...form, age: e.target.value === "" ? null : Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Gender <span className="text-xs text-muted-foreground">(optional)</span></Label>
                    <Select value={form.gender ?? ""} onValueChange={(v) => setForm({ ...form, gender: v })} disabled={!canEdit}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>{["Male", "Female", "Other"].map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                {canEdit && <Button size="sm" className="mt-1" onClick={save}>Save Profile</Button>}
              </div>
            </section>

            {/* Segment B */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase text-primary">B · Treatment Logs</h4>
              {(ledger?.packages.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">No packages tracked.</p>
              ) : (
                <div className="space-y-2">
                  {ledger?.packages.map((p) => (
                    <div key={p.id} className="rounded-lg border p-2 text-sm">
                      <div className="flex justify-between font-medium">{p.package_name}<span>{p.sessions_completed}/{p.total_sessions}</span></div>
                      <div className="text-xs text-muted-foreground">Remaining: {inr2(Number(p.total_amount) - Number(p.paid_amount))}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Segment C */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase text-primary">C · Tally Client Ledger</h4>
              <div className="rounded-lg border">
                <div className="flex justify-between border-b p-2 text-sm"><span className="text-muted-foreground">Gross Invoiced</span><span className="font-semibold">{inr2(ledger?.gross ?? 0)}</span></div>
                {Object.entries(ledger?.byMode ?? {}).map(([m, v]) => (
                  <div key={m} className="flex justify-between border-b p-2 text-sm"><span className="text-muted-foreground">{m}</span><span>{inr2(v)}</span></div>
                ))}
                <div className="flex justify-between p-2 text-sm font-bold text-destructive"><span>Outstanding Dues</span><span>{inr2(ledger?.due ?? 0)}</span></div>
              </div>
              <div className="mt-3 space-y-1">
                <Button size="sm" variant="outline" className="mb-2 w-full" onClick={printStatement}>
                  <FileText className="mr-1 h-3.5 w-3.5" /> Print Master Statement (Consolidated Ledger)
                </Button>
                <p className="mb-1 text-[11px] text-muted-foreground">Click a bill to Print Selected Invoice.</p>
                {ledger?.inv.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => reprint(r.id)}
                    className="flex w-full items-center justify-between rounded px-1 py-1 text-xs text-muted-foreground hover:bg-accent/40"
                  >
                    <span className="flex items-center gap-1"><Printer className="h-3 w-3" /> {fmtDate(r.invoice_date)} · {r.invoice_no}</span>
                    <span>{inr2(Number(r.gross_total))}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Segment D · Service Wallet */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase text-primary">D · Service Wallet</h4>
              {(wallets?.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground">No multi-session packages active.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-left uppercase text-[10px] text-muted-foreground">
                      <tr>
                        <th className="p-2">Service</th>
                        <th className="p-2 text-center">Total</th>
                        <th className="p-2 text-center">Used</th>
                        <th className="p-2 text-center">Pending</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {wallets?.map((w) => {
                        const remaining = w.total_sessions - w.consumed_sessions;
                        return (
                          <tr key={w.id}>
                            <td className="p-2 font-medium">{w.service_name}</td>
                            <td className="p-2 text-center">{w.total_sessions}</td>
                            <td className="p-2 text-center">{w.consumed_sessions}</td>
                            <td className={`p-2 text-center font-semibold ${remaining > 0 ? "text-primary" : "text-muted-foreground"}`}>{remaining}</td>
                            <td className="p-2 text-right">
                              {canEdit && remaining > 0 && (
                                <Button size="sm" variant="outline" className="h-7"
                                  onClick={() => setRedeemFor({ id: w.id, service_name: w.service_name, remaining })}>
                                  <Wallet className="mr-1 h-3 w-3" /> Redeem
                                </Button>
                              )}
                              {remaining === 0 && <span className="text-[10px] uppercase text-muted-foreground">Completed</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Segment E · Visit / Session History */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase text-primary">E · Visit History</h4>
              {(history?.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground">No sessions logged yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-left uppercase text-[10px] text-muted-foreground">
                      <tr>
                        <th className="p-2">Date</th>
                        <th className="p-2">Service</th>
                        <th className="p-2">Therapist</th>
                        <th className="p-2">Room</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {history?.map((h) => {
                        const w = wallets?.find((x) => x.id === h.wallet_id);
                        return (
                          <tr key={h.id}>
                            <td className="p-2">{fmtDate(h.redeemed_at)}</td>
                            <td className="p-2">{w?.service_name ?? "—"}{h.is_initial && <span className="ml-1 rounded bg-muted px-1 text-[9px] uppercase">bill</span>}</td>
                            <td className="p-2">{h.therapist_name ?? "—"}</td>
                            <td className="p-2">{h.room_name ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h4 className="mb-2 text-sm font-semibold">Prescriptions</h4>
              {(!rxList || rxList.length === 0) && <p className="text-xs text-muted-foreground">No prescriptions on file.</p>}
              <div className="space-y-2">
                {rxList?.map((r) => (
                  <div key={r.id} className="rounded-lg border p-2">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">{fmtDate(r.created_at)}</span>
                      <Button size="sm" variant="outline" className="h-7" onClick={() => printPrescription({ patient_name: customer!.name, age: customer!.age, gender: customer!.gender, consultation_date: fmtDate(r.created_at), notes: r.prescription ?? "", suggested_services: r.counselor_notes ?? "" })}>
                        <Printer className="mr-1 h-3 w-3" /> Print Prescription
                      </Button>
                    </div>
                    <p className="whitespace-pre-wrap text-xs">{r.prescription}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </SheetContent>
      <WalletRedeemDialog
        open={!!redeemFor}
        initialWalletId={redeemFor?.id ?? null}
        patientName={customer?.name ?? ""}
        wallets={(wallets ?? []).map((w) => ({
          id: w.id, service_name: w.service_name,
          total_sessions: w.total_sessions, consumed_sessions: w.consumed_sessions,
          remaining: w.total_sessions - w.consumed_sessions,
        })).filter((w) => w.remaining > 0)}
        onClose={() => setRedeemFor(null)}
        onDone={() => {
          setRedeemFor(null);
          qc.invalidateQueries({ queryKey: ["cust-wallets", customer?.id] });
          qc.invalidateQueries({ queryKey: ["cust-history", customer?.id] });
          qc.invalidateQueries({ queryKey: ["active-wallets"] });
        }}
      />
    </Sheet>
  );
}
