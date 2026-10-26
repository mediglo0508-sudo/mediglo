// ============================================================================
// ClientTimelineDialog — interactive client 360 popover/drawer used by the
// wallet banners on Appointments and Reception Desk.
//   • Last treatment date + days elapsed
//   • Pending session breakdown across all active wallets
//   • Current outstanding financial dues
// ============================================================================
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate } from "@/lib/date-format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CalendarClock, Wallet, IndianRupee, Phone } from "lucide-react";

export interface ClientTimelineTarget {
  name: string;
  phone?: string | null;
}

interface Detail {
  lastTreatment: string | null;
  daysSince: number | null;
  wallets: { id: string; service_name: string; remaining: number; total: number; consumed: number }[];
  outstanding: number;
  phone: string | null;
}

function daysBetween(iso: string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}

export function useClientTimeline(name: string | null | undefined) {
  const key = (name ?? "").trim();
  return useQuery({
    queryKey: ["client-timeline", key.toLowerCase()],
    enabled: key.length > 1,
    staleTime: 30_000,
    queryFn: async (): Promise<Detail> => {
      const [walletRes, invRes, visitRes] = await Promise.all([
        supabase
          .from("service_wallets")
          .select("id, service_name, total_sessions, consumed_sessions, customer_phone, status")
          .ilike("customer_name", key)
          .eq("status", "active"),
        supabase
          .from("invoices")
          .select("invoice_date, pending_balance, voided_at")
          .ilike("customer_name", key),
        supabase
          .from("patient_visits")
          .select("scheduled_for, created_at, treatment_ended_at, status, phone")
          .ilike("customer_name", key)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      const walletRows = walletRes.data ?? [];
      const walletIds = walletRows.map((w) => w.id);
      let lastRedemption: string | null = null;
      if (walletIds.length) {
        const { data: reds } = await supabase
          .from("wallet_redemptions")
          .select("redeemed_at")
          .in("wallet_id", walletIds)
          .order("redeemed_at", { ascending: false })
          .limit(1);
        lastRedemption = reds?.[0]?.redeemed_at ?? null;
      }

      const visitDates = (visitRes.data ?? [])
        .map((v) => v.treatment_ended_at ?? v.scheduled_for ?? v.created_at)
        .filter(Boolean) as string[];
      const invoiceDates = (invRes.data ?? [])
        .filter((i) => !i.voided_at && i.invoice_date)
        .map((i) => i.invoice_date as string);

      const candidates = [lastRedemption, ...visitDates, ...invoiceDates].filter(Boolean) as string[];
      const lastTreatment = candidates.length
        ? candidates.reduce((a, b) => (new Date(a) > new Date(b) ? a : b))
        : null;

      const outstanding = (invRes.data ?? [])
        .filter((i) => !i.voided_at)
        .reduce((s, i) => s + Number(i.pending_balance || 0), 0);

      return {
        lastTreatment,
        daysSince: lastTreatment ? daysBetween(lastTreatment) : null,
        outstanding,
        phone: (visitRes.data ?? [])[0]?.phone ?? walletRows[0]?.customer_phone ?? null,
        wallets: walletRows
          .map((w) => ({
            id: w.id,
            service_name: w.service_name ?? "Service",
            total: Number(w.total_sessions) || 0,
            consumed: Number(w.consumed_sessions) || 0,
            remaining: Math.max(0, (Number(w.total_sessions) || 0) - (Number(w.consumed_sessions) || 0)),
          }))
          .filter((w) => w.remaining > 0),
      };
    },
  });
}

export function ClientTimelineDialog({
  target, onClose,
}: { target: ClientTimelineTarget | null; onClose: () => void }) {
  const { data, isLoading } = useClientTimeline(target?.name);
  const phone = target?.phone ?? data?.phone ?? null;

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate">{target?.name ?? "Client"}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            {phone && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-3.5 w-3.5" /> {phone}
              </p>
            )}

            <div className="rounded-lg border p-3">
              <p className="mb-1 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" /> Last treatment session
              </p>
              {data?.lastTreatment ? (
                <p>
                  <span className="font-semibold">{fmtDate(data.lastTreatment)}</span>
                  <span className="ml-2 text-muted-foreground">
                    · {data.daysSince} day{data.daysSince === 1 ? "" : "s"} elapsed
                  </span>
                </p>
              ) : (
                <p className="text-muted-foreground">No treatment history recorded.</p>
              )}
            </div>

            <div className="rounded-lg border p-3">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" /> Pending sessions & wallet balance
              </p>
              {data && data.wallets.length > 0 ? (
                <ul className="space-y-1.5">
                  {data.wallets.map((w) => (
                    <li key={w.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{w.service_name}</span>
                      <Badge variant="secondary" className="shrink-0">
                        {w.remaining} of {w.total} left
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No active wallet sessions.</p>
              )}
            </div>

            <div className="rounded-lg border p-3">
              <p className="mb-1 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <IndianRupee className="h-3.5 w-3.5" /> Outstanding dues
              </p>
              <p className={`text-lg font-bold ${(data?.outstanding ?? 0) > 0 ? "text-destructive" : "text-emerald-600"}`}>
                ₹{(data?.outstanding ?? 0).toFixed(2)}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
