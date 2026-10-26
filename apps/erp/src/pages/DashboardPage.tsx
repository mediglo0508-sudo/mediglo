import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR, formatDate, todayIST, startOfMonthIST, istDateBoundaryToUtcISO } from "@/lib/utils";
import { useTodaysAppointments } from "@/hooks/useQueries";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, IndianRupee, Users, TrendingUp } from "lucide-react";

export default function DashboardPage() {
  const { access, user, hasRole, fullName } = useAuth();

  if (access?.can_view_finance) return <AdminOverview />;
  if (hasRole("doctor")) return <DoctorWorklist />;
  if (hasRole("reception", "pharmacist")) return <BillingConsoleSummary />;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Welcome{fullName ? `, ${fullName}` : ""}</h1>
      <p className="text-muted-foreground">Use the sidebar to get to your work area.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin / Accountant overview
// ---------------------------------------------------------------------------
function AdminOverview() {
  // "Today"/"this month" mean the clinic's own IST business day - comparing
  // a bare UTC calendar-date string directly against `created_at`
  // (timestamptz) drifts the cutoff by up to 5.5 hours, so both boundaries
  // are converted to the correct UTC instant first.
  const today = todayIST();
  const monthStart = startOfMonthIST();
  const todayStartUtc = istDateBoundaryToUtcISO(today);
  const monthStartUtc = istDateBoundaryToUtcISO(monthStart);

  const { data: todayInvoices } = useQuery({
    queryKey: ["dash_today_invoices", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("gross_total, payment_mode, status")
        .gte("created_at", todayStartUtc)
        .neq("status", "void");
      if (error) throw error;
      return data as { gross_total: number; payment_mode: string; status: string }[];
    },
  });

  const { data: monthInvoices } = useQuery({
    queryKey: ["dash_month_invoices", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("gross_total")
        .gte("created_at", monthStartUtc)
        .neq("status", "void");
      if (error) throw error;
      return data as { gross_total: number }[];
    },
  });

  const { data: profitability } = useQuery({
    queryKey: ["dash_profitability"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_profitability_view")
        .select("*")
        .order("month", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data as { service_name: string; net_profit: number; gross_revenue: number }[];
    },
  });

  const todayTotal = (todayInvoices ?? []).reduce((s, i) => s + Number(i.gross_total), 0);
  const monthTotal = (monthInvoices ?? []).reduce((s, i) => s + Number(i.gross_total), 0);
  const paymentSplit = (todayInvoices ?? []).reduce<Record<string, number>>((acc, i) => {
    acc[i.payment_mode] = (acc[i.payment_mode] ?? 0) + Number(i.gross_total);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin Overview</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={IndianRupee} label="Today's Gross Sales" value={formatINR(todayTotal)} />
        <StatCard icon={TrendingUp} label="This Month" value={formatINR(monthTotal)} />
        <StatCard icon={Users} label="Invoices Today" value={String(todayInvoices?.length ?? 0)} />
        <StatCard
          icon={CalendarClock}
          label="Cash vs Digital (today)"
          value={`${formatINR(paymentSplit["cash"] ?? 0)} / ${formatINR(
            Object.entries(paymentSplit).filter(([k]) => k !== "cash").reduce((s, [, v]) => s + v, 0)
          )}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Payment mode split (today)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(paymentSplit).length === 0 && <p className="text-sm text-muted-foreground">No sales yet today.</p>}
            {Object.entries(paymentSplit).map(([mode, amount]) => (
              <div key={mode} className="flex items-center justify-between text-sm">
                <span className="capitalize">{mode}</span>
                <span className="font-semibold">{formatINR(amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Per-service net profitability</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(profitability ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Not enough billing data yet to compute profitability.</p>
            )}
            {(profitability ?? []).map((row, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span>{row.service_name}</span>
                <span className={row.net_profit >= 0 ? "font-semibold text-success" : "font-semibold text-destructive"}>
                  {formatINR(row.net_profit)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Doctor worklist - clinical only, no financials (per the role brief)
// ---------------------------------------------------------------------------
function DoctorWorklist() {
  const { user } = useAuth();
  const { data: appointments } = useTodaysAppointments(user?.id);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Today's Worklist</h1>
      <Card>
        <CardContent className="p-0">
          {(appointments ?? []).length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No appointments assigned to you today.</p>
          ) : (
            <ul className="divide-y divide-border">
              {appointments!.map((a) => (
                <li key={a.id} className="flex items-center justify-between p-4">
                  <div>
                    <div className="font-medium">{a.service_name ?? "Consultation"}</div>
                    <div className="text-xs text-muted-foreground">{a.appointment_time} · {formatDate(a.appointment_date)}</div>
                  </div>
                  <Badge variant={a.status === "completed" ? "success" : a.status === "checked_in" ? "default" : "outline"}>
                    {a.status.replace("_", " ")}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Go to <strong>Doctor Room</strong> in the sidebar to check patients in and write structured prescriptions.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reception / Pharmacist quick summary
// ---------------------------------------------------------------------------
function BillingConsoleSummary() {
  const { data: appointments } = useTodaysAppointments();
  const checkedIn = (appointments ?? []).filter((a) => a.status === "checked_in" || a.status === "in_progress");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Front Desk</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={CalendarClock} label="Appointments today" value={String(appointments?.length ?? 0)} />
        <StatCard icon={Users} label="Currently in clinic" value={String(checkedIn.length)} />
        <StatCard icon={IndianRupee} label="Go to" value="POS / Billing" />
      </div>
    </div>
  );
}
