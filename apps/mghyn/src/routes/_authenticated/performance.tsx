import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { getPerformanceMetrics } from "@/lib/performance.functions";
import { inr } from "@/lib/gst";
import { Download, Loader2, Sparkles, Megaphone, Stethoscope, HeartHandshake } from "lucide-react";

export const Route = createFileRoute("/_authenticated/performance")({
  component: PerformancePage,
  head: () => ({
    meta: [
      { title: "Staff & Conversion Performance | MediGlo Harmony ERP" },
      { name: "description", content: "Live Doctor, Counselor, Therapist and Marketing conversion funnel & performance metrics." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const WINDOWS = [7, 30, 90] as const;

function toCsv(headers: string[], rows: (string | number)[][], filename: string) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function PerformancePage() {
  const { roles } = useAuth();
  const fetchMetrics = useServerFn(getPerformanceMetrics);
  const [win, setWin] = useState<number>(30);

  const allowed = roles.some((r) =>
    ["admin", "director", "accountant", "marketing_head", "marketing", "therapist", "doctor", "counselor"].includes(r),
  );

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["perf", win],
    enabled: allowed,
    staleTime: 30_000,
    queryFn: () => fetchMetrics({ data: { windowDays: win } }),
  });

  // Module 3 Step 3: Side-by-Side Clinical & Counselor Conversion Funnel
  const { data: conversionData } = useQuery({
    queryKey: ["clinical-counselor-conversion", win],
    enabled: allowed,
    queryFn: async () => {
      const fromDate = new Date(Date.now() - win * 86400_000).toISOString().slice(0, 10);
      const [{ data: appts }, { data: visits }, { data: quotes }, { data: invoices }] = await Promise.all([
        supabase.from("appointments").select("id, status").gte("appointment_date", fromDate),
        supabase.from("patient_visits").select("id, status, seen_doctor, counselor_slot, assigned_staff, area_of_interest"),
        supabase.from("counselor_quotations").select("id, counselor_id, customer_name, net_total, status"),
        supabase.from("invoices").select("id, assigned_staff, gross_total, paid_amount").is("voided_at", null).gte("invoice_date", fromDate),
      ]);

      const totalAppointments = (appts ?? []).length;
      const visitList = visits ?? [];
      const doctorConsultsDone = visitList.filter((v: any) => v.seen_doctor || ["doctor", "counselor", "treatment", "billing", "completed"].includes(v.status)).length;
      const counselingSessionsDone = visitList.filter((v: any) => v.counselor_slot || ["counselor", "treatment", "billing", "completed"].includes(v.status)).length + (quotes ?? []).length;
      const convertedInvoices = (invoices ?? []).length;

      // Staff-wise conversion breakdown
      const byStaff = new Map<string, { name: string; suggested: number; converted: number; revenue: number }>();
      for (const i of invoices ?? []) {
        const staffName = (i.assigned_staff || "Clinic Team").trim();
        const cur = byStaff.get(staffName) ?? { name: staffName, suggested: 0, converted: 0, revenue: 0 };
        cur.converted += 1;
        cur.suggested += 1;
        cur.revenue += Number(i.paid_amount || i.gross_total || 0);
        byStaff.set(staffName, cur);
      }
      for (const v of visitList) {
        const staffName = (v.assigned_staff || "Simran").trim();
        const cur = byStaff.get(staffName) ?? { name: staffName, suggested: 0, converted: 0, revenue: 0 };
        cur.suggested += 1;
        byStaff.set(staffName, cur);
      }

      const staffConversion = [...byStaff.values()]
        .map((s) => ({
          ...s,
          suggested: Math.max(s.suggested, s.converted),
          rate: Math.round((s.converted / Math.max(1, Math.max(s.suggested, s.converted))) * 100),
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      return {
        totalAppointments,
        doctorConsultsDone,
        counselingSessionsDone,
        convertedInvoices,
        staffConversion,
      };
    },
  });

  const exportTherapists = useCallback(() => {
    if (!data) return;
    toCsv(
      ["Therapist", "Clients handled", "Sessions", "Treatment minutes", "Avg minutes"],
      data.therapists.map((t) => [t.name, t.clients, t.sessions, t.minutes, t.avg_minutes]),
      `therapist-performance-${win}d.csv`,
    );
  }, [data, win]);

  const exportMarketing = useCallback(() => {
    if (!data) return;
    toCsv(
      ["Team member", "Follow-ups completed", "Appointments booked", "Arrived", "Conversion %", "Revenue"],
      data.marketing.map((m) => [m.name, m.followups_done, m.booked, m.arrived, m.conversion_pct, m.revenue]),
      `marketing-performance-${win}d.csv`,
    );
  }, [data, win]);

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Performance Dashboard" subtitle="Team-wide performance metrics" />
        <AccessDenied />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Staff & Clinical Conversion Performance Dashboard"
        subtitle="Appointments → Doctor Consultations → Counseling Quotations → Purchased Packages & Therapist Productivity."
      />
      <div className="flex flex-wrap items-center gap-2">
        {WINDOWS.map((w) => (
          <Button key={w} size="sm" variant={win === w ? "default" : "outline"} onClick={() => setWin(w)}>
            Last {w} days
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
        </Button>
      </div>

      {/* Module 3 Step 3: Side-by-Side Comparison & Conversion Funnel */}
      <Card className="border-primary/20 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
          <Stethoscope className="h-4 w-4 text-primary" />
          Side-by-Side Clinical & Counselor Conversion Funnel (Last {win} Days)
        </h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="1. Total Appointments" value={String(conversionData?.totalAppointments ?? 0)} />
          <StatCard label="2. Doctor Consultations Done" value={String(conversionData?.doctorConsultsDone ?? 0)} />
          <StatCard label="3. Counseling Sessions Done" value={String(conversionData?.counselingSessionsDone ?? 0)} />
          <StatCard label="4. Purchased / Billed Conversions" value={String(conversionData?.convertedInvoices ?? 0)} />
        </div>

        {(conversionData?.staffConversion ?? []).length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 text-left">Doctor / Counselor / Staff</th>
                  <th className="text-right">Suggested / Pitch Count</th>
                  <th className="text-right">Purchased / Converted Bills</th>
                  <th className="text-right">Conversion Rate (%)</th>
                  <th className="text-right">Converted Revenue</th>
                </tr>
              </thead>
              <tbody>
                {(conversionData?.staffConversion ?? []).map((s) => (
                  <tr key={s.name} className="border-t">
                    <td className="py-1.5 font-medium">{s.name}</td>
                    <td className="text-right">{s.suggested}</td>
                    <td className="text-right">{s.converted}</td>
                    <td className="text-right">
                      <Badge variant="secondary">{s.rate}%</Badge>
                    </td>
                    <td className="text-right font-semibold">{inr(s.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isLoading || !data ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Invoices" value={String(data.invoices.count)} />
            <StatCard label="Gross Revenue" value={inr(data.invoices.total_gross)} />
            <StatCard label="Collected" value={inr(data.invoices.total_paid)} />
            <StatCard label="Pending" value={inr(data.invoices.total_pending)} />
            <StatCard label="Visits" value={String(data.visits.total)} />
            <StatCard label="Completed Visits" value={String(data.visits.completed)} />
            <StatCard label="In Progress" value={String(data.visits.in_progress)} />
            <StatCard label="Your Role" value={data.role} />
          </div>

          <Section
            title="Therapist Floor Productivity & Duration Tracking"
            icon={<Sparkles className="h-4 w-4 text-primary" />}
            onExport={exportTherapists}
          >
            {data.therapists.length === 0 ? (
              <Empty text="No therapists on the roster for this window." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2 text-left">Therapist</th>
                      <th className="text-right">Clients handled</th>
                      <th className="text-right">Sessions</th>
                      <th className="text-right">Treatment time</th>
                      <th className="text-right">Avg / session</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.therapists.map((r) => (
                      <tr key={`${r.staff_id ?? r.name}`} className="border-t">
                        <td className="py-1.5 capitalize">{r.name}</td>
                        <td className="text-right">{r.clients}</td>
                        <td className="text-right">{r.sessions}</td>
                        <td className="text-right">{fmtMinutes(r.minutes)}</td>
                        <td className="text-right">{r.avg_minutes} min</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section
            title="Marketing & Lead Conversion Performance"
            icon={<Megaphone className="h-4 w-4 text-primary" />}
            onExport={exportMarketing}
          >
            {data.marketing.length === 0 ? (
              <Empty text="No marketing team activity for this window." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2 text-left">Team member</th>
                      <th className="text-right">Follow-ups done</th>
                      <th className="text-right">Booked</th>
                      <th className="text-right">Arrived</th>
                      <th className="text-right">Conversion</th>
                      <th className="text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.marketing.map((r) => (
                      <tr key={`${r.staff_id ?? r.name}`} className="border-t">
                        <td className="py-1.5 capitalize">{r.name}</td>
                        <td className="text-right">{r.followups_done}</td>
                        <td className="text-right">{r.booked}</td>
                        <td className="text-right">{r.arrived}</td>
                        <td className="text-right">{r.conversion_pct}%</td>
                        <td className="text-right font-medium">{inr(r.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function fmtMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-4 text-sm text-muted-foreground">{text}</p>;
}

function Section({ title, icon, onExport, children }: {
  title: string;
  icon?: React.ReactNode;
  onExport?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</h3>
        {onExport && (
          <Button size="sm" variant="outline" onClick={onExport}>
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
        )}
      </div>
      {children}
    </Card>
  );
}
