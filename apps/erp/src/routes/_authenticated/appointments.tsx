import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { useAuth } from "@/lib/auth";
import { SmartCalendar } from "@/components/SmartCalendar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet } from "lucide-react";
import { useAllPendingWallets } from "@/lib/wallet-alerts";
import { useState } from "react";
import { ClientTimelineDialog, type ClientTimelineTarget } from "@/components/ClientTimelineDialog";


export const Route = createFileRoute("/_authenticated/appointments")({
  head: () => ({
    meta: [
      { title: "Appointments — MGHYN Clinic ERP" },
      { name: "description", content: "Clinic appointment calendar with concurrency-aware slot booking." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Appointments — MGHYN Clinic ERP" },
      { property: "og:description", content: "Clinic appointment calendar with concurrency-aware slot booking." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/appointments" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/appointments" }],
  }),
  component: AppointmentsPage,
});

function AppointmentsPage() {
  const { canBilling, roles } = useAuth();
  const allowed = canBilling || roles.includes("marketing") || roles.includes("marketing_head") || roles.includes("marketing_admin") || roles.includes("doctor") || roles.includes("counselor");

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Smart Appointments" subtitle="Unified calendar & marketing scheduler." />
        <AccessDenied />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Smart Appointment Calendar"
        subtitle="Day · Week · Month views. Click an open slot to Quick Book. Color-coded by doctor, room and balance status."
      />
      <WalletBookingHint />
      <SmartCalendar />
    </div>
  );
}

/* Reminder banner: highlight clients with unredeemed wallet sessions so bookings redeem, not re-bill. */
function WalletBookingHint() {
  const { data: wallets } = useAllPendingWallets();
  const [target, setTarget] = useState<ClientTimelineTarget | null>(null);
  if (!wallets || wallets.length === 0) return null;
  const shown = wallets.slice(0, 6);
  return (
    <>
      <Card className="mb-4 border-emerald-500/40 bg-emerald-500/5 p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <Wallet className="h-4 w-4" /> Book against active wallets — {wallets.length} client{wallets.length === 1 ? "" : "s"} have prepaid sessions pending
        </p>
        <div className="flex flex-wrap gap-2">
          {shown.map((w) => (
            <button
              key={w.id}
              onClick={() => setTarget({ name: w.customer_name ?? "Client", phone: w.customer_phone })}
              className="rounded-full transition-transform hover:scale-[1.02]"
            >
              <Badge variant="outline" className="cursor-pointer border-emerald-500/40 text-emerald-700">
                {w.customer_name ?? "Client"} · {w.service_name} · {w.remaining} left
              </Badge>
            </button>
          ))}
          {wallets.length > shown.length && (
            <span className="text-xs text-muted-foreground">+{wallets.length - shown.length} more</span>
          )}
        </div>
        <p className="mt-2 text-[11px] italic text-muted-foreground">Click a client to see last visit, pending sessions and dues.</p>
      </Card>
      <ClientTimelineDialog target={target} onClose={() => setTarget(null)} />
    </>
  );
}

