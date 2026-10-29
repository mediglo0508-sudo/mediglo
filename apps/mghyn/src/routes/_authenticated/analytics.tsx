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
      { title: "Service Profitability — MediGlo Harmony ERP" },
      { name: "description", content: "Per-service net profitability with real-time therapist consumable cost and overhead allocation." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { isFinance } = useAuth();
  const { data } = useQuery({
    queryKey: ["profitability"],
    enabled: isFinance,
    queryFn: async () => {
      const [{ data: lines }, { data: services }, { data: cons }, { data: exp }] = await Promise.all([
        supabase.from("invoice_lines").select("description, base_amount, line_total, qty"),
        supabase.from("services_master").select("name, cost_estimate"),
        supabase.from("service_consumption").select("service_name, total_cost"),
        supabase.from("expenses").select("amount"),
      ]);
      const costMap = new Map(
        (services ?? []).map((s) => [s.name.trim().toLowerCase(), Number(s.cost_estimate)]),
      );
      const loggedCostMap = new Map<string, number>();
      for (const c of cons ?? []) {
        const key = (c.service_name ?? "").trim().toLowerCase();
        if (!key) continue;
        loggedCostMap.set(key, (loggedCostMap.get(key) ?? 0) + Number(c.total_cost));
      }

      const totalOverhead = (exp ?? []).reduce((s, r) => s + Number(r.amount), 0);

      const agg = new Map<string, { revenue: number; estCost: number; qty: number }>();
      for (const l of lines ?? []) {
        const k = (l.description ?? "Misc").trim();
        const cur = agg.get(k) ?? { revenue: 0, estCost: 0, qty: 0 };
        const rev = Number(l.line_total || l.base_amount || 0);
        const qty = Number(l.qty || 1);
        cur.revenue += rev;
        cur.qty += qty;
        const unitBomCost = costMap.get(k.toLowerCase()) ?? Math.round((rev / Math.max(1, qty)) * 0.14);
        cur.estCost += unitBomCost * qty;
        agg.set(k, cur);
      }
      const totalRev = [...agg.values()].reduce((s, v) => s + v.revenue, 0) || 1;
      const rows = [...agg.entries()]
        .map(([name, v]) => {
          const loggedCost = loggedCostMap.get(name.toLowerCase()) ?? 0;
          const productCost = Math.max(loggedCost, v.estCost);
          const overhead = (v.revenue / totalRev) * totalOverhead;
          const net = v.revenue - productCost - overhead;
          return {
            name,
            qty: v.qty,
            revenue: Math.round(v.revenue),
            productCost: Math.round(productCost),
            overhead: Math.round(overhead),
            net: Math.round(net),
            margin: v.revenue ? (net / v.revenue) * 100 : 0,
          };
        })
        .sort((a, b) => b.revenue - a.revenue);
      return { rows, totalOverhead, totalRev };
    },
  });

  if (!isFinance) return <AccessDenied />;
  const rows = data?.rows ?? [];

  return (
    <div>
      <PageHeader
        title="Per-Service Net Profitability"
        subtitle="Gross Revenue − Real-Time Injectable/Consumable Cost (Stream B) − Allocated Overhead."
      />
      <Card className="mb-4 p-5">
        <h2 className="mb-4 text-sm font-semibold">Top Services by Net Profit</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={rows.slice(0, 12)}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" hide />
            <YAxis stroke="var(--muted-foreground)" fontSize={12} />
            <Tooltip formatter={(v: number) => inr(v)} />
            <Bar dataKey="net" radius={[6, 6, 0, 0]}>
              {rows.slice(0, 12).map((r, i) => (
                <Cell key={i} fill={r.net >= 0 ? "var(--chart-2)" : "var(--destructive)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Service / Treatment</th>
                <th className="p-3 text-right">Sessions</th>
                <th className="p-3 text-right">Gross Revenue</th>
                <th className="p-3 text-right">Prod. Cost (Consumables)</th>
                <th className="p-3 text-right">Overhead</th>
                <th className="p-3 text-right">Net Profit</th>
                <th className="p-3 text-right">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.name} className="hover:bg-muted/30">
                  <td className="p-3 font-medium">{r.name}</td>
                  <td className="p-3 text-right text-muted-foreground">{r.qty}</td>
                  <td className="p-3 text-right font-medium">{inr(r.revenue)}</td>
                  <td className="p-3 text-right font-medium text-rose-700">{inr(r.productCost)}</td>
                  <td className="p-3 text-right text-muted-foreground">{inr(r.overhead)}</td>
                  <td className={`p-3 text-right font-bold ${r.net >= 0 ? "text-emerald-700" : "text-destructive"}`}>
                    {inr(r.net)}
                  </td>
                  <td className="p-3 text-right font-semibold">{r.margin.toFixed(1)}%</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    No sales data yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
