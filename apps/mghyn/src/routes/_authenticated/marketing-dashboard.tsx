import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/marketing-dashboard")({
  head: () => ({
    meta: [
      { title: "Marketing Dashboard — MGHYN Clinic ERP" },
      { name: "description", content: "Lead sources, campaign conversions and marketing performance." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Marketing Dashboard — MGHYN Clinic ERP" },
      { property: "og:description", content: "Lead sources, campaign conversions and marketing performance." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/marketing-dashboard" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/marketing-dashboard" }],
  }),
  component: MarketingDashboard,
});

const COLORS = ["#2563eb", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

function MarketingDashboard() {
  const { roles } = useAuth();
  const allowed = roles.some((r) => ["admin", "marketing_admin", "marketing_head", "marketing"].includes(r));

  const { data: appts } = useQuery({
    queryKey: ["marketing-appts"],
    enabled: allowed,
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - 30);
      const { data } = await supabase
        .from("cos_appointments")
        .select("lead_source, status, appointment_date, booked_by")
        .gte("appointment_date", from.toISOString().slice(0, 10));
      return (data ?? []) as { lead_source: string | null; status: string | null; appointment_date: string; booked_by: string | null }[];
    },
  });

  // Resolve booked_by UUIDs to real staff names for team-wide visibility.
  const { data: staff } = useQuery({
    queryKey: ["marketing-staff"],
    enabled: allowed,
    queryFn: async () => {
      const { data } = await supabase
        .from("staff")
        .select("user_id, name")
        .not("user_id", "is", null);
      return (data ?? []) as { user_id: string; name: string }[];
    },
  });

  const staffName = useMemo(
    () => new Map((staff ?? []).map((s2) => [s2.user_id, s2.name])),
    [staff],
  );

  const bySource = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of appts ?? []) {
      const k = a.lead_source || "Unknown";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m, ([name, value]) => ({ name, value }));
  }, [appts]);

  const byBooker = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of appts ?? []) {
      const k = a.booked_by ? (staffName.get(a.booked_by) ?? "Staff") : "Unattributed";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [appts, staffName]);

  const conversion = useMemo(() => {
    let booked = 0, cancelled = 0, checkedOut = 0;
    for (const a of appts ?? []) {
      booked++;
      const s = (a.status ?? "").toLowerCase();
      if (s.includes("cancel")) cancelled++;
      else if (s.includes("out") || s.includes("complete")) checkedOut++;
    }
    return [
      { name: "Completed", value: checkedOut },
      { name: "Cancelled", value: cancelled },
      { name: "Other", value: Math.max(0, booked - checkedOut - cancelled) },
    ];
  }, [appts]);

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Marketing Dashboard" />
        <AccessDenied />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Marketing Dashboard"
        subtitle="Lead sources, appointment flow & follow-up conversion — last 30 days."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Appointments by Lead Source</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bySource}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value">
                  {bySource.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Outcome Split</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={conversion} dataKey="value" nameKey="name" outerRadius={90} label>
                  {conversion.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">Bookings by Marketing Team Member</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byBooker}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value">
                  {byBooker.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
