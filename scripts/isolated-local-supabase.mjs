// @ts-check
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const PORT = 54321;
const HOST = "127.0.0.1";
const DB_PATH = path.resolve("apps/erp/isolated_mediglo_harmony.db");
const EXPORT_DIR = path.resolve("live_export");

// SAFETY GUARD: under NO circumstances interact with wrjhdtdlxekackjdsjpf
if (process.env.SUPABASE_URL?.includes("wrjhdtdlxekackjdsjpf") || process.env.VITE_SUPABASE_URL?.includes("wrjhdtdlxekackjdsjpf")) {
  console.error("FATAL: Live database wrjhdtdlxekackjdsjpf detected in environment. Aborting to protect live MGHYN.");
  process.exit(1);
}

console.log(`[Isolated DB] Initializing SQLite database at: ${DB_PATH}`);
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode and foreign keys
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = NORMAL;");

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS _schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS services_master (
    id TEXT PRIMARY KEY,
    category TEXT,
    name TEXT,
    sac_code TEXT,
    gst_rate REAL DEFAULT 18,
    default_price REAL DEFAULT 0,
    cost_estimate REAL DEFAULT 0,
    active INTEGER DEFAULT 1,
    gap_days INTEGER DEFAULT 0,
    duration_minutes INTEGER DEFAULT 30,
    auto_followup INTEGER DEFAULT 0,
    auto_appointment INTEGER DEFAULT 0,
    consumables TEXT,
    sessions INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS inventory (
    id TEXT PRIMARY KEY,
    name TEXT,
    category TEXT,
    stock REAL DEFAULT 0,
    rate REAL DEFAULT 0,
    expiry_date TEXT,
    batch_no TEXT,
    active INTEGER DEFAULT 1,
    sku TEXT,
    barcode TEXT,
    brand TEXT,
    company TEXT,
    sub_category TEXT,
    default_supplier_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT,
    phone TEXT,
    state_code TEXT DEFAULT '06',
    client_type TEXT DEFAULT 'New',
    age INTEGER,
    gender TEXT,
    customer_code TEXT,
    outstanding_balance REAL DEFAULT 0,
    internal_notes TEXT,
    city TEXT,
    email TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS inventory_categories (
    id TEXT PRIMARY KEY,
    name TEXT,
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS inventory_brands (
    id TEXT PRIMARY KEY,
    name TEXT,
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS clinic_rooms (
    id TEXT PRIMARY KEY,
    room_number TEXT,
    name TEXT,
    status TEXT DEFAULT 'available',
    room_type TEXT,
    current_occupant TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS treatment_rooms (
    id TEXT PRIMARY KEY,
    name TEXT,
    status TEXT DEFAULT 'available',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY,
    name TEXT,
    role_title TEXT,
    active INTEGER DEFAULT 1,
    user_id TEXT,
    email TEXT,
    phone TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT,
    is_admin INTEGER DEFAULT 0,
    can_bill INTEGER DEFAULT 1,
    billing_locked INTEGER DEFAULT 0,
    lock_reason TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_roles (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    role TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Transactional tables: created empty for zero-billing state
  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    invoice_no TEXT,
    customer_id TEXT,
    customer_name TEXT,
    invoice_date TEXT,
    state_code TEXT DEFAULT '06',
    tax_mode TEXT DEFAULT 'inclusive',
    payment_mode TEXT DEFAULT 'Cash',
    base_amount REAL DEFAULT 0,
    cgst REAL DEFAULT 0,
    sgst REAL DEFAULT 0,
    gross_total REAL DEFAULT 0,
    paid_amount REAL DEFAULT 0,
    pending_balance REAL DEFAULT 0,
    assigned_staff TEXT,
    source TEXT DEFAULT 'pos',
    voided_at TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS invoice_lines (
    id TEXT PRIMARY KEY,
    invoice_id TEXT,
    item_type TEXT,
    item_id TEXT,
    item_name TEXT,
    hsn_sac TEXT,
    qty REAL DEFAULT 1,
    unit_price REAL DEFAULT 0,
    taxable_amount REAL DEFAULT 0,
    gst_rate REAL DEFAULT 0,
    cgst_amount REAL DEFAULT 0,
    sgst_amount REAL DEFAULT 0,
    total_amount REAL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    bill_no TEXT,
    vendor_id TEXT,
    vendor_name TEXT,
    bill_date TEXT,
    gross_total REAL DEFAULT 0,
    tax_amount REAL DEFAULT 0,
    paid_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'completed',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    category TEXT,
    amount REAL DEFAULT 0,
    description TEXT,
    date TEXT,
    payment_mode TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vouchers (
    id TEXT PRIMARY KEY,
    voucher_no TEXT,
    voucher_type TEXT,
    date TEXT,
    narration TEXT,
    amount REAL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS voucher_entries (
    id TEXT PRIMARY KEY,
    voucher_id TEXT,
    account_name TEXT,
    debit REAL DEFAULT 0,
    credit REAL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS consumption_logs (
    id TEXT PRIMARY KEY,
    treatment_name TEXT,
    item_id TEXT,
    item_name TEXT,
    quantity REAL DEFAULT 0,
    therapist_id TEXT,
    patient_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS service_consumption (
    id TEXT PRIMARY KEY,
    invoice_id TEXT,
    service_id TEXT,
    inventory_id TEXT,
    quantity REAL DEFAULT 0,
    cost_at_consumption REAL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS inventory_ledger (
    id TEXT PRIMARY KEY,
    inventory_id TEXT,
    stream TEXT, -- 'Stream A (Retail)' or 'Stream B (Clinical)'
    movement_type TEXT,
    quantity REAL DEFAULT 0,
    reference_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    customer_id TEXT,
    customer_name TEXT,
    phone TEXT,
    email TEXT,
    gender TEXT,
    service_id TEXT,
    service_name TEXT,
    service_inquiry TEXT,
    appointment_date TEXT,
    appointment_time TEXT,
    start_time TEXT,
    end_time TEXT,
    status TEXT DEFAULT 'scheduled',
    staff_id TEXT,
    notes TEXT,
    wallet_id TEXT,
    integration_key TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS patient_visits (
    id TEXT PRIMARY KEY,
    customer_id TEXT,
    customer_name TEXT,
    phone TEXT,
    area_of_interest TEXT,
    status TEXT DEFAULT 'reception',
    assigned_doctor TEXT,
    assigned_counselor TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS doctor_prescriptions (
    id TEXT PRIMARY KEY,
    patient_id TEXT,
    doctor_id TEXT,
    diagnosis TEXT,
    clinical_notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS doctor_prescription_items (
    id TEXT PRIMARY KEY,
    prescription_id TEXT,
    medicine_name TEXT,
    dosage TEXT,
    frequency TEXT,
    duration TEXT,
    instructions TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS counselor_quotations (
    id TEXT PRIMARY KEY,
    customer_id TEXT,
    customer_name TEXT,
    package_name TEXT,
    proposed_amount REAL DEFAULT 0,
    discount_amount REAL DEFAULT 0,
    final_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cos_treatment_packages (
    id TEXT PRIMARY KEY,
    invoice_id TEXT,
    patient_id TEXT,
    package_name TEXT,
    total_sessions INTEGER DEFAULT 1,
    sessions_completed INTEGER DEFAULT 0,
    outstanding_balance REAL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS client_registrations (
    id TEXT PRIMARY KEY,
    customer_id TEXT,
    registration_date TEXT,
    first_name TEXT,
    last_name TEXT,
    gender TEXT,
    gender_other TEXT,
    dob TEXT,
    age INTEGER,
    address TEXT,
    city TEXT,
    mobile_no TEXT,
    email TEXT,
    profession TEXT,
    profession_other TEXT,
    skin_problems TEXT,
    skin_problems_other TEXT,
    hair_problems TEXT,
    hair_problems_other TEXT,
    body_concerns TEXT,
    body_concerns_other TEXT,
    wellbeing_concerns TEXT,
    wellbeing_concerns_other TEXT,
    longevity_concerns TEXT,
    clinics_visited_earlier_1 TEXT,
    clinics_visited_earlier_2 TEXT,
    medical_conditions TEXT,
    medical_conditions_other TEXT,
    prescription_medicines TEXT,
    has_allergies INTEGER DEFAULT 0,
    allergy_details TEXT,
    referral_source TEXT,
    referral_source_other TEXT,
    receive_updates INTEGER DEFAULT 1,
    signature_data TEXT,
    signature_timestamp TEXT,
    consent_agreed INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY,
    name TEXT,
    phone TEXT,
    email TEXT,
    gstin TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS clinical_ai_patterns (
    id TEXT PRIMARY KEY,
    concern TEXT,
    diagnosis TEXT,
    medicine_name TEXT,
    dosage TEXT,
    frequency TEXT,
    duration TEXT,
    category TEXT DEFAULT 'oral',
    contraindications TEXT,
    times_prescribed INTEGER DEFAULT 1,
    confidence_score REAL DEFAULT 0.95,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

const checkAiPatterns = db.prepare("SELECT count(*) as c FROM clinical_ai_patterns").get();
if (!checkAiPatterns || checkAiPatterns.c === 0) {
  console.log("[Isolated DB] Seeding initial Clinical AI Prescription Patterns...");
  const insertPattern = db.prepare(`
    INSERT INTO clinical_ai_patterns (id, concern, diagnosis, medicine_name, dosage, frequency, duration, category, contraindications, times_prescribed, confidence_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const initialPatterns = [
    ["pat-1", "Acne", "Acne Vulgaris", "Tab. Doxycycline 100mg", "100mg", "1 tab OD after dinner", "14 days", "oral", JSON.stringify(["pregnancy", "lactation", "sulfa"]), 12, 0.98],
    ["pat-2", "Acne", "Acne Vulgaris", "Adapalene 0.1% + Clindamycin 1% Gel", "0.1% / 1%", "Apply thin layer at night", "30 days", "topical", JSON.stringify(["retinoid", "pregnancy"]), 15, 0.99],
    ["pat-3", "Acne", "Acne Vulgaris", "Ceramide Barrier Repair Moisturizer", "Liberal", "Apply BD", "30 days", "topical", JSON.stringify([]), 18, 0.99],
    ["pat-4", "Acne", "Acne Vulgaris", "Oil-Free Broad Spectrum Sunscreen SPF 50", "SPF 50", "Apply every 3 hours (Morning/Noon)", "30 days", "topical", JSON.stringify([]), 20, 0.99],
    ["pat-5", "Melasma", "Mixed Melasma & Hyperpigmentation", "Tab. Tranexamic Acid 250mg", "250mg", "1 tab BD after meals", "30 days", "oral", JSON.stringify(["thrombosis", "stroke"]), 14, 0.97],
    ["pat-6", "Melasma", "Mixed Melasma & Hyperpigmentation", "Kojic Acid 2% + Arbutin + Niacinamide Serum", "2% / 1% / 4%", "Apply night", "45 days", "topical", JSON.stringify([]), 16, 0.98],
    ["pat-7", "Melasma", "Mixed Melasma & Hyperpigmentation", "Tab. Liposomal Vitamin C 1000mg + Glutathione 500mg", "1000mg / 500mg", "1 tab OD morning", "30 days", "oral", JSON.stringify([]), 11, 0.96],
    ["pat-8", "Melasma", "Mixed Melasma & Hyperpigmentation", "Tinted Mineral Sunscreen SPF 50+", "SPF 50+", "Apply every 3 hours", "30 days", "topical", JSON.stringify([]), 19, 0.99],
    ["pat-9", "Hair Loss", "Androgenetic Alopecia", "Minoxidil 5% + Finasteride 0.1% Solution", "5% / 0.1%", "1ml twice daily on dry scalp", "60 days", "topical", JSON.stringify(["pregnancy", "female_childbearing"]), 22, 0.99],
    ["pat-10", "Hair Loss", "Telogen Effluvium & Thinning", "Tab. Biotin 10mg + Saw Palmetto Complex", "10mg", "1 tab OD after breakfast", "60 days", "oral", JSON.stringify([]), 19, 0.98],
    ["pat-11", "Hair Loss", "Scalp Dermatitis & Thinning", "Ketoconazole 2% Scalp Solution", "2%", "Twice weekly wash", "30 days", "topical", JSON.stringify([]), 15, 0.97],
    ["pat-12", "Anti-Aging", "Facial Photoaging & Wrinkles", "Peptide + Hyaluronic Acid Intensive Serum", "Liberal", "Apply BD", "30 days", "topical", JSON.stringify([]), 14, 0.96],
    ["pat-13", "Anti-Aging", "Fine Lines & Photoaging", "Retinol 0.5% Night Renewal Cream", "0.5%", "Apply alternate nights", "30 days", "topical", JSON.stringify(["pregnancy", "retinoid"]), 13, 0.95],
    ["pat-14", "Scars", "Atrophic Acne Scars", "Centella Asiatica + Niacinamide Soothing Gel", "Liberal", "Apply BD", "30 days", "topical", JSON.stringify([]), 10, 0.95],
  ];
  for (const p of initialPatterns) {
    insertPattern.run(...p);
  }
}

// Ensure dynamic columns exist in SQLite tables
const ensureCol = (tbl, col, def) => {
  try { db.prepare(`ALTER TABLE "${tbl}" ADD COLUMN "${col}" ${def}`).run(); } catch {}
};
ensureCol("appointments", "appointment_date", "TEXT");
ensureCol("appointments", "appointment_time", "TEXT");
ensureCol("appointments", "service_inquiry", "TEXT");
ensureCol("appointments", "phone", "TEXT");
ensureCol("appointments", "email", "TEXT");
ensureCol("appointments", "gender", "TEXT");
ensureCol("appointments", "wallet_id", "TEXT");
ensureCol("appointments", "integration_key", "TEXT");
ensureCol("appointments", "updated_at", "TEXT");

// Master Seeding Function
function seedMasterData() {
  const meta = db.prepare("SELECT value FROM _schema_meta WHERE key = 'seeded_version'").get();
  if (meta) {
    console.log(`[Isolated DB] Database already seeded (version ${meta.value}).`);
    return;
  }

  console.log(`[Isolated DB] Seeding 3 Master Lists & Metadata from: ${EXPORT_DIR}`);

  // 1. services_master (294 records)
  if (fs.existsSync(path.join(EXPORT_DIR, "services_master.json"))) {
    const services = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, "services_master.json"), "utf8"));
    const insertService = db.prepare(`
      INSERT OR REPLACE INTO services_master (id, category, name, sac_code, gst_rate, default_price, cost_estimate, active, gap_days, duration_minutes, auto_followup, auto_appointment, consumables, sessions, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.exec("BEGIN TRANSACTION;");
    for (const s of services) {
      insertService.run(
        s.id,
        s.category ?? "General",
        s.name,
        s.sac_code ?? "999312",
        Number(s.gst_rate ?? 18),
        Number(s.default_price ?? 0),
        Number(s.cost_estimate ?? 0),
        s.active !== false ? 1 : 0,
        Number(s.gap_days ?? 0),
        Number(s.duration_minutes ?? 30),
        s.auto_followup ? 1 : 0,
        s.auto_appointment ? 1 : 0,
        typeof s.consumables === "object" ? JSON.stringify(s.consumables) : (s.consumables ?? null),
        Number(s.sessions ?? 1),
        s.created_at ?? new Date().toISOString(),
        s.updated_at ?? new Date().toISOString()
      );
    }
    db.exec("COMMIT;");
    console.log(`[Isolated DB] Seeded ${services.length} services into services_master.`);
  }

  // 2. inventory (361 records - stock initialized to 0)
  if (fs.existsSync(path.join(EXPORT_DIR, "inventory.json"))) {
    const items = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, "inventory.json"), "utf8"));
    const insertItem = db.prepare(`
      INSERT OR REPLACE INTO inventory (id, name, category, stock, rate, expiry_date, batch_no, active, sku, barcode, brand, company, sub_category, default_supplier_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    if (table === "client_registrations") {
      for (const item of items) {
        const cleanPhone = (item.mobile_no || "").trim();
        const fullName = `${(item.first_name || "").toUpperCase()} ${item.last_name || ""}`.trim();
        let cust = null;
        if (cleanPhone) {
          cust = db.prepare("SELECT * FROM customers WHERE phone = ?").get(cleanPhone);
        }
        if (!cust && fullName) {
          cust = db.prepare("SELECT * FROM customers WHERE lower(name) = lower(?)").get(fullName);
        }
        if (cust) {
          item.customer_id = cust.id;
          db.prepare("UPDATE customers SET age = COALESCE(?, age), gender = COALESCE(?, gender), city = COALESCE(?, city), email = COALESCE(?, email), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(item.age, item.gender, item.city, item.email, cust.id);
        } else {
          const custId = "c-" + Math.random().toString(36).slice(2, 10);
          item.customer_id = custId;
          db.prepare("INSERT INTO customers (id, name, phone, age, gender, city, email, state_code, client_type, outstanding_balance) VALUES (?, ?, ?, ?, ?, ?, ?, '06', 'New', 0)")
            .run(custId, fullName || "Walk-in Client", cleanPhone || null, item.age || null, item.gender || null, item.city || "Gurugram", item.email || null);
        }
      }
    }

    db.exec("BEGIN TRANSACTION;");
    for (const item of items) {
      insertItem.run(
        item.id,
        item.name,
        item.category ?? "Pharmacy",
        0, // Stock zeroed out for clean testing slate!
        Number(item.rate ?? 0),
        item.expiry_date ?? null,
        item.batch_no ?? null,
        item.active !== false ? 1 : 0,
        item.sku ?? null,
        item.barcode ?? null,
        item.brand ?? null,
        item.company ?? null,
        item.sub_category ?? null,
        item.default_supplier_id ?? null,
        item.created_at ?? new Date().toISOString(),
        item.updated_at ?? new Date().toISOString()
      );
    }
    db.exec("COMMIT;");
    console.log(`[Isolated DB] Seeded ${items.length} items into inventory (all stock set to 0).`);
  }

  // 3. customers (968 records - outstanding balance initialized to 0)
  if (fs.existsSync(path.join(EXPORT_DIR, "customers.json"))) {
    const customers = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, "customers.json"), "utf8"));
    const insertCustomer = db.prepare(`
      INSERT OR REPLACE INTO customers (id, name, phone, state_code, client_type, age, gender, customer_code, outstanding_balance, internal_notes, city, email, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.exec("BEGIN TRANSACTION;");
    for (const c of customers) {
      insertCustomer.run(
        c.id,
        c.name,
        c.phone ?? null,
        c.state_code ?? "06",
        c.client_type ?? "New",
        c.age ? Number(c.age) : null,
        c.gender ?? null,
        c.customer_code ?? null,
        0, // Zero outstanding balance
        c.internal_notes ?? null,
        c.city ?? null,
        c.email ?? null,
        c.created_at ?? new Date().toISOString(),
        c.updated_at ?? new Date().toISOString()
      );
    }
    db.exec("COMMIT;");
    console.log(`[Isolated DB] Seeded ${customers.length} clients into customers (balances reset to 0).`);
  }

  // 4. Auxiliary tables: categories, brands, rooms, settings, vendors
  const auxTables = [
    ["inventory_categories.json", "inventory_categories", ["id", "name", "description", "created_at"]],
    ["inventory_brands.json", "inventory_brands", ["id", "name", "description", "created_at"]],
    ["clinic_rooms.json", "clinic_rooms", ["id", "room_number", "name", "status", "room_type", "current_occupant", "created_at"]],
    ["treatment_rooms.json", "treatment_rooms", ["id", "name", "status", "created_at"]],
    ["vendors.json", "vendors", ["id", "name", "phone", "email", "gstin", "created_at"]],
  ];

  for (const [file, table, cols] of auxTables) {
    const fPath = path.join(EXPORT_DIR, file);
    if (fs.existsSync(fPath)) {
      const data = JSON.parse(fs.readFileSync(fPath, "utf8"));
      if (Array.isArray(data) && data.length > 0) {
        const placeholders = cols.map(() => "?").join(", ");
        const stmt = db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`);

        db.exec("BEGIN TRANSACTION;");
        for (const row of data) {
          stmt.run(...cols.map(c => row[c] ?? null));
        }
        db.exec("COMMIT;");
        console.log(`[Isolated DB] Seeded ${data.length} rows into ${table}.`);
      }
    }
  }

  // 5. app_settings
  if (fs.existsSync(path.join(EXPORT_DIR, "app_settings.json"))) {
    const settings = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, "app_settings.json"), "utf8"));
    const stmt = db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)");
    for (const s of settings) {
      stmt.run(s.key, typeof s.value === "object" ? JSON.stringify(s.value) : String(s.value), s.updated_at ?? new Date().toISOString(), s.updated_by ?? null);
    }
    console.log(`[Isolated DB] Seeded ${settings.length} app_settings.`);
  }

  // 6. Profiles & 16 Staff Logins
  const staffList = [
    { email: "admin@mediglo.in", name: "Super Admin", role: "admin", is_admin: 1, can_bill: 1 },
    { email: "himuydv5@gmail.com", name: "Himu Ydv", role: "admin", is_admin: 1, can_bill: 1 },
    { email: "vikas@mediglo.in", name: "Vikas Koul", role: "admin", is_admin: 1, can_bill: 1 },
    { email: "dr.niyati@mediglo.in", name: "Dr. Niyati", role: "doctor", is_admin: 0, can_bill: 1 },
    { email: "dr.richa@mediglo.in", name: "Dr. Richa", role: "doctor", is_admin: 0, can_bill: 1 },
    { email: "nidhi@mediglo.in", name: "Nidhi", role: "counselor", is_admin: 0, can_bill: 1 },
    { email: "pushpa@mediglo.in", name: "Pushpa", role: "counselor", is_admin: 0, can_bill: 1 },
    { email: "reception@mediglo.in", name: "Harsh vardhan", role: "reception", is_admin: 0, can_bill: 1 },
    { email: "vishal@mediglo.in", name: "Vishal", role: "pharmacist", is_admin: 0, can_bill: 1 },
    { email: "urmila@mediglo.in", name: "Urmila", role: "therapist", is_admin: 0, can_bill: 0 },
    { email: "sanju@mediglo.in", name: "Sanju", role: "therapist", is_admin: 0, can_bill: 0 },
    { email: "kajal@mediglo.in", name: "Kajal", role: "therapist", is_admin: 0, can_bill: 0 },
    { email: "abhishek@mediglo.in", name: "Abhishek", role: "accountant", is_admin: 0, can_bill: 1 },
    { email: "dheeraj@mediglo.in", name: "Dheeraj", role: "accountant", is_admin: 0, can_bill: 1 },
    { email: "radha@mediglo.in", name: "Radha", role: "reception", is_admin: 0, can_bill: 1 },
    { email: "ashok@mediglo.in", name: "Ashok", role: "marketing", is_admin: 0, can_bill: 0 },
  ];

  const insertProfile = db.prepare(`
    INSERT OR REPLACE INTO profiles (id, email, full_name, avatar_url, role, is_admin, can_bill, billing_locked, lock_reason, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRole = db.prepare("INSERT OR REPLACE INTO user_roles (id, user_id, role) VALUES (?, ?, ?)");
  const insertStaff = db.prepare(`
    INSERT OR REPLACE INTO staff (id, name, role_title, active, user_id, email, phone, status)
    VALUES (?, ?, ?, 1, ?, ?, ?, 'active')
  `);

  db.exec("BEGIN TRANSACTION;");
  for (const s of staffList) {
    const userId = "u-" + Buffer.from(s.email).toString("hex").slice(0, 16);
    insertProfile.run(userId, s.email, s.name, null, s.role, s.is_admin, s.can_bill, 0, null, new Date().toISOString(), new Date().toISOString());
    insertRole.run("r-" + userId, userId, s.role);
    insertStaff.run("st-" + userId, s.name, s.role, userId, s.email, null);
  }
  db.exec("COMMIT;");
  console.log(`[Isolated DB] Seeded 16 Staff Logins & Super-Admin profiles.`);

  db.prepare("INSERT OR REPLACE INTO _schema_meta (key, value) VALUES ('seeded_version', '1.0.0')").run();
  console.log("[Isolated DB] Master seeding completed successfully!");
}

seedMasterData();

// HTTP Request Handler
const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD");
  res.setHeader("Access-Control-Allow-Headers", "*, authorization, apikey, content-type, prefer, range");
  res.setHeader("Access-Control-Expose-Headers", "content-range, content-type, prefer");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host || "127.0.0.1:54321"}`);
  const pathname = url.pathname;

  let body = "";
  req.on("data", chunk => { body += chunk; });
  req.on("end", () => {
    try {
      handleRequest(req, res, url, pathname, body);
    } catch (err) {
      console.error("[Isolated DB Error]", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message || "Internal server error" }));
    }
  });
});

function handleRequest(req, res, url, pathname, body) {
  // 1. Health check & Root
  if (pathname === "/" || pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", mode: "isolated_mediglo_harmony", port: PORT }));
    return;
  }

  // 2. GoTrue Auth Endpoints (/auth/v1/...)
  if (pathname.startsWith("/auth/v1/")) {
    handleAuth(req, res, pathname, url, body);
    return;
  }

  // 3. PostgREST RPC Endpoints (/rest/v1/rpc/...)
  if (pathname.startsWith("/rest/v1/rpc/")) {
    const fnName = pathname.replace("/rest/v1/rpc/", "");
    handleRpc(req, res, fnName, body);
    return;
  }

  // 4. PostgREST Table Endpoints (/rest/v1/...)
  if (pathname.startsWith("/rest/v1/")) {
    const table = pathname.replace("/rest/v1/", "").split("/")[0];
    handleRest(req, res, table, url, body);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ message: `Route not found: ${pathname}` }));
}

function handleAuth(req, res, pathname, url, body) {
  // Login: POST /auth/v1/token?grant_type=password
  if (pathname === "/auth/v1/token") {
    let payload = {};
    try { payload = JSON.parse(body || "{}"); } catch {}
    const { email, password } = payload;
    console.log(`[Isolated Auth] Login attempt for email: ${email}`);

    // Check credentials:
    // admin@mediglo.in -> AdminPassword2026! or MediGlo@12345
    // all other staff -> MediGlo@12345 (or AdminPassword2026!)
    let isValid = false;
    if (email === "admin@mediglo.in" && (password === "AdminPassword2026!" || password === "MediGlo@12345")) {
      isValid = true;
    } else if (password === "MediGlo@12345" || password === "AdminPassword2026!") {
      isValid = true;
    }

    if (!isValid) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials" }));
      return;
    }

    // Look up profile
    let profile = db.prepare("SELECT * FROM profiles WHERE lower(email) = lower(?)").get(email);
    if (!profile) {
      const isSuper = email === "admin@mediglo.in" || email === "himuydv5@gmail.com" || email === "vikas@mediglo.in";
      profile = {
        id: "u-" + Buffer.from(email).toString("hex").slice(0, 16),
        email,
        full_name: email.split("@")[0],
        role: isSuper ? "admin" : "reception",
        is_admin: isSuper ? 1 : 0,
        can_bill: 1,
      };
      db.prepare("INSERT OR REPLACE INTO profiles (id, email, full_name, role, is_admin, can_bill) VALUES (?, ?, ?, ?, ?, ?)")
        .run(profile.id, profile.email, profile.full_name, profile.role, profile.is_admin, profile.can_bill);
    }

    const token = Buffer.from(JSON.stringify({ sub: profile.id, email: profile.email, exp: Date.now() + 86400000 })).toString("base64");

    const authResponse = {
      access_token: token,
      token_type: "bearer",
      expires_in: 86400,
      refresh_token: "ref-" + token.slice(0, 20),
      user: {
        id: profile.id,
        aud: "authenticated",
        role: "authenticated",
        email: profile.email,
        email_confirmed_at: "2026-01-01T00:00:00Z",
        phone: "",
        user_metadata: {
          full_name: profile.full_name,
          role: profile.role,
          is_admin: profile.is_admin === 1,
        },
        app_metadata: {
          provider: "email",
          providers: ["email"],
        },
      },
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(authResponse));
    return;
  }

  // GET /auth/v1/user
  if (pathname === "/auth/v1/user") {
    const authHeader = req.headers.authorization || "";
    let email = "admin@mediglo.in";
    if (authHeader.startsWith("Bearer ")) {
      try {
        const decoded = JSON.parse(Buffer.from(authHeader.replace("Bearer ", ""), "base64").toString("utf8"));
        if (decoded.email) email = decoded.email;
      } catch {}
    }

    let profile = db.prepare("SELECT * FROM profiles WHERE lower(email) = lower(?)").get(email);
    if (!profile) profile = db.prepare("SELECT * FROM profiles WHERE lower(email) = 'admin@mediglo.in'").get();

    const userObj = {
      id: profile ? profile.id : "u-admin",
      aud: "authenticated",
      role: "authenticated",
      email: profile ? profile.email : "admin@mediglo.in",
      email_confirmed_at: "2026-01-01T00:00:00Z",
      phone: "",
      user_metadata: {
        full_name: profile ? profile.full_name : "Super Admin",
        role: profile ? profile.role : "admin",
        is_admin: profile ? profile.is_admin === 1 : true,
      },
      app_metadata: { provider: "email", providers: ["email"] },
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(userObj));
    return;
  }

  // POST /auth/v1/logout
  if (pathname === "/auth/v1/logout") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({}));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
}

function handleRpc(req, res, fnName, body) {
  let payload = {};
  try { payload = JSON.parse(body || "{}"); } catch {}

  console.log(`[Isolated RPC] Executing RPC function: ${fnName}`);

  if (fnName === "my_billing_access") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      user_id: "u-admin",
      billing_locked: false,
      lock_reason: null,
      locked_at: null,
      locked_by_name: null,
      can_override_duplicate: true,
    }));
    return;
  }

  if (fnName === "check_duplicate_bill") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ level: "none", can_override: false, matches: [] }));
    return;
  }

  if (fnName === "log_billing_event") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ logged: true }));
    return;
  }

  if (fnName === "deduct_inventory_stock") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, count: 0 }));
    return;
  }

  // Fallback for any unknown RPC
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: true, result: null }));
}

function handleRest(req, res, table, url, body) {
  const method = req.method;

  // Verify table exists
  const tblCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
  if (!tblCheck) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify([]));
    return;
  }

  if (method === "GET") {
    const whereClauses = [];
    const params = [];

    // Parse filters
    for (const [key, value] of url.searchParams.entries()) {
      if (["select", "order", "limit", "offset"].includes(key)) continue;

      if (value.startsWith("eq.")) {
        whereClauses.push(`"${key}" = ?`);
        params.push(value.slice(3));
      } else if (value.startsWith("neq.")) {
        whereClauses.push(`"${key}" != ?`);
        params.push(value.slice(4));
      } else if (value.startsWith("ilike.")) {
        whereClauses.push(`lower("${key}") LIKE lower(?)`);
        params.push(value.slice(6));
      } else if (value.startsWith("in.")) {
        const raw = value.slice(3).replace(/^\(|\)$/g, "");
        const items = raw.split(",").map(s => s.trim().replace(/^"|"$/g, ""));
        if (items.length > 0) {
          const ph = items.map(() => "?").join(",");
          whereClauses.push(`"${key}" IN (${ph})`);
          params.push(...items);
        }
      } else if (value.startsWith("is.")) {
        const target = value.slice(3);
        if (target === "null") whereClauses.push(`"${key}" IS NULL`);
        else if (target === "true") whereClauses.push(`"${key}" = 1`);
        else if (target === "false") whereClauses.push(`"${key}" = 0`);
      } else if (value.startsWith("not.is.")) {
        if (value.slice(7) === "null") whereClauses.push(`"${key}" IS NOT NULL`);
      } else if (value.startsWith("gte.")) {
        whereClauses.push(`"${key}" >= ?`);
        params.push(value.slice(4));
      } else if (value.startsWith("lte.")) {
        whereClauses.push(`"${key}" <= ?`);
        params.push(value.slice(4));
      } else if (value.startsWith("gt.")) {
        whereClauses.push(`"${key}" > ?`);
        params.push(value.slice(3));
      } else if (value.startsWith("lt.")) {
        whereClauses.push(`"${key}" < ?`);
        params.push(value.slice(3));
      }
    }

    let sql = `SELECT * FROM "${table}"`;
    if (whereClauses.length > 0) {
      sql += " WHERE " + whereClauses.join(" AND ");
    }

    // Order
    const order = url.searchParams.get("order");
    if (order) {
      const parts = order.split(".");
      const col = parts[0];
      const dir = parts[1]?.toLowerCase() === "desc" ? "DESC" : "ASC";
      sql += ` ORDER BY "${col}" ${dir}`;
    }

    // Limit / Offset
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");
    if (limit) {
      sql += ` LIMIT ${Number(limit)}`;
      if (offset) sql += ` OFFSET ${Number(offset)}`;
    }

    const rows = db.prepare(sql).all(...params);

    // Range header / Count exact
    const countQuery = db.prepare(`SELECT count(*) as c FROM "${table}" ${whereClauses.length ? "WHERE " + whereClauses.join(" AND ") : ""}`).get(...params);
    const totalCount = countQuery ? countQuery.c : rows.length;

    res.setHeader("Content-Range", `0-${rows.length}/${totalCount}`);
    res.setHeader("Range-Unit", "items");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(rows));
    return;
  }

  if (method === "POST") {
    let payload = {};
    try { payload = JSON.parse(body || "{}"); } catch {}
    const items = Array.isArray(payload) ? payload : [payload];
    const inserted = [];

    if (table === "client_registrations") {
      for (const item of items) {
        const cleanPhone = (item.mobile_no || "").trim();
        const fullName = `${(item.first_name || "").toUpperCase()} ${item.last_name || ""}`.trim();
        let cust = null;
        if (cleanPhone) {
          cust = db.prepare("SELECT * FROM customers WHERE phone = ?").get(cleanPhone);
        }
        if (!cust && fullName) {
          cust = db.prepare("SELECT * FROM customers WHERE lower(name) = lower(?)").get(fullName);
        }
        if (cust) {
          item.customer_id = cust.id;
          db.prepare("UPDATE customers SET age = COALESCE(?, age), gender = COALESCE(?, gender), city = COALESCE(?, city), email = COALESCE(?, email), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(item.age, item.gender, item.city, item.email, cust.id);
        } else {
          const custId = "c-" + Math.random().toString(36).slice(2, 10);
          item.customer_id = custId;
          db.prepare("INSERT INTO customers (id, name, phone, age, gender, city, email, state_code, client_type, outstanding_balance) VALUES (?, ?, ?, ?, ?, ?, ?, '06', 'New', 0)")
            .run(custId, fullName || "Walk-in Client", cleanPhone || null, item.age || null, item.gender || null, item.city || "Gurugram", item.email || null);
        }
      }
    }

    const insertTx = db.transaction((rows) => {
      for (const item of rows) {
        if (!item.id) item.id = "id-" + Math.random().toString(36).slice(2, 10);
        const cols = Object.keys(item);
        const placeholders = cols.map(() => "?").join(", ");
        const insertSql = `INSERT OR REPLACE INTO "${table}" (${cols.map(c => `"${c}"`).join(", ")}) VALUES (${placeholders})`;
        db.prepare(insertSql).run(...cols.map(c => typeof item[c] === "object" ? JSON.stringify(item[c]) : item[c]));
        inserted.push(item);
      }
    });
    insertTx(items);

    res.writeHead(201, { "Content-Type": "application/json" });
    res.end(JSON.stringify(Array.isArray(payload) ? inserted : inserted[0] || {}));
    return;
  }

  if (method === "PATCH") {
    let payload = {};
    try { payload = JSON.parse(body || "{}"); } catch {}

    const whereClauses = [];
    const params = [];
    for (const [key, value] of url.searchParams.entries()) {
      if (value.startsWith("eq.")) {
        whereClauses.push(`"${key}" = ?`);
        params.push(value.slice(3));
      }
    }

    const setCols = Object.keys(payload);
    const setSql = setCols.map(c => `"${c}" = ?`).join(", ");
    const updateParams = setCols.map(c => typeof payload[c] === "object" ? JSON.stringify(payload[c]) : payload[c]);

    let sql = `UPDATE "${table}" SET ${setSql}`;
    if (whereClauses.length > 0) {
      sql += " WHERE " + whereClauses.join(" AND ");
    }
    db.prepare(sql).run(...updateParams, ...params);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
    return;
  }

  if (method === "DELETE") {
    const whereClauses = [];
    const params = [];
    for (const [key, value] of url.searchParams.entries()) {
      if (value.startsWith("eq.")) {
        whereClauses.push(`"${key}" = ?`);
        params.push(value.slice(3));
      } else if (value.startsWith("in.")) {
        const raw = value.slice(3).replace(/^\(|\)$/g, "");
        const items = raw.split(",").map(s => s.trim().replace(/^"|"$/g, ""));
        const ph = items.map(() => "?").join(",");
        whereClauses.push(`"${key}" IN (${ph})`);
        params.push(...items);
      }
    }

    let sql = `DELETE FROM "${table}"`;
    if (whereClauses.length > 0) {
      sql += " WHERE " + whereClauses.join(" AND ");
    }
    db.prepare(sql).run(...params);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: `Method ${method} not allowed` }));
}

server.listen(PORT, HOST, () => {
  console.log(`[Isolated DB Server] Running at http://${HOST}:${PORT}`);
  console.log(`[Isolated DB Server] Mode: MediGlo Harmony Clean Slate (₹0 Billing, 3 Master Lists active)`);
});
