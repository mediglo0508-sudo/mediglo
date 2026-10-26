import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { NumberInput } from "@/components/ui/number-input";
import { Autocomplete } from "@/components/ui/autocomplete";
import { inr2, round2 } from "@/lib/gst";
import { useRealtimeSync } from "@/lib/realtime";
import { invalidateLedger } from "@/lib/ledger-cache";
import { logTreatmentSessions } from "@/lib/wallet-redeem";
import { SessionHistoryDialog } from "@/components/SessionHistoryDialog";
import { toast } from "sonner";
import { PackagePlus, Loader2, Trash2, IndianRupee, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/packages")({
  head: () => ({
    meta: [
      { title: "Packages — MGHYN Clinic ERP" },
      { name: "description", content: "Package sales, session wallets and redemption ledger." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Packages — MGHYN Clinic ERP" },
      { property: "og:description", content: "Package sales, session wallets and redemption ledger." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/packages" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/packages" }],
  }),
  component: PackagesPage,
});

type Filter = "active" | "completed" | "all";

/** One unified Package Master row, sourced from packages, wallets or open dues. */
interface MasterRow {
  key: string;
  source: "package" | "wallet" | "balance";
  id: string;
  client: string;
  phone: string | null;
  packageName: string;
  totalSessions: number;
  remaining: number;
  paid: number;
  outstanding: number;
}

function PackagesPage() {
  const { canBilling } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [client, setClient] = useState("");
  const [pkgName, setPkgName] = useState("");
  const [details, setDetails] = useState("");
  const [totalSessions, setTotalSessions] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [paid, setPaid] = useState(0);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<Filter>("active");
  const [busy, setBusy] = useState<string | null>(null);
  const [backdate, setBackdate] = useState<{ client: string; service: string; count: number } | null>(null);
  const [loggingHistory, setLoggingHistory] = useState(false);

  useRealtimeSync(["treatment_packages", "service_wallets", "wallet_redemptions"], ["package-master"]);

  const { data: services } = useQuery({
    queryKey: ["services-pkg"],
    queryFn: async () => (await supabase.from("services_master").select("name, default_price").eq("active", true).order("name")).data ?? [],
  });

  // Live Package Master: treatment packages + pre-paid service wallets + any
  // client carrying an open balance. Voided invoices never feed these numbers
  // (customers.outstanding_balance is maintained by the ledger triggers).
  const { data: masterRows, isFetching } = useQuery({
    queryKey: ["package-master"],
    queryFn: async (): Promise<MasterRow[]> => {
      const [pkgRes, walletRes, custRes] = await Promise.all([
        supabase.from("treatment_packages").select("*").order("client_name"),
        supabase
          .from("service_wallets")
          .select("id, customer_name, customer_phone, service_name, total_sessions, consumed_sessions, status, invoice_id")
          .order("created_at", { ascending: false }),
        supabase.from("customers").select("id, name, phone, outstanding_balance").gt("outstanding_balance", 0),
      ]);

      const customers = custRes.data ?? [];
      const byName = new Map(customers.map((c) => [c.name.trim().toLowerCase(), c]));

      const walletRows = walletRes.data ?? [];
      const invIds = walletRows.map((w) => w.invoice_id).filter(Boolean) as string[];
      const invMap = new Map<string, { paid: number; pending: number }>();
      if (invIds.length) {
        const { data: invs } = await supabase
          .from("invoices")
          .select("id, paid_amount, pending_balance")
          .in("id", invIds)
          .is("voided_at", null);
        for (const i of invs ?? []) invMap.set(i.id, { paid: Number(i.paid_amount ?? 0), pending: Number(i.pending_balance ?? 0) });
      }

      const rows: MasterRow[] = [];
      const seenClients = new Set<string>();

      for (const p of pkgRes.data ?? []) {
        const name = (p.client_name ?? "").trim();
        const cust = byName.get(name.toLowerCase());
        seenClients.add(name.toLowerCase());
        rows.push({
          key: `pkg-${p.id}`,
          source: "package",
          id: p.id,
          client: name || "—",
          phone: cust?.phone ?? null,
          packageName: p.package_name + (p.package_details ? ` · ${p.package_details}` : ""),
          totalSessions: Number(p.total_sessions || 0),
          remaining: Math.max(0, Number(p.total_sessions || 0) - Number(p.sessions_completed || 0)),
          paid: Number(p.paid_amount || 0),
          outstanding: round2(Math.max(0, Number(p.total_amount || 0) - Number(p.paid_amount || 0))),
        });
      }

      for (const w of walletRows) {
        const name = (w.customer_name ?? "").trim();
        seenClients.add(name.toLowerCase());
        const inv = w.invoice_id ? invMap.get(w.invoice_id) : undefined;
        rows.push({
          key: `wal-${w.id}`,
          source: "wallet",
          id: w.id,
          client: name || "—",
          phone: w.customer_phone ?? byName.get(name.toLowerCase())?.phone ?? null,
          packageName: `${w.service_name} (pre-paid wallet)`,
          totalSessions: Number(w.total_sessions || 0),
          remaining: Math.max(0, Number(w.total_sessions || 0) - Number(w.consumed_sessions || 0)),
          paid: inv?.paid ?? 0,
          outstanding: round2(inv?.pending ?? 0),
        });
      }

      // Clients with an open balance but no package/wallet row still belong here.
      for (const c of customers) {
        if (seenClients.has(c.name.trim().toLowerCase())) continue;
        rows.push({
          key: `bal-${c.id}`,
          source: "balance",
          id: c.id,
          client: c.name,
          phone: c.phone,
          packageName: "Outstanding balance",
          totalSessions: 0,
          remaining: 0,
          paid: 0,
          outstanding: round2(Number(c.outstanding_balance || 0)),
        });
      }

      // Only clients with something live: sessions left or money owed.
      return rows.filter((r) => r.remaining > 0 || r.outstanding > 0 || r.totalSessions > 0);
    },
  });

  const rows = useMemo(() => {
    const all = masterRows ?? [];
    if (filter === "active") return all.filter((r) => r.remaining > 0 || r.outstanding > 0);
    if (filter === "completed") return all.filter((r) => r.remaining === 0 && r.outstanding === 0);
    return all;
  }, [masterRows, filter]);

  const remaining = useMemo(() => Math.max(0, (totalSessions || 0) - (completed || 0)), [totalSessions, completed]);
  const outstanding = useMemo(() => round2(Math.max(0, (totalAmount || 0) - (paid || 0))), [totalAmount, paid]);

  async function save() {
    if (!client.trim()) return toast.error("Enter client name");
    if (!pkgName.trim()) return toast.error("Pick or enter a package/service");
    setSaving(true);
    const { error } = await supabase.from("treatment_packages").insert({
      client_name: client.trim(),
      package_name: pkgName.trim(),
      package_details: details || null,
      total_sessions: totalSessions,
      sessions_completed: completed,
      total_amount: totalAmount,
      paid_amount: paid,
      pending_amount: outstanding,
      status: remaining === 0 ? "Completed" : "Booked",
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Package saved");
    // Back-dated package: capture the real date of every completed session so the
    // client's treatment history is accurate, not lumped onto the entry date.
    if (completed > 0) setBackdate({ client: client.trim(), service: pkgName.trim(), count: completed });
    setClient(""); setPkgName(""); setDetails(""); setTotalSessions(0); setCompleted(0); setTotalAmount(0); setPaid(0);
    qc.invalidateQueries({ queryKey: ["package-master"] });
  }

  async function saveSessionHistory(dates: string[]) {
    if (!backdate) return;
    setLoggingHistory(true);
    try {
      await logTreatmentSessions({
        patientName: backdate.client,
        treatment: backdate.service,
        dates,
      });
      toast.success(`${dates.length} historical session record(s) saved`);
      setBackdate(null);
      qc.invalidateQueries({ queryKey: ["cust-history"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save session history");
    } finally {
      setLoggingHistory(false);
    }
  }


  async function remove(row: MasterRow) {
    if (row.source !== "package") return;
    const { error } = await supabase.from("treatment_packages").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["package-master"] });
  }

  /** Quick redeem — wallets log a redemption, packages tick a completed session. */
  async function redeem(row: MasterRow) {
    if (row.remaining <= 0) return toast.error("No sessions remaining");
    setBusy(row.key);
    try {
      if (row.source === "wallet") {
        const { error } = await supabase.from("wallet_redemptions").insert({
          wallet_id: row.id,
          notes: "Redeemed from Package Master",
        });
        if (error) throw error;
      } else if (row.source === "package") {
        const { error } = await supabase
          .from("treatment_packages")
          .update({
            sessions_completed: row.totalSessions - row.remaining + 1,
            status: row.remaining - 1 === 0 ? "Completed" : "Booked",
          })
          .eq("id", row.id);
        if (error) throw error;
      }
      toast.success(`Session redeemed for ${row.client}`);
      qc.invalidateQueries({ queryKey: ["package-master"] });
      invalidateLedger(qc);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to redeem session");
    } finally {
      setBusy(null);
    }
  }

  /** Collect due — hands the client off to POS with their details prefilled. */
  function collect(row: MasterRow) {
    const params = new URLSearchParams({ name: row.client });
    if (row.phone) params.set("phone", row.phone);
    navigate({ to: `/pos?${params.toString()}` as never });
  }

  if (!canBilling) return <AccessDenied />;

  return (
    <div>
      <PageHeader
        title="Package Master List"
        subtitle="Live package, pre-paid wallet & outstanding-due ledger · remaining sessions and balances refresh automatically"
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><PackagePlus className="h-4 w-4" /> New / Back-Data Package</h3>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Client Name</Label><Input value={client} onChange={(e) => setClient(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Package / Service</Label>
              <Autocomplete
                value={pkgName}
                placeholder={pkgName || "Search services…"}
                searchPlaceholder="Type e.g. Glow, Hydra, Laser…"
                emptyText="No service — type will still save."
                options={(services ?? []).map((s) => ({ value: s.name, label: s.name, sublabel: s.default_price ? inr2(Number(s.default_price)) : undefined }))}
                onSelect={(o) => { setPkgName(o.value); const s = services?.find((x) => x.name === o.value); if (s?.default_price) setTotalAmount(Number(s.default_price)); }}
              />
              <Input className="mt-1" placeholder="…or type a custom package name" value={pkgName} onChange={(e) => setPkgName(e.target.value)} />
            </div>
            <div className="space-y-1.5"><Label>Details / Notes</Label><Input value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Optional" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Total Sessions</Label><NumberInput value={totalSessions} onValueChange={setTotalSessions} /></div>
              <div className="space-y-1.5"><Label>Sessions Done</Label><NumberInput value={completed} onValueChange={setCompleted} /></div>
            </div>
            <div className="rounded-md bg-muted/50 p-2 text-sm">Remaining Sessions: <span className="font-semibold">{remaining}</span></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Total Cost</Label><NumberInput value={totalAmount} onValueChange={setTotalAmount} /></div>
              <div className="space-y-1.5"><Label>Paid To Date</Label><NumberInput value={paid} onValueChange={setPaid} /></div>
            </div>
            <div className="rounded-md bg-destructive/5 p-2 text-sm text-destructive">Outstanding Balance: <span className="font-semibold">{inr2(outstanding)}</span></div>
            <Button className="w-full" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackagePlus className="mr-2 h-4 w-4" />} Save Package
            </Button>
          </div>
        </Card>

        <Card className="p-0 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <h3 className="mr-auto text-sm font-semibold">Package Master ({rows.length}){isFetching && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}</h3>
            {(["active", "completed", "all"] as Filter[]).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="capitalize">
                {f === "all" ? "All Packages" : `${f} Packages`}
              </Button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Client</th>
                  <th className="p-3">Package / Service</th>
                  <th className="p-3 text-right">Sessions</th>
                  <th className="p-3 text-right">Remaining</th>
                  <th className="p-3 text-right">Paid</th>
                  <th className="p-3 text-right">Outstanding</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.key} className="hover:bg-muted/30">
                    <td className="p-3 font-medium">
                      {r.client}
                      {r.phone && <span className="block text-xs font-normal text-muted-foreground">{r.phone}</span>}
                    </td>
                    <td className="p-3">{r.packageName}</td>
                    <td className="p-3 text-right">{r.totalSessions || "—"}</td>
                    <td className="p-3 text-right"><Badge variant={r.remaining === 0 ? "secondary" : "default"}>{r.remaining}</Badge></td>
                    <td className="p-3 text-right">{inr2(r.paid)}</td>
                    <td className={`p-3 text-right font-medium ${r.outstanding > 0 ? "text-destructive" : ""}`}>{inr2(r.outstanding)}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        {r.remaining > 0 && r.source !== "balance" && (
                          <Button size="sm" variant="outline" disabled={busy === r.key} onClick={() => redeem(r)}>
                            {busy === r.key ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />} Redeem
                          </Button>
                        )}
                        {r.outstanding > 0 && (
                          <Button size="sm" onClick={() => collect(r)}>
                            <IndianRupee className="mr-1 h-3.5 w-3.5" /> Collect
                          </Button>
                        )}
                        {r.source === "package" && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">{isFetching ? "Loading…" : "No packages, wallets or dues in this filter."}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <SessionHistoryDialog
        open={!!backdate}
        count={backdate?.count ?? 0}
        serviceName={backdate?.service ?? ""}
        patientName={backdate?.client ?? ""}
        saving={loggingHistory}
        onCancel={() => setBackdate(null)}
        onConfirm={saveSessionHistory}
      />
    </div>
  );
}
