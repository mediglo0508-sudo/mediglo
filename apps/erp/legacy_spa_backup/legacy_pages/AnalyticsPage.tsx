import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatINR, cn } from "@/lib/utils";
import type { ServiceMaster } from "@/types/domain";
import { Trophy, TrendingUp, Settings2, Trash2 } from "lucide-react";

interface ServiceProfitabilityRow {
  service_id: string;
  service_name: string;
  month: string;
  gross_revenue: number;
  product_cost: number;
  allocated_overhead: number;
  net_profit: number;
}

interface StaffPerformanceRow {
  staff_id: string;
  staff_name: string;
  month: string;
  invoice_count: number;
  revenue_generated: number;
  incentive_earned: number;
}

interface IncentiveRule {
  id: string;
  staff_id: string;
  service_id: string | null;
  incentive_percent: number;
  incentive_flat: number;
  active: boolean;
  created_at: string;
  staff_profiles: { full_name: string } | null;
  services_master: { name: string } | null;
}

interface StaffOption {
  user_id: string;
  full_name: string;
}

/** "2026-09" style key for a month, used for grouping and the <input type="month"> value. */
function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export default function AnalyticsPage() {
  const { access } = useAuth();

  const { data: profitability } = useQuery({
    queryKey: ["service_profitability_view"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_profitability_view")
        .select("*")
        .order("month", { ascending: false })
        .order("net_profit", { ascending: false });
      if (error) throw error;
      return data as ServiceProfitabilityRow[];
    },
  });

  const { data: performance } = useQuery({
    queryKey: ["staff_performance_view"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_performance_view")
        .select("*")
        .order("month", { ascending: false });
      if (error) throw error;
      return data as StaffPerformanceRow[];
    },
  });

  // Distinct months present across both views, newest first.
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    (profitability ?? []).forEach((r) => set.add(monthKey(r.month)));
    (performance ?? []).forEach((r) => set.add(monthKey(r.month)));
    return Array.from(set).sort().reverse();
  }, [profitability, performance]);

  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const effectiveMonth = selectedMonth ?? (availableMonths.includes(currentMonthKey) ? currentMonthKey : availableMonths[0] ?? currentMonthKey);

  const monthProfitability = (profitability ?? [])
    .filter((r) => monthKey(r.month) === effectiveMonth)
    .sort((a, b) => b.net_profit - a.net_profit);
  const monthPerformance = (performance ?? [])
    .filter((r) => monthKey(r.month) === effectiveMonth)
    .sort((a, b) => b.revenue_generated - a.revenue_generated);

  const totalGrossRevenue = monthProfitability.reduce((s, r) => s + Number(r.gross_revenue), 0);
  const totalNetProfit = monthProfitability.reduce((s, r) => s + Number(r.net_profit), 0);
  const totalIncentive = monthPerformance.reduce((s, r) => s + Number(r.incentive_earned), 0);
  const topPerformer = monthPerformance[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="flex items-center gap-2">
          <Label htmlFor="analytics-month" className="text-sm text-muted-foreground">
            Month
          </Label>
          {availableMonths.length > 0 ? (
            <Select value={effectiveMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableMonths.map((m) => (
                  <SelectItem key={m} value={m}>
                    {monthLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="analytics-month"
              type="month"
              className="w-48"
              value={effectiveMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          )}
        </div>
      </div>

      <Tabs defaultValue="profitability">
        <TabsList>
          <TabsTrigger value="profitability">Service Profitability</TabsTrigger>
          <TabsTrigger value="performance">Staff Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="profitability" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard icon={TrendingUp} label="Gross revenue (selected month)" value={formatINR(totalGrossRevenue)} />
            <StatCard
              icon={TrendingUp}
              label="Net profit (selected month)"
              value={formatINR(totalNetProfit)}
              valueClassName={totalNetProfit >= 0 ? "text-success" : "text-destructive"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Net profit by service - {monthLabel(effectiveMonth)}</CardTitle>
              <CardDescription>Sorted by net profit, highest first.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {monthProfitability.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No profitability data for this month yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service</TableHead>
                      <TableHead className="text-right">Gross Revenue</TableHead>
                      <TableHead className="text-right">Product Cost</TableHead>
                      <TableHead className="text-right">Allocated Overhead</TableHead>
                      <TableHead className="text-right">Net Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthProfitability.map((row, idx) => (
                      // service_id is null for ad-hoc/custom line items (no services_master
                      // link), so several distinct custom-named rows in the same month would
                      // otherwise collide on the same React key - fold in the name and index.
                      <TableRow key={`${row.service_id ?? "custom"}-${row.service_name}-${idx}`}>
                        <TableCell className="font-medium">{row.service_name}</TableCell>
                        <TableCell className="text-right">{formatINR(row.gross_revenue)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatINR(row.product_cost)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatINR(row.allocated_overhead)}</TableCell>
                        <TableCell className={cn("text-right font-semibold", row.net_profit >= 0 ? "text-success" : "text-destructive")}>
                          {formatINR(row.net_profit)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard
              icon={Trophy}
              label="Top performer (selected month)"
              value={topPerformer ? `${topPerformer.staff_name} - ${formatINR(topPerformer.revenue_generated)}` : "-"}
            />
            <StatCard icon={TrendingUp} label="Total incentive payout" value={formatINR(totalIncentive)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Leaderboard - {monthLabel(effectiveMonth)}</CardTitle>
              <CardDescription>Sorted by revenue generated, highest first.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {monthPerformance.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No staff performance data for this month yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Staff</TableHead>
                      <TableHead className="text-right">Invoices</TableHead>
                      <TableHead className="text-right">Revenue Generated</TableHead>
                      <TableHead className="text-right">Incentive Earned</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthPerformance.map((row, idx) => (
                      <TableRow key={row.staff_id}>
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-medium">{row.staff_name}</TableCell>
                        <TableCell className="text-right">{row.invoice_count}</TableCell>
                        <TableCell className="text-right">{formatINR(row.revenue_generated)}</TableCell>
                        <TableCell className="text-right font-semibold text-success">{formatINR(row.incentive_earned)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* staff_incentive_rules_write RLS is gated on is_finance() (admin/accountant),
          not is_admin() - accountants can manage incentive rules too, so this
          checks can_view_finance (the client-side mirror of is_finance) rather
          than is_admin, matching the actual database policy. */}
      {access?.can_view_finance && <IncentiveRulesSection />}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  valueClassName,
}: {
  icon: any;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={cn("text-lg font-bold", valueClassName)}>{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Admin-only: staff incentive rule management
// ---------------------------------------------------------------------------
function IncentiveRulesSection() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [staffId, setStaffId] = useState("");
  const [serviceId, setServiceId] = useState<string>("all");
  const [percent, setPercent] = useState("0");
  const [flat, setFlat] = useState("0");

  const { data: rules } = useQuery({
    queryKey: ["staff_incentive_rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_incentive_rules")
        .select("*, staff_profiles(full_name), services_master(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as IncentiveRule[];
    },
  });

  const { data: staffOptions } = useQuery({
    queryKey: ["staff_profiles_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_profiles")
        .select("user_id, full_name")
        .eq("active", true)
        .order("full_name");
      if (error) throw error;
      return data as StaffOption[];
    },
  });

  const { data: services } = useQuery({
    queryKey: ["services_master_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services_master").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data as ServiceMaster[];
    },
  });

  function resetForm() {
    setStaffId("");
    setServiceId("all");
    setPercent("0");
    setFlat("0");
  }

  async function addRule() {
    if (!staffId) {
      toast.error("Select a staff member");
      return;
    }
    const incentivePercent = Number(percent) || 0;
    const incentiveFlat = Number(flat) || 0;
    if (incentivePercent < 0 || incentivePercent > 100) {
      toast.error("Incentive % must be between 0 and 100");
      return;
    }
    if (incentiveFlat < 0) {
      toast.error("Incentive flat amount cannot be negative");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("staff_incentive_rules").insert({
        staff_id: staffId,
        service_id: serviceId === "all" ? null : serviceId,
        incentive_percent: incentivePercent,
        incentive_flat: incentiveFlat,
        active: true,
      });
      if (error) throw error;
      toast.success("Incentive rule added");
      resetForm();
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["staff_incentive_rules"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to add rule");
    } finally {
      setSaving(false);
    }
  }

  async function deactivateRule(id: string) {
    try {
      const { error } = await supabase.from("staff_incentive_rules").update({ active: false }).eq("id", id);
      if (error) throw error;
      toast.success("Rule deactivated");
      queryClient.invalidateQueries({ queryKey: ["staff_incentive_rules"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to deactivate rule");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" /> Staff Incentive Rules
          </CardTitle>
          <CardDescription>Admin only. Deactivating a rule stops future incentive accrual without deleting history.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">Add Rule</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Incentive Rule</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Staff</Label>
                <Select value={staffId} onValueChange={setStaffId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff member" />
                  </SelectTrigger>
                  <SelectContent>
                    {(staffOptions ?? []).map((s) => (
                      <SelectItem key={s.user_id} value={s.user_id}>
                        {s.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Service</Label>
                <Select value={serviceId} onValueChange={setServiceId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All services</SelectItem>
                    {(services ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Incentive %</Label>
                  <Input type="number" step="0.01" value={percent} onChange={(e) => setPercent(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Incentive flat (₹)</Label>
                  <Input type="number" step="0.01" value={flat} onChange={(e) => setFlat(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={addRule} disabled={saving}>
                {saving ? "Saving..." : "Add Rule"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        {(rules ?? []).filter((r) => r.active).length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No active incentive rules.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Service</TableHead>
                <TableHead className="text-right">Incentive %</TableHead>
                <TableHead className="text-right">Incentive Flat</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rules ?? [])
                .filter((r) => r.active)
                .map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.staff_profiles?.full_name ?? "Unknown"}</TableCell>
                    <TableCell>{rule.services_master?.name ?? "All services"}</TableCell>
                    <TableCell className="text-right">{rule.incentive_percent}%</TableCell>
                    <TableCell className="text-right">{formatINR(rule.incentive_flat)}</TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Deactivate this incentive rule?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {rule.staff_profiles?.full_name} will stop earning this incentive going forward. Past incentives already
                              earned are unaffected.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deactivateRule(rule.id)}>Deactivate</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
