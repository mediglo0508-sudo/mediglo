// Local In-Browser OCR & Vendor Bill Parsing Engine
// Zero external API calls - uses tesseract.js and intelligent regex table heuristics

export interface ParsedBillItem {
  id: string;
  name: string;
  matchedInventoryId?: string | null;
  matchedInventoryName?: string | null;
  batchNo?: string;
  expiry?: string;
  hsnCode?: string;
  quantity: number;
  rate: number;
  mrp: number;
  gstPct: number;
  lineTotal: number;
}

export interface ParsedBill {
  vendorName: string;
  matchedVendorId?: string | null;
  billNo: string;
  billDate: string;
  items: ParsedBillItem[];
  subtotal: number;
  gstAmount: number;
  grandTotal: number;
  rawText: string;
}

export interface InventoryLookupItem {
  id: string;
  name: string;
  rate?: number;
  stock?: number;
  company?: string | null;
}

export interface VendorLookupItem {
  id: string;
  name: string;
  gstin?: string | null;
  phone?: string | null;
  address?: string | null;
}

/** Compute fuzzy token similarity between 0 and 1 */
function tokenSimilarity(strA: string, strB: string): number {
  const normA = strA.toLowerCase().replace(/[^a-z0-9]/g, " ").trim().split(/\s+/).filter(Boolean);
  const normB = strB.toLowerCase().replace(/[^a-z0-9]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!normA.length || !normB.length) return 0;
  
  const setB = new Set(normB);
  let matches = 0;
  for (const token of normA) {
    if (setB.has(token) || Array.from(setB).some(b => b.includes(token) || token.includes(b))) {
      matches++;
    }
  }
  return (matches * 2) / (normA.length + normB.length);
}

/** Fuzzy match extracted product title against master inventory list */
export function fuzzyMatchInventory(
  name: string,
  inventory: InventoryLookupItem[]
): { item: InventoryLookupItem | null; confidence: number } {
  if (!name.trim() || !inventory.length) return { item: null, confidence: 0 };
  const cleanName = name.trim().toLowerCase();

  // 1. Exact match
  const exact = inventory.find(i => i.name.trim().toLowerCase() === cleanName);
  if (exact) return { item: exact, confidence: 1.0 };

  // 2. Starts with / includes
  const contains = inventory.find(i => {
    const invName = i.name.toLowerCase();
    return invName.includes(cleanName) || cleanName.includes(invName);
  });
  if (contains) return { item: contains, confidence: 0.85 };

  // 3. Best token score
  let bestScore = 0;
  let bestItem: InventoryLookupItem | null = null;
  for (const inv of inventory) {
    const score = tokenSimilarity(cleanName, inv.name);
    if (score > bestScore) {
      bestScore = score;
      bestItem = inv;
    }
  }

  if (bestScore >= 0.45) {
    return { item: bestItem, confidence: bestScore };
  }
  return { item: null, confidence: 0 };
}

/** Fuzzy match vendor from extracted text */
export function fuzzyMatchVendor(
  vendorText: string,
  vendors: VendorLookupItem[]
): VendorLookupItem | null {
  if (!vendorText || !vendors.length) return null;
  const lower = vendorText.toLowerCase();
  return vendors.find(v => lower.includes(v.name.toLowerCase()) || v.name.toLowerCase().includes(lower)) ?? null;
}

/** Parse raw OCR text into structured vendor bill fields */
export function parseBillText(
  rawText: string,
  vendors: VendorLookupItem[] = [],
  inventory: InventoryLookupItem[] = []
): ParsedBill {
  const lines = rawText
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // 1. Detect Vendor Name from header lines
  let vendorName = "";
  let matchedVendorId: string | null = null;

  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i];
    // Check if line matches an existing vendor
    const foundVendor = fuzzyMatchVendor(line, vendors);
    if (foundVendor) {
      vendorName = foundVendor.name;
      matchedVendorId = foundVendor.id;
      break;
    }

    // Check for common pharmacy vendor indicators
    if (
      /(?:pharma|laboratories|enterprises|distributors|medicos|pharmaceuticals|life sciences|healthcare|ltd|pvt)/i.test(line) &&
      !/(?:invoice|bill|tax|gstin|date|dl no|cash memo)/i.test(line)
    ) {
      vendorName = line.replace(/^(?:M\/s|Messrs\.?)\s+/i, "").trim();
      break;
    }
  }

  if (!vendorName && lines.length > 0) {
    vendorName = lines[0].replace(/^(?:M\/s|Messrs\.?)\s+/i, "").trim();
  }

  // 2. Detect Invoice / Bill Number
  let billNo = "";
  const billNoRegex = /(?:inv(?:oice)?|bill|memo|receipt)\s*(?:no\.?|num(?:ber)?|#)?\s*[:.-]?\s*([A-Za-z0-9\/-]+)/i;
  for (const line of lines) {
    const match = line.match(billNoRegex);
    if (match && match[1] && match[1].length >= 3) {
      billNo = match[1].trim();
      break;
    }
  }
  if (!billNo) {
    billNo = `BILL-${Date.now().toString().slice(-6)}`;
  }

  // 3. Detect Bill Date
  let billDate = new Date().toISOString().slice(0, 10);
  const dateRegex = /\b(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})\b/;
  for (const line of lines) {
    if (/(?:date|dt|invoice date|dated)/i.test(line)) {
      const match = line.match(dateRegex);
      if (match) {
        const d = match[1].padStart(2, "0");
        const m = match[2].padStart(2, "0");
        let y = match[3];
        if (y.length === 2) y = `20${y}`;
        billDate = `${y}-${m}-${d}`;
        break;
      }
    }
  }

  // 4. Line Items Table Extraction
  const items: ParsedBillItem[] = [];
  const expiryRegex = /\b(0[1-9]|1[0-2])[-\/.](20\d{2}|\d{2})\b/;
  const batchRegex = /\b(?:b(?:atch)?(?:\s*no)?\.?\s*[:.-]?\s*)?([A-Z0-9]{4,12})\b/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip common header, footer, tax summary lines
    if (
      /^(?:subtotal|grand total|total|taxable|cgst|sgst|igst|amount in words|authorized|e\.&o\.e|terms|bank)/i.test(line) ||
      /^(?:s\.?no|sl|item|description|product|particulars|qty|rate|mrp|batch|exp)/i.test(line)
    ) {
      continue;
    }

    // Extract numbers from the line
    const numbers = line.match(/\b\d+(?:\.\d+)?\b/g);
    if (!numbers || numbers.length < 2) continue;

    // Check if line contains a recognizable medicine/product name or letters
    const words = line.replace(/[0-9.,\/:#\-]/g, " ").trim().split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) continue;

    const rawName = words.slice(0, 5).join(" ");
    if (rawName.length < 3) continue;

    // Parse potential numeric values
    const floats = numbers.map(Number);
    
    // Quantity: usually an integer between 1 and 500
    const qtyCandidate = floats.find(n => Number.isInteger(n) && n >= 1 && n <= 1000) ?? 1;

    // Rate / Price: decimal or reasonable price
    const rateCandidate = floats.find(n => n > 20 && n !== qtyCandidate) ?? 100;
    
    // MRP: often slightly higher than purchase rate
    const mrpCandidate = floats.find(n => n >= rateCandidate) ?? Math.round(rateCandidate * 1.25);

    // GST: 0, 5, 12, 18, 28
    const gstCandidate = floats.find(n => [0, 5, 12, 18, 28].includes(n)) ?? 5;

    // Expiry match
    const expMatch = line.match(expiryRegex);
    const expiry = expMatch ? `${expMatch[1]}/${expMatch[2]}` : "12/28";

    // Batch match
    const batchMatch = line.match(batchRegex);
    const batchNo = batchMatch && batchMatch[1] && !/^\d+$/.test(batchMatch[1]) ? batchMatch[1] : `BT${Date.now().toString().slice(-4)}`;

    // HSN match (4 to 8 digits)
    const hsnMatch = line.match(/\b(3004\d{0,4}|999312|\d{6,8})\b/);
    const hsnCode = hsnMatch ? hsnMatch[1] : "300490";

    // Match against inventory
    const match = fuzzyMatchInventory(rawName, inventory);

    const lineTotal = Math.round(qtyCandidate * rateCandidate * (1 + gstCandidate / 100) * 100) / 100;

    items.push({
      id: `item-${items.length + 1}`,
      name: match.item ? match.item.name : rawName,
      matchedInventoryId: match.item?.id ?? null,
      matchedInventoryName: match.item?.name ?? null,
      batchNo,
      expiry,
      hsnCode,
      quantity: qtyCandidate,
      rate: rateCandidate,
      mrp: mrpCandidate,
      gstPct: gstCandidate,
      lineTotal,
    });
  }

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
  const grandTotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const gstAmount = Math.round((grandTotal - subtotal) * 100) / 100;

  return {
    vendorName,
    matchedVendorId,
    billNo,
    billDate,
    items,
    subtotal: Math.round(subtotal * 100) / 100,
    gstAmount,
    grandTotal: Math.round(grandTotal * 100) / 100,
    rawText,
  };
}
