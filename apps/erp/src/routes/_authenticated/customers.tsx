import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GST_STATES, stateName } from "@/lib/constants";
import { inr2 } from "@/lib/gst";
import { printTallyInvoice, printMasterStatement } from "@/lib/print-layout";
import { printOfficialRegistrationSheet } from "@/lib/print-registration-sheet";
import { fmtDate } from "@/lib/date-format";
import { toast } from "sonner";
import {
  Plus, Trash2, Printer, Pencil, Wallet, FileText, Download, UserPlus,
  AlertTriangle, ShieldAlert, HeartPulse, Search, Sparkles, Tablet,
  Eye, Calendar, CheckCircle2, Stethoscope, Receipt, PenTool
} from "lucide-react";
import { WalletRedeemDialog } from "@/components/WalletRedeemDialog";
import { DigitalClientRegistrationForm } from "@/components/DigitalClientRegistrationForm";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "Master Client 360° CRM & Registrations — MediGlo Harmony ERP" },
      { name: "description", content: "Complete 360° client records, official medical intake, signed consent sheets, service wallets, and visit history." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CustomersPage,
});

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  state_code: string;
  client_type: string | null;
  age: number | null;
  gender: string | null;
  city?: string | null;
  email?: string | null;
  created_at?: string;
}

interface ClientRegistration {
  id: string;
  customer_id?: string;
  registration_date?: string;
  first_name: string;
  last_name: string;
  gender: string;
  gender_other?: string;
  dob?: string;
  age?: number | string;
  address?: string;
  city?: string;
  mobile_no: string;
  email?: string;
  profession?: string;
  profession_other?: string;
  skin_problems?: string[] | string;
  skin_problems_other?: string;
  hair_problems?: string[] | string;
  hair_problems_other?: string;
  body_concerns?: string[] | string;
  body_concerns_other?: string;
  wellbeing_concerns?: string[] | string;
  wellbeing_concerns_other?: string;
  longevity_concerns?: string[] | string;
  clinics_visited_earlier_1?: string;
  clinics_visited_earlier_2?: string;
  medical_conditions?: string[] | string;
  medical_conditions_other?: string;
  prescription_medicines?: string;
  has_allergies?: number | boolean;
  allergy_details?: string;
  referral_source?: string;
  referral_source_other?: string;
  receive_updates?: number | boolean;
  signature_data?: string;
  signature_timestamp?: string;
  consent_agreed?: number | boolean;
  created_at?: string;
}

function parseArrayField(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [String(val)];
  }
}

function CustomersPage() {
  const qc = useQueryClient();
  const { canBilling } = useAuth();
  const [active, setActive] = useState<Customer | null>(null);
  const [search, setSearch] = useState("");
  const [medFilter, setMedFilter] = useState("all");
  const [concernFilter, setConcernFilter] = useState("all");
  const [referralFilter, setReferralFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [regModalOpen, setRegModalOpen] = useState(false);

  // 1. Fetch Customers
  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => ((await supabase.from("customers").select("*").order("name")).data ?? []) as Customer[],
  });

  // 2. Fetch Client Registrations
  const { data: registrations } = useQuery({
    queryKey: ["client_registrations"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("client_registrations")
        .select("*")
        .order("created_at", { ascending: false });
      return (data ?? []) as ClientRegistration[];
    },
  });

  // Map registrations by clean mobile number and customer_id
  const regByPhone = useMemo(() => {
    const map = new Map<string, ClientRegistration>();
    for (const r of registrations ?? []) {
      if (r.mobile_no) {
        map.set(r.mobile_no.replace(/\D/g, ""), r);
      }
      if (r.customer_id) {
        map.set(r.customer_id, r);
      }
    }
    return map;
  }, [registrations]);

  // Combined & Filtered Client List
  const filtered = useMemo(() => {
    return (customers ?? []).filter((c) => {
      const cleanPhone = (c.phone || "").replace(/\D/g, "");
      const reg = regByPhone.get(cleanPhone) || regByPhone.get(c.id);

      // Search matching (Name, Mobile, City)
      const q = search.toLowerCase().trim();
      if (q) {
        const matchesName = c.name.toLowerCase().includes(q);
        const matchesPhone = cleanPhone.includes(q);
        const matchesCity = (c.city || "").toLowerCase().includes(q);
        const matchesProf = (reg?.profession || "").toLowerCase().includes(q);
        if (!matchesName && !matchesPhone && !matchesCity && !matchesProf) {
          return false;
        }
      }

      // Medical filter
      if (medFilter !== "all") {
        if (!reg) return false;
        const meds = parseArrayField(reg.medical_conditions).map((m) => m.toLowerCase());
        if (medFilter === "allergies") {
          if (!reg.has_allergies) return false;
        } else if (medFilter === "diabetes") {
          if (!meds.includes("diabetes")) return false;
        } else if (medFilter === "hypertension") {
          if (!meds.includes("hypertension")) return false;
        } else if (medFilter === "keloids") {
          if (!meds.includes("keloids")) return false;
        } else if (medFilter === "pcos") {
          if (!meds.some((m) => m.includes("pco") || m.includes("hormonal"))) return false;
        } else if (medFilter === "any_medical") {
          if (!reg.has_allergies && meds.length === 0) return false;
        }
      }

      // Concern filter
      if (concernFilter !== "all") {
        if (!reg) return false;
        if (concernFilter === "skin") {
          if (parseArrayField(reg.skin_problems).length === 0 && !reg.skin_problems_other) return false;
        } else if (concernFilter === "hair") {
          if (parseArrayField(reg.hair_problems).length === 0 && !reg.hair_problems_other) return false;
        } else if (concernFilter === "body") {
          if (parseArrayField(reg.body_concerns).length === 0 && !reg.body_concerns_other) return false;
        } else if (concernFilter === "wellbeing") {
          if (parseArrayField(reg.wellbeing_concerns).length === 0 && !reg.wellbeing_concerns_other) return false;
        } else if (concernFilter === "longevity") {
          if (parseArrayField(reg.longevity_concerns).length === 0) return false;
        }
      }

      // Referral filter
      if (referralFilter !== "all") {
        if (!reg) return false;
        if ((reg.referral_source || "").toLowerCase() !== referralFilter.toLowerCase()) {
          return false;
        }
      }

      return true;
    });
  }, [customers, regByPhone, search, medFilter, concernFilter, referralFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = customers?.length ?? 0;
    const withReg = (registrations ?? []).length;
    let highRiskCount = 0;
    let newTodayCount = 0;
    const todayStr = new Date().toISOString().slice(0, 10);

    for (const r of registrations ?? []) {
      if (r.registration_date === todayStr || r.created_at?.startsWith(todayStr)) {
        newTodayCount++;
      }
      const meds = parseArrayField(r.medical_conditions);
      if (r.has_allergies || meds.some((m) => ["keloids", "diabetes", "hypertension", "any implant in body"].includes(m.toLowerCase()))) {
        highRiskCount++;
      }
    }
    return { total, withReg, highRiskCount, newTodayCount };
  }, [customers, registrations]);

  function exportCSV() {
    if (!customers?.length) return toast.error("No client records to export");
    const headers = [
      "Client ID", "Name", "Mobile No", "Email", "Age", "Gender", "City",
      "Profession", "Skin Concerns", "Hair Concerns", "Body Concerns",
      "Medical Conditions", "Allergies Reported", "Allergy Details",
      "Referral Source", "Has Signed Consent", "Reg Date"
    ];

    const rows = (customers ?? []).map((c) => {
      const cleanPhone = (c.phone || "").replace(/\D/g, "");
      const reg = regByPhone.get(cleanPhone) || regByPhone.get(c.id);
      return [
        `"${c.id}"`,
        `"${c.name.replace(/"/g, '""')}"`,
        `"${c.phone || ""}"`,
        `"${c.email || reg?.email || ""}"`,
        `"${c.age || reg?.age || ""}"`,
        `"${c.gender || reg?.gender || ""}"`,
        `"${c.city || reg?.city || ""}"`,
        `"${reg?.profession || ""}"`,
        `"${parseArrayField(reg?.skin_problems).join("; ")}"`,
        `"${parseArrayField(reg?.hair_problems).join("; ")}"`,
        `"${parseArrayField(reg?.body_concerns).join("; ")}"`,
        `"${parseArrayField(reg?.medical_conditions).join("; ")}"`,
        `"${reg?.has_allergies ? "YES" : "NO"}"`,
        `"${(reg?.allergy_details || "").replace(/"/g, '""')}"`,
        `"${reg?.referral_source || ""}"`,
        `"${reg?.signature_data ? "YES" : "NO"}"`,
        `"${reg?.registration_date || c.created_at?.slice(0, 10) || ""}"`,
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `MediGlo_Client_Master_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Client Master CSV exported successfully!");
  }

  async function deleteOne(c: Customer) {
    if (!confirm(`Delete client record for ${c.name}?`)) return;
    const { error } = await supabase.from("customers").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["customers"] });
    toast.success("Client record deleted");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Master Client 360° CRM & Registrations"
        subtitle="Complete client registry · 4-Section official medical intake · Digital consent & signatures · Service wallets"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportCSV}
              className="flex items-center gap-1.5"
            >
              <Download className="h-4 w-4" /> Export Master CSV
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.open("/register", "_blank")}
              className="flex items-center gap-1.5"
            >
              <Tablet className="h-4 w-4" /> Tablet Kiosk Mode
            </Button>

            {canBilling && (
              <Button
                size="sm"
                onClick={() => setRegModalOpen(true)}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground font-semibold shadow"
              >
                <UserPlus className="h-4 w-4" /> Digital Registration Form
              </Button>
            )}
          </div>
        }
      />

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 border bg-card">
          <div className="text-xs font-semibold text-muted-foreground uppercase">Total Registered Clients</div>
          <div className="text-2xl font-bold tracking-tight text-foreground mt-1">{stats.total}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{stats.withReg} with full digital intake</div>
        </Card>

        <Card className="p-4 border bg-card">
          <div className="text-xs font-semibold text-muted-foreground uppercase">New Registrations Today</div>
          <div className="text-2xl font-bold tracking-tight text-primary mt-1">{stats.newTodayCount}</div>
          <div className="text-[11px] text-emerald-600 font-medium mt-0.5">Verified active intakes</div>
        </Card>

        <Card className="p-4 border bg-rose-50/50 border-rose-200">
          <div className="text-xs font-semibold text-rose-800 uppercase flex items-center gap-1">
            <ShieldAlert className="h-3.5 w-3.5 text-rose-600" /> Clinical Safety Alerts
          </div>
          <div className="text-2xl font-bold tracking-tight text-rose-900 mt-1">{stats.highRiskCount}</div>
          <div className="text-[11px] text-rose-700 mt-0.5">Allergies / Keloids / Diabetes flags</div>
        </Card>

        <Card className="p-4 border bg-card">
          <div className="text-xs font-semibold text-muted-foreground uppercase">Active Service Wallets</div>
          <div className="text-2xl font-bold tracking-tight text-foreground mt-1">{stats.total > 0 ? "Active" : "₹0"}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Package session tracking ready</div>
        </Card>
      </div>

      {/* Filter & Search Bar */}
      <Card className="p-4 border space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-1">
            <Label className="text-xs text-muted-foreground">Search Client</Label>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Name, mobile or city..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Medical Alert Screening</Label>
            <select
              value={medFilter}
              onChange={(e) => setMedFilter(e.target.value)}
              className="w-full h-9 rounded-md border bg-background px-3 text-xs mt-1"
            >
              <option value="all">All Medical Profiles</option>
              <option value="any_medical">Any Medical Flag</option>
              <option value="allergies">🚨 Known Allergies</option>
              <option value="keloids">⚠️ Keloids Risk</option>
              <option value="diabetes">⚠️ Diabetes</option>
              <option value="hypertension">⚠️ Hypertension</option>
              <option value="pcos">⚠️ PCOS / Hormonal</option>
            </select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Concerns & Goals</Label>
            <select
              value={concernFilter}
              onChange={(e) => setConcernFilter(e.target.value)}
              className="w-full h-9 rounded-md border bg-background px-3 text-xs mt-1"
            >
              <option value="all">All Concerns</option>
              <option value="skin">Skin Problems</option>
              <option value="hair">Hair & Scalp</option>
              <option value="body">Body Contouring</option>
              <option value="wellbeing">Well-Being</option>
              <option value="longevity">Longevity</option>
            </select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Referral Source</Label>
            <select
              value={referralFilter}
              onChange={(e) => setReferralFilter(e.target.value)}
              className="w-full h-9 rounded-md border bg-background px-3 text-xs mt-1"
            >
              <option value="all">All Referral Sources</option>
              <option value="Instagram">Instagram</option>
              <option value="Facebook">Facebook</option>
              <option value="Internet">Google / Internet</option>
              <option value="Friend/Relative">Friend / Relative</option>
              <option value="Clinic Board">Clinic Board</option>
              <option value="Just walked in">Walk-in</option>
              <option value="Bloggers">Bloggers</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Main Client Table */}
      <Card className="p-0 border shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground border-b">
              <tr>
                <th className="p-3 font-semibold">Patient Name</th>
                <th className="p-3 font-semibold">Mobile Number</th>
                <th className="p-3 font-semibold">City</th>
                <th className="p-3 font-semibold">Profession</th>
                <th className="p-3 font-semibold">Clinical Alerts</th>
                <th className="p-3 font-semibold">Consent Signed</th>
                <th className="p-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((c) => {
                const cleanPhone = (c.phone || "").replace(/\D/g, "");
                const reg = regByPhone.get(cleanPhone) || regByPhone.get(c.id);
                const meds = parseArrayField(reg?.medical_conditions);
                const hasAllergy = reg?.has_allergies === 1 || reg?.has_allergies === true;
                const isSigned = !!reg?.signature_data;

                return (
                  <tr
                    key={c.id}
                    tabIndex={0}
                    className="cursor-pointer outline-none hover:bg-muted/40 transition-colors"
                    onClick={() => setActive(c)}
                  >
                    <td className="p-3">
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        {c.name}
                        {reg && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-primary/40 text-primary">
                            360°
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.gender || reg?.gender || "Patient"} {c.age ? `· ${c.age} yrs` : ""}
                      </div>
                    </td>

                    <td className="p-3 font-medium text-slate-800">
                      {c.phone || "—"}
                    </td>

                    <td className="p-3 text-muted-foreground">
                      {c.city || reg?.city || "Gurugram"}
                    </td>

                    <td className="p-3 text-xs">
                      {reg?.profession || "—"}
                    </td>

                    <td className="p-3">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {hasAllergy && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                            🚨 ALLERGY
                          </span>
                        )}
                        {meds.includes("Keloids") && (
                          <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                            ⚠️ KELOIDS
                          </span>
                        )}
                        {meds.includes("Diabetes") && (
                          <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                            Diabetes
                          </span>
                        )}
                        {meds.includes("Hypertension") && (
                          <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                            HTN
                          </span>
                        )}
                        {meds.some((m) => m.includes("PCO")) && (
                          <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200">
                            PCOS
                          </span>
                        )}
                        {!hasAllergy && meds.length === 0 && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>

                    <td className="p-3 text-xs">
                      {isSigned ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Signed & Filed
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Unsigned</span>
                      )}
                    </td>

                    <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setActive(c)}
                          className="h-8 px-2 text-xs flex items-center gap-1"
                        >
                          <Eye className="h-3.5 w-3.5" /> 360° Profile
                        </Button>
                        {canBilling && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive h-8 px-2"
                            onClick={() => deleteOne(c)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-muted-foreground">
                    No client records found matching search filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 360° Comprehensive Profile Drawer */}
      <Customer360Drawer
        customer={active}
        regData={active ? (regByPhone.get((active.phone || "").replace(/\D/g, "")) || regByPhone.get(active.id)) : null}
        onClose={() => setActive(null)}
        canEdit={canBilling}
      />

      {/* Full Digital Client Registration Modal */}
      <Dialog open={regModalOpen} onOpenChange={setRegModalOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DigitalClientRegistrationForm
            onSuccess={() => setRegModalOpen(false)}
            onCancel={() => setRegModalOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Master Client 360° Profile Drawer
 */
function Customer360Drawer({
  customer,
  regData,
  onClose,
  canEdit,
}: {
  customer: Customer | null;
  regData?: ClientRegistration | null;
  onClose: () => void;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Customer | null>(null);
  const open = !!customer;

  if (customer && (!form || form.id !== customer.id)) {
    setForm(customer);
  }

  // Clinical Ledger & Invoices
  const { data: ledger } = useQuery({
    queryKey: ["cust-ledger", customer?.id],
    enabled: !!customer,
    queryFn: async () => {
      const [{ data: invoices }, { data: packages }] = await Promise.all([
        supabase.from("invoices").select("*").eq("customer_id", customer!.id).is("voided_at", null).order("invoice_date", { ascending: false }),
        supabase.from("treatment_packages").select("*").eq("customer_id", customer!.id),
      ]);
      const inv = invoices ?? [];
      const gross = inv.reduce((s, r) => s + Number(r.gross_total || 0), 0);
      const due = inv.reduce((s, r) => s + Number(r.pending_balance || 0), 0);
      return { inv, packages: packages ?? [], gross, due };
    },
  });

  // Doctor Prescriptions
  const { data: rxList } = useQuery({
    queryKey: ["cust-rx", customer?.id, customer?.name],
    enabled: !!customer,
    queryFn: async () => {
      if (!customer) return [];
      const { data } = await supabase
        .from("patient_visits")
        .select("id, prescription, counselor_notes, created_at, area_of_interest")
        .ilike("customer_name", customer.name)
        .not("prescription", "is", null)
        .order("created_at", { ascending: false });
      return (data ?? []).filter((r) => (r.prescription ?? "").trim().length > 0);
    },
  });

  // Service Wallets
  const { data: wallets } = useQuery({
    queryKey: ["cust-wallets", customer?.id],
    enabled: !!customer,
    queryFn: async () => {
      const { data } = await supabase
        .from("service_wallets")
        .select("*")
        .eq("customer_id", customer!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const meds = parseArrayField(regData?.medical_conditions);
  const skin = parseArrayField(regData?.skin_problems);
  const hair = parseArrayField(regData?.hair_problems);
  const body = parseArrayField(regData?.body_concerns);
  const wellbeing = parseArrayField(regData?.wellbeing_concerns);
  const longevity = parseArrayField(regData?.longevity_concerns);

  async function save() {
    if (!form) return;
    const { error } = await supabase.from("customers").update({
      name: form.name,
      phone: form.phone,
      state_code: form.state_code,
      client_type: form.client_type,
      city: form.city?.trim() || null,
      age: form.age != null && String(form.age) !== "" ? Number(form.age) : null,
      gender: form.gender || null,
    }).eq("id", form.id);
    if (error) return toast.error(error.message);
    toast.success("Client profile updated");
    qc.invalidateQueries({ queryKey: ["customers"] });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-6 space-y-6">
        <SheetHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
                Client 360° Profile
              </span>
              <span className="text-xs text-muted-foreground">ID: {customer?.id?.slice(0, 8)}</span>
            </div>
            {regData && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => printOfficialRegistrationSheet(regData as any)}
                className="h-8 text-xs flex items-center gap-1.5"
              >
                <Printer className="h-3.5 w-3.5 text-primary" /> Print Registration Sheet
              </Button>
            )}
          </div>
          <SheetTitle className="text-xl font-bold mt-2 text-foreground">
            {form?.name}
          </SheetTitle>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-2 pt-1">
            <span>Mobile: <strong>{form?.phone || "N/A"}</strong></span>
            <span>·</span>
            <span>City: {form?.city || "Gurugram"}</span>
            <span>·</span>
            <span>Age: {form?.age ?? "—"}</span>
            <span>·</span>
            <span>Gender: {form?.gender || "—"}</span>
          </div>

          {/* Clinical High-Risk Alert Badges */}
          {(regData?.has_allergies || meds.length > 0) && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {regData?.has_allergies && (
                <div className="px-2 py-1 rounded bg-rose-100 border border-rose-300 text-rose-900 text-xs font-bold flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                  🚨 ALLERGY: {regData.allergy_details || "Unspecified"}
                </div>
              )}
              {meds.includes("Keloids") && (
                <div className="px-2 py-1 rounded bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold">
                  ⚠️ KELOID RISK (Caution with lasers/peels)
                </div>
              )}
              {meds.includes("Diabetes") && (
                <div className="px-2 py-1 rounded bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
                  Diabetes (Delayed Healing)
                </div>
              )}
              {meds.includes("Hypertension") && (
                <div className="px-2 py-1 rounded bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
                  Hypertension
                </div>
              )}
              {meds.some((m) => m.includes("PCO")) && (
                <div className="px-2 py-1 rounded bg-purple-50 border border-purple-200 text-purple-800 text-xs font-medium">
                  Hormonal (PCOS)
                </div>
              )}
            </div>
          )}
        </SheetHeader>

        {/* 3 Tabs: 1. Medical & Concerns | 2. Signed Consent | 3. Clinic History */}
        <Tabs defaultValue="medical" className="w-full">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="medical" className="text-xs">Medical & Intake</TabsTrigger>
            <TabsTrigger value="consent" className="text-xs">Signed Consent</TabsTrigger>
            <TabsTrigger value="history" className="text-xs">Clinic History</TabsTrigger>
          </TabsList>

          {/* TAB 1: Medical & Intake */}
          <TabsContent value="medical" className="space-y-4 pt-3">
            {regData ? (
              <div className="space-y-4 text-xs">
                {/* Personal & Profession */}
                <div className="p-3 rounded-lg border bg-muted/20 space-y-2">
                  <div className="font-semibold text-foreground uppercase tracking-wider text-[11px]">Personal Profile</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-muted-foreground">Profession:</span> <strong>{regData.profession || "—"}</strong></div>
                    <div><span className="text-muted-foreground">Email:</span> {regData.email || "—"}</div>
                    <div><span className="text-muted-foreground">DOB:</span> {regData.dob || "—"}</div>
                    <div><span className="text-muted-foreground">Address:</span> {regData.address || "—"}</div>
                  </div>
                </div>

                {/* Concerns */}
                <div className="p-3 rounded-lg border bg-muted/20 space-y-2">
                  <div className="font-semibold text-foreground uppercase tracking-wider text-[11px]">Reported Concerns & Goals</div>
                  <div className="space-y-1.5">
                    <div>
                      <span className="text-muted-foreground font-medium">Skin Problems: </span>
                      <span className="font-medium text-foreground">{skin.join(", ") || "None"} {regData.skin_problems_other ? `(${regData.skin_problems_other})` : ""}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-medium">Hair / Scalp: </span>
                      <span className="font-medium text-foreground">{hair.join(", ") || "None"} {regData.hair_problems_other ? `(${regData.hair_problems_other})` : ""}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-medium">Body Concerns: </span>
                      <span className="font-medium text-foreground">{body.join(", ") || "None"} {regData.body_concerns_other ? `(${regData.body_concerns_other})` : ""}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-medium">Well-Being: </span>
                      <span className="font-medium text-foreground">{wellbeing.join(", ") || "None"} {regData.wellbeing_concerns_other ? `(${regData.wellbeing_concerns_other})` : ""}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-medium">Longevity Goals: </span>
                      <span className="font-medium text-foreground">{longevity.join(", ") || "None"}</span>
                    </div>
                  </div>
                </div>

                {/* Medical & History */}
                <div className="p-3 rounded-lg border bg-muted/20 space-y-2">
                  <div className="font-semibold text-foreground uppercase tracking-wider text-[11px]">Medical Screening & Prescriptions</div>
                  <div className="space-y-1.5">
                    <div>
                      <span className="text-muted-foreground font-medium">Reported Medical Conditions: </span>
                      <span className="font-bold text-slate-900">{meds.join(", ") || "None reported"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-medium">Past Clinics Visited: </span>
                      <span>1. {regData.clinics_visited_earlier_1 || "None"} &nbsp;|&nbsp; 2. {regData.clinics_visited_earlier_2 || "None"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-medium">Prescription Medicines (Last 1 Yr): </span>
                      <p className="mt-0.5 text-slate-800 bg-white p-2 rounded border border-slate-200">{regData.prescription_medicines || "None listed."}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-medium">Referral Source: </span>
                      <span>{regData.referral_source || "Walk-in"} {regData.referral_source_other ? `(${regData.referral_source_other})` : ""}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center border rounded-lg bg-muted/20 space-y-3">
                <FileText className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm font-medium">No official 4-section digital registration form filed yet.</p>
                <p className="text-xs text-muted-foreground">Complete the intake form to file official medical disclosures and consent signature.</p>
              </div>
            )}
          </TabsContent>

          {/* TAB 2: Signed Consent */}
          <TabsContent value="consent" className="space-y-4 pt-3">
            {regData?.signature_data ? (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-slate-50 border text-xs text-slate-700 space-y-2">
                  <div className="font-bold text-slate-900 uppercase">Consent Declaration Agreed</div>
                  <p className="italic text-muted-foreground">
                    "The information provided by me is true to the best of my knowledge, and I have given my voluntary consent to be examined, consulted, treated, and photographed for clinical record-keeping."
                  </p>
                  <div className="pt-2 border-t text-[11px] text-muted-foreground flex justify-between">
                    <span>Terms: 15-day consultation validity · Strict no-refund policy</span>
                    <span>Agreed: Yes</span>
                  </div>
                </div>

                <div className="p-4 rounded-lg border bg-white text-center space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase">Captured Digital Signature</Label>
                  <div className="border border-dashed border-slate-200 rounded p-2 max-w-sm mx-auto bg-slate-50">
                    <img
                      src={regData.signature_data}
                      alt="Client Digital Signature"
                      className="max-h-24 mx-auto"
                    />
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Signed Timestamp: {regData.signature_timestamp || regData.registration_date}
                  </div>
                </div>

                <Button
                  onClick={() => printOfficialRegistrationSheet(regData as any)}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold"
                >
                  <Printer className="h-4 w-4" /> Print / Download Signed Registration Form PDF
                </Button>
              </div>
            ) : (
              <div className="p-6 text-center border rounded-lg bg-muted/20 space-y-3">
                <PenTool className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm font-medium">No digital signature recorded.</p>
                <p className="text-xs text-muted-foreground">Use the Digital Registration Form to capture patient touch/stylus signature.</p>
              </div>
            )}
          </TabsContent>

          {/* TAB 3: Clinic History */}
          <TabsContent value="history" className="space-y-4 pt-3">
            {/* Quick Ledger Summary */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg border bg-muted/30">
                <div className="text-muted-foreground">Total Invoiced</div>
                <div className="text-lg font-bold mt-0.5">{inr2(ledger?.gross ?? 0)}</div>
              </div>
              <div className="p-3 rounded-lg border bg-muted/30">
                <div className="text-muted-foreground">Pending Dues</div>
                <div className="text-lg font-bold mt-0.5 text-rose-600">{inr2(ledger?.due ?? 0)}</div>
              </div>
            </div>

            {/* Prescriptions */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Doctor Consultations</h4>
              {(rxList ?? []).length > 0 ? (
                <div className="space-y-2">
                  {rxList!.map((rx: any) => (
                    <div key={rx.id} className="p-2.5 rounded border bg-card text-xs space-y-1">
                      <div className="flex justify-between font-medium">
                        <span>{rx.area_of_interest || "Consultation"}</span>
                        <span className="text-muted-foreground">{rx.created_at?.slice(0, 10)}</span>
                      </div>
                      <p className="text-muted-foreground line-clamp-2">{rx.prescription}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No consultation records.</p>
              )}
            </div>

            {/* Wallets */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Service Wallets</h4>
              {(wallets ?? []).length > 0 ? (
                <div className="space-y-2">
                  {wallets!.map((w: any) => (
                    <div key={w.id} className="p-2.5 rounded border bg-card text-xs flex justify-between items-center">
                      <div>
                        <div className="font-semibold">{w.service_name}</div>
                        <div className="text-muted-foreground">Consumed: {w.consumed_sessions ?? 0} / {w.total_sessions}</div>
                      </div>
                      <Badge variant={w.status === "active" ? "default" : "secondary"}>{w.status}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No active packages.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Basic Editable Fields */}
        {canEdit && form && (
          <div className="pt-4 border-t space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Edit Master Record</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <Label className="text-[11px]">Full Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-[11px]">Mobile Phone</Label>
                <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-[11px]">City</Label>
                <Input value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-[11px]">State</Label>
                <Select value={form.state_code} onValueChange={(v) => setForm({ ...form, state_code: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GST_STATES.map((s) => (
                      <SelectItem key={s.code} value={s.code}>{s.code} - {s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button size="sm" onClick={save} className="w-full text-xs h-8">Save Master Profile</Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
