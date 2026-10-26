import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useState } from "react";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { getPerformanceMetrics } from "@/lib/performance.functions";
import { inr } from "@/lib/gst";
import { Download, Loader2, Sparkles, Megaphone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/performance")({
  component: PerformancePage,
  head: () => ({
    meta: [
      { title: "Performance Dashboard | Mediglo Clinic ERP" },
      { name: "description", content: "Live therapist and marketing team performance — sessions, treatment hours, bookings, conversions and revenue." },
      { property: "og:title", content: "Performance Dashboard | Mediglo Clinic ERP" },
      { property: "og:description", content: "Live therapist and marketing team performance metrics for the clinic." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/performance" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/performance" }],
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
        title="Performance Dashboard"
        subtitle="Live therapist & marketing metrics — computed from treatments, appointments, follow-ups and invoices."
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
            title="Therapist performance"
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
            title="Marketing team performance"
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
