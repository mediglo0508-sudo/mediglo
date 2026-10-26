import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/gst";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Service Profitability — MGHYN Clinic ERP" },
      { name: "description", content: "Per-service net profitability with product cost and overhead allocation." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Service Profitability — MGHYN Clinic ERP" },
      { property: "og:description", content: "Per-service net profitability with product cost and overhead allocation." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/analytics" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/analytics" }],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { isFinance } = useAuth();
  const { data } = useQuery({
    queryKey: ["profitability"],
    enabled: isFinance,
    queryFn: async () => {
      const [{ data: lines }, { data: services }, { data: exp }] = await Promise.all([
        supabase.from("invoice_lines").select("description, base_amount, qty"),
        supabase.from("services_master").select("name, cost_estimate"),
        supabase.from("expenses").select("amount"),
      ]);
      const costMap = new Map((services ?? []).map((s) => [s.name, Number(s.cost_estimate)]));
      const totalOverhead = (exp ?? []).reduce((s, r) => s + Number(r.amount), 0);

      const agg = new Map<string, { revenue: number; productCost: number; qty: number }>();
      for (const l of lines ?? []) {
        const k = l.description;
        const cur = agg.get(k) ?? { revenue: 0, productCost: 0, qty: 0 };
        cur.revenue += Number(l.base_amount);
        cur.qty += Number(l.qty);
        cur.productCost += (costMap.get(k) ?? 0) * Number(l.qty);
        agg.set(k, cur);
      }
      const totalRev = [...agg.values()].reduce((s, v) => s + v.revenue, 0) || 1;
      const rows = [...agg.entries()].map(([name, v]) => {
        const overhead = (v.revenue / totalRev) * totalOverhead;
        const net = v.revenue - v.productCost - overhead;
        return { name, revenue: Math.round(v.revenue), productCost: Math.round(v.productCost), overhead: Math.round(overhead), net: Math.round(net), margin: v.revenue ? (net / v.revenue) * 100 : 0 };
      }).sort((a, b) => b.net - a.net);
      return { rows, totalOverhead, totalRev: totalRev - 1 + 1 };
    },
  });

  if (!isFinance) return <AccessDenied />;
  const rows = data?.rows ?? [];

  return (
    <div>
      <PageHeader title="Per-Service Net Profitability" subtitle="Gross Revenue − Product Cost − Allocated Overhead. Set service costs in the Services library." />
      <Card className="mb-4 p-5">
        <h2 className="mb-4 text-sm font-semibold">Top Services by Net Profit</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={rows.slice(0, 12)}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" hide />
            <YAxis stroke="var(--muted-foreground)" fontSize={12} />
            <Tooltip formatter={(v: number) => inr(v)} />
            <Bar dataKey="net" radius={[6, 6, 0, 0]}>
              {rows.slice(0, 12).map((r, i) => <Cell key={i} fill={r.net >= 0 ? "var(--chart-2)" : "var(--destructive)"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-3">Service</th><th className="p-3 text-right">Revenue</th><th className="p-3 text-right">Product Cost</th><th className="p-3 text-right">Overhead</th><th className="p-3 text-right">Net</th><th className="p-3 text-right">Margin</th></tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.name} className="hover:bg-muted/30">
                  <td className="p-3 font-medium">{r.name}</td>
                  <td className="p-3 text-right">{inr(r.revenue)}</td>
                  <td className="p-3 text-right">{inr(r.productCost)}</td>
                  <td className="p-3 text-right">{inr(r.overhead)}</td>
                  <td className={`p-3 text-right font-semibold ${r.net >= 0 ? "text-foreground" : "text-destructive"}`}>{inr(r.net)}</td>
                  <td className="p-3 text-right">{r.margin.toFixed(1)}%</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No sales data yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
