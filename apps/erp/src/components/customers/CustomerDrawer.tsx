import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import type { Customer, ServiceWallet, Invoice } from "@/types/domain";

interface Props {
  customerId: string | null;
  onClose: () => void;
}

/**
 * Module 13 - drill-down: Profile / Treatment logs / Tally client ledger,
 * opened by double-click (or Enter) from the customer list.
 */
export function CustomerDrawer({ customerId, onClose }: Props) {
  const { access, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [redeemingId, setRedeemingId] = useState<string | null>(null);

  const canRedeemSessions = hasRole("admin", "therapist", "doctor", "reception");

  async function handleRedeemSession(walletId: string) {
    setRedeemingId(walletId);
    try {
      const { error } = await supabase.rpc("redeem_wallet_session", { p_wallet_id: walletId });
      if (error) throw error;
      toast.success("Session marked as used");
      queryClient.invalidateQueries({ queryKey: ["customer_wallets", customerId] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to record session");
    } finally {
      setRedeemingId(null);
    }
  }

  const { data: customer } = useQuery({
    queryKey: ["customer_profile", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", customerId).single();
      if (error) throw error;
      return data as Customer;
    },
  });

  const { data: wallets } = useQuery({
    queryKey: ["customer_wallets", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_wallets")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ServiceWallet[];
    },
  });

  const { data: invoices } = useQuery({
    queryKey: ["customer_invoices", customerId],
    // invoices_select RLS permits admin/accountant/reception/pharmacist
    // (mirrored by access.can_bill), not just finance roles - gating this on
    // can_view_finance (admin/accountant only) hid the ledger tab from
    // reception/pharmacist even though RLS already lets them see it.
    enabled: !!customerId && access?.can_bill,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("customer_id", customerId)
        .neq("status", "void")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Invoice[];
    },
  });

  const grossInvoiced = (invoices ?? []).reduce((s, i) => s + Number(i.gross_total), 0);
  const totalPaid = (invoices ?? []).reduce((s, i) => s + Number(i.amount_paid), 0);
  const outstanding = grossInvoiced - totalPaid;
  const byMode = (invoices ?? []).reduce<Record<string, number>>((acc, i) => {
    acc[i.payment_mode] = (acc[i.payment_mode] ?? 0) + Number(i.gross_total);
    return acc;
  }, {});

  return (
    <Dialog open={!!customerId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        {!customer ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{customer.name}</DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="profile">
              <TabsList>
                <TabsTrigger value="profile">Profile</TabsTrigger>
                <TabsTrigger value="treatments">Treatment Logs</TabsTrigger>
                {access?.can_bill && <TabsTrigger value="ledger">Client Ledger</TabsTrigger>}
              </TabsList>

              <TabsContent value="profile" className="grid grid-cols-2 gap-4">
                <Field label="Phone" value={customer.phone} />
                <Field label="Email" value={customer.email ?? "-"} />
                <Field label="Gender" value={customer.gender ?? "-"} />
                <Field label="Age" value={customer.age?.toString() ?? "-"} />
                <Field label="City" value={customer.city ?? "-"} />
                <Field label="State (POS)" value={customer.state_code ?? "-"} />
                <div className="col-span-2">
                  <Field label="Address" value={customer.address ?? "-"} />
                </div>
                <div className="col-span-2">
                  <Field label="Notes" value={customer.notes ?? "-"} />
                </div>
              </TabsContent>

              <TabsContent value="treatments" className="space-y-2">
                {(wallets ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No packages/sessions on record.</p>
                ) : (
                  wallets!.map((w) => (
                    <div key={w.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                      <div>
                        <div className="font-medium">{w.service_name}</div>
                        <div className="text-xs text-muted-foreground">
                          Session {w.consumed_sessions} of {w.total_sessions} completed
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={w.status === "active" ? "default" : w.status === "exhausted" ? "secondary" : "outline"}>
                          {w.status}
                        </Badge>
                        {canRedeemSessions && w.status === "active" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={redeemingId === w.id}
                            onClick={() => handleRedeemSession(w.id)}
                          >
                            {redeemingId === w.id ? "Saving..." : "Mark Session Used"}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              {access?.can_bill && (
                <TabsContent value="ledger" className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <LedgerStat label="Gross Invoiced" value={formatINR(grossInvoiced)} />
                    <LedgerStat label="Total Paid" value={formatINR(totalPaid)} />
                    <LedgerStat label="Outstanding Dues" value={formatINR(outstanding)} highlight={outstanding > 0} />
                  </div>

                  <div>
                    <div className="mb-2 text-sm font-semibold">Payment mode breakdown</div>
                    <div className="space-y-1">
                      {Object.entries(byMode).map(([mode, amt]) => (
                        <div key={mode} className="flex justify-between text-sm">
                          <span className="capitalize">{mode}</span>
                          <span className="font-medium">{formatINR(amt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-sm font-semibold">Recent invoices</div>
                    <div className="max-h-48 space-y-1 overflow-y-auto">
                      {(invoices ?? []).slice(0, 15).map((inv) => (
                        <div key={inv.id} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {inv.invoice_no} · {formatDate(inv.created_at)}
                          </span>
                          <span className="font-medium">{formatINR(inv.gross_total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function LedgerStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold ${highlight ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}
