import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";

const CURRENCY_FMT = '"₹"#,##0.00;[Red]-"₹"#,##0.00';
const DATE_FMT = "yyyy-mm-dd";

export interface BackupResult {
  buffer: Buffer;
  filename: string;
  summary: { customers: number; packages: number; invoices: number; expenses: number; leads: number };
}

export async function buildMasterBackup(supabase: SupabaseClient): Promise<BackupResult> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Mediglo Clinic OS";
  wb.created = new Date();

  const [customers, packages, invoices, expenses, appts] = await Promise.all([
    supabase.from("customers").select("*").order("name"),
    supabase.from("treatment_packages").select("*").order("created_at", { ascending: false }),
    supabase.from("invoices").select("*").order("invoice_date", { ascending: false }),
    supabase.from("expenses").select("*").order("expense_date", { ascending: false }),
    supabase.from("cos_appointments").select("*").order("appointment_date", { ascending: false }),
  ]);

  // Sheet 1: CRM & Patients
  const s1 = wb.addWorksheet("CRM & Patients");
  s1.columns = [
    { header: "Name", key: "name", width: 28 },
    { header: "Phone", key: "phone", width: 16 },
    { header: "Age", key: "age", width: 8 },
    { header: "Location", key: "location", width: 20 },
    { header: "Status", key: "status", width: 14 },
    { header: "Created", key: "created_at", width: 14, style: { numFmt: DATE_FMT } },
  ];
  for (const c of (customers.data ?? []) as Record<string, unknown>[]) {
    s1.addRow({
      name: c.name,
      phone: c.phone,
      age: c.age,
      location: c.address ?? c.location,
      status: c.status ?? "active",
      created_at: c.created_at ? new Date(c.created_at as string) : null,
    });
  }

  // Sheet 2: Packages & Treatments
  const s2 = wb.addWorksheet("Packages & Treatments");
  s2.columns = [
    { header: "Patient", key: "patient", width: 28 },
    { header: "Package", key: "package", width: 24 },
    { header: "Total Sessions", key: "total", width: 14 },
    { header: "Completed", key: "completed", width: 12 },
    { header: "Pending", key: "pending", width: 12 },
    { header: "Price", key: "price", width: 14, style: { numFmt: CURRENCY_FMT } },
  ];
  for (const p of (packages.data ?? []) as Record<string, unknown>[]) {
    const total = Number(p.total_sessions ?? 0);
    const completed = Number(p.sessions_completed ?? p.completed_sessions ?? 0);
    s2.addRow({
      patient: p.customer_name ?? p.patient_name ?? "",
      package: p.package_name ?? p.name ?? "",
      total,
      completed,
      pending: Math.max(0, total - completed),
      price: Number(p.total_price ?? p.price ?? 0),
    });
  }

  // Sheet 3: Sales & Revenue
  const s3 = wb.addWorksheet("Sales & Revenue");
  s3.columns = [
    { header: "Invoice #", key: "num", width: 16 },
    { header: "Date", key: "date", width: 12, style: { numFmt: DATE_FMT } },
    { header: "Client", key: "client", width: 24 },
    { header: "Total", key: "total", width: 14, style: { numFmt: CURRENCY_FMT } },
    { header: "Paid", key: "paid", width: 14, style: { numFmt: CURRENCY_FMT } },
    { header: "Pending", key: "pending", width: 14, style: { numFmt: CURRENCY_FMT } },
    { header: "Payment Mode", key: "mode", width: 18 },
  ];
  for (const i of (invoices.data ?? []) as Record<string, unknown>[]) {
    s3.addRow({
      num: i.invoice_number ?? i.id,
      date: i.invoice_date ? new Date(i.invoice_date as string) : null,
      client: i.customer_name ?? "",
      total: Number(i.total_amount ?? 0),
      paid: Number(i.paid_amount ?? 0),
      pending: Number(i.pending_balance ?? 0),
      mode: i.payment_mode ?? "",
    });
  }

  // Sheet 4: Expenses
  const s4 = wb.addWorksheet("Expenses");
  s4.columns = [
    { header: "ID", key: "id", width: 12 },
    { header: "Date", key: "date", width: 12, style: { numFmt: DATE_FMT } },
    { header: "Category", key: "cat", width: 18 },
    { header: "Amount", key: "amt", width: 14, style: { numFmt: CURRENCY_FMT } },
    { header: "Payment Mode", key: "mode", width: 16 },
    { header: "Remarks", key: "remarks", width: 40 },
  ];
  for (const e of (expenses.data ?? []) as Record<string, unknown>[]) {
    s4.addRow({
      id: (e.id as string | undefined)?.slice(0, 8),
      date: e.expense_date ? new Date(e.expense_date as string) : null,
      cat: e.category ?? "",
      amt: Number(e.amount ?? 0),
      mode: e.payment_mode ?? "",
      remarks: e.description ?? e.notes ?? "",
    });
  }

  // Sheet 5: Marketing & Leads
  const s5 = wb.addWorksheet("Marketing & Leads");
  s5.columns = [
    { header: "Lead Source", key: "src", width: 18 },
    { header: "Booked", key: "booked", width: 10 },
    { header: "Completed", key: "completed", width: 12 },
    { header: "Cancelled", key: "cancelled", width: 12 },
    { header: "Follow-Up %", key: "fup", width: 12 },
  ];
  const bucket = new Map<string, { booked: number; completed: number; cancelled: number }>();
  for (const a of (appts.data ?? []) as Record<string, unknown>[]) {
    const k = (a.lead_source as string) || "Unknown";
    const cur = bucket.get(k) ?? { booked: 0, completed: 0, cancelled: 0 };
    cur.booked++;
    const st = String(a.status ?? "").toLowerCase();
    if (st.includes("cancel")) cur.cancelled++;
    else if (st.includes("out") || st.includes("complete")) cur.completed++;
    bucket.set(k, cur);
  }
  for (const [src, v] of bucket) {
    s5.addRow({
      src,
      booked: v.booked,
      completed: v.completed,
      cancelled: v.cancelled,
      fup: v.booked ? Math.round(((v.booked - v.completed) / v.booked) * 100) : 0,
    });
  }

  for (const s of [s1, s2, s3, s4, s5]) {
    s.getRow(1).font = { bold: true };
    s.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
    s.views = [{ state: "frozen", ySplit: 1 }];
  }

  const buf = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    buffer: Buffer.from(buf),
    filename: `mediglo-master-backup-${stamp}.xlsx`,
    summary: {
      customers: customers.data?.length ?? 0,
      packages: packages.data?.length ?? 0,
      invoices: invoices.data?.length ?? 0,
      expenses: expenses.data?.length ?? 0,
      leads: appts.data?.length ?? 0,
    },
  };
}
