// READ-ONLY export of master lists from LIVE MGHYN DB (wrjhdtdlxekackjdsjpf).
// Only HTTP GET is used against /rest/v1. No POST/PATCH/DELETE to REST anywhere in this file.
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync("c:/Users/Vikas Koul/Documents/antigravity/hopeful-mendel/apps/mghyn/.env", "utf8")
  .split(/\r?\n/).filter(l => l.includes("=")).map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const URL_ = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const OUT = process.env.OUT_DIR || "live_export";
fs.mkdirSync(OUT, { recursive: true });
const auth = await (await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@mediglo.in", password: "AdminPassword2026!" }) })).json();
const H = { apikey: KEY, Authorization: `Bearer ${auth.access_token}` };
async function getAll(table, extra = "") {
  const rows = []; const page = 1000;
  for (let from = 0; ; from += page) {
    const r = await fetch(`${URL_}/rest/v1/${table}?select=*${extra}`, { method: "GET", headers: { ...H, Range: `${from}-${from + page - 1}` } });
    if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
    const b = await r.json(); rows.push(...b); if (b.length < page) break;
  }
  return rows;
}
const mode = process.argv[2] || "export";
if (mode === "tables") {
  const spec = await (await fetch(`${URL_}/rest/v1/`, { method: "GET", headers: H })).json();
  fs.writeFileSync(`${OUT}/openapi.json`, JSON.stringify(spec));
  console.log(Object.keys(spec.paths).filter(p => !p.startsWith("/rpc")).join("\n"));
} else if (mode === "today") {
  const d = new Date(); const ist = process.argv[3] || new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);
  const start = new Date(`${ist}T00:00:00+05:30`).toISOString(), end = new Date(`${ist}T23:59:59+05:30`).toISOString();
  const inv = (await getAll("invoices", `&invoice_date=eq.${ist}`)).filter(x => !x.voided_at);
  const all = await fetch(`${URL_}/rest/v1/invoices?select=id`, { method: "GET", headers: { ...H, Prefer: "count=exact", Range: "0-0" } });
  const sum = k => inv.reduce((s, x) => s + Number(x[k] ?? 0), 0);
  console.log(JSON.stringify({ date: ist, invoices: inv.length, gross_total: sum("gross_total"), paid_amount: sum("paid_amount"), gst: sum("cgst") + sum("sgst"), total_invoice_rows: all.headers.get("content-range") }));
} else {
  for (const t of process.argv.slice(3)) { const rows = await getAll(t); fs.writeFileSync(`${OUT}/${t}.json`, JSON.stringify(rows, null, 1)); console.log(t, rows.length); }
}
