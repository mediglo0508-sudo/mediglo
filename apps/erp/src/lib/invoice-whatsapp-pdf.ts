// ============================================================================
// MediGlo Invoice PDF & WhatsApp Dispatch Engine
// Generates official compliant PDF invoices (binary blob) with zero external deps
// and dispatches itemized WhatsApp receipts with pre-filled thank you note
// ============================================================================

export interface InvoiceShareData {
  invoiceNo: string;
  invoiceDate: string;
  customerName: string;
  customerPhone?: string | null;
  paymentMode: string;
  lines: Array<{
    description: string;
    qty: number;
    rate: number;
    total: number;
  }>;
  baseAmount: number;
  cgst: number;
  sgst: number;
  grossTotal: number;
  paidAmount?: number;
  pendingBalance?: number;
}

/**
 * Generates a clean, standard PDF 1.4 document as a Blob
 */
export function generateInvoicePdfBlob(data: InvoiceShareData): Blob {
  const sanitize = (str: string) =>
    (str || "").replace(/[()\\]/g, " ").replace(/[^\x20-\x7E]/g, "");

  const safeInvoiceNo = sanitize(data.invoiceNo || "INV-NEW");
  const safeCustomer = sanitize(data.customerName || "Valued Client");
  const safePhone = sanitize(data.customerPhone || "N/A");
  const safeDate = sanitize(data.invoiceDate || new Date().toISOString().slice(0, 10));
  const safePayMode = sanitize(data.paymentMode || "UPI / Digital");

  // Construct PDF stream commands
  const streamLines: string[] = [];

  // Coordinate system: Origin (0,0) at bottom-left of A4 (595 x 842 points)
  // Draw Top Banner (Burgundy bar)
  streamLines.push("0.36 0.15 0.21 rg"); // #5C2536 Burgundy
  streamLines.push("36 786 523 20 re f");

  // Letterhead Title
  streamLines.push("BT");
  streamLines.push("/F2 20 Tf");
  streamLines.push("0.36 0.15 0.21 rg");
  streamLines.push("36 750 Td");
  streamLines.push("(MEDIGLO CLINIC & AESTHETICS) Tj");
  streamLines.push("ET");

  // Subtitle
  streamLines.push("BT");
  streamLines.push("/F1 9 Tf");
  streamLines.push("0.3 0.3 0.3 rg");
  streamLines.push("36 736 Td");
  streamLines.push("(A1/243 Second Floor, Raghvendra Marg, Block A1, Gurugram 122011, Haryana) Tj");
  streamLines.push("0 -12 Td");
  streamLines.push("(Phone: +91 7303338004  |  Website: www.mediglo.in  |  GSTIN: 06ABCDE1234F1Z5) Tj");
  streamLines.push("ET");

  // Divider Line
  streamLines.push("0.36 0.15 0.21 RG");
  streamLines.push("1.5 w");
  streamLines.push("36 712 m 559 712 l S");

  // Document Title & Metadata
  streamLines.push("BT");
  streamLines.push("/F2 13 Tf");
  streamLines.push("0.1 0.1 0.1 rg");
  streamLines.push("36 690 Td");
  streamLines.push("(TAX INVOICE / CASH MEMO) Tj");
  streamLines.push("ET");

  // Invoice Details Box (Left: Customer, Right: Invoice Info)
  streamLines.push("BT");
  streamLines.push("/F1 9 Tf");
  streamLines.push("0.2 0.2 0.2 rg");
  streamLines.push("36 672 Td");
  streamLines.push(`(Billed To: ${safeCustomer}) Tj`);
  streamLines.push("0 -13 Td");
  streamLines.push(`(Mobile: ${safePhone}) Tj`);
  streamLines.push("0 -13 Td");
  streamLines.push("(State: Haryana [06]) Tj");

  // Right column
  streamLines.push("360 26 Td");
  streamLines.push(`(Invoice No: ${safeInvoiceNo}) Tj`);
  streamLines.push("0 -13 Td");
  streamLines.push(`(Date: ${safeDate}) Tj`);
  streamLines.push("0 -13 Td");
  streamLines.push(`(Payment Mode: ${safePayMode}) Tj`);
  streamLines.push("ET");

  // Table Header Box
  streamLines.push("0.94 0.94 0.96 rg"); // Light gray
  streamLines.push("36 622 523 18 re f");

  streamLines.push("BT");
  streamLines.push("/F2 9 Tf");
  streamLines.push("0.1 0.1 0.1 rg");
  streamLines.push("42 627 Td");
  streamLines.push("(S.No) Tj");
  streamLines.push("40 0 Td");
  streamLines.push("(Description / Treatment / Medicine) Tj");
  streamLines.push("260 0 Td");
  streamLines.push("(Qty) Tj");
  streamLines.push("50 0 Td");
  streamLines.push("(Rate) Tj");
  streamLines.push("60 0 Td");
  streamLines.push("(Amount) Tj");
  streamLines.push("ET");

  // Table Rows
  let currentY = 606;
  data.lines.forEach((l, index) => {
    if (currentY < 180) return; // Prevent page overflow
    const safeDesc = sanitize(l.description).slice(0, 42);
    streamLines.push("BT");
    streamLines.push("/F1 9 Tf");
    streamLines.push("0.2 0.2 0.2 rg");
    streamLines.push(`42 ${currentY} Td`);
    streamLines.push(`(${index + 1}) Tj`);
    streamLines.push(`40 0 Td`);
    streamLines.push(`(${safeDesc}) Tj`);
    streamLines.push(`260 0 Td`);
    streamLines.push(`(${l.qty}) Tj`);
    streamLines.push(`50 0 Td`);
    streamLines.push(`(INR ${l.rate.toFixed(2)}) Tj`);
    streamLines.push(`60 0 Td`);
    streamLines.push(`(INR ${l.total.toFixed(2)}) Tj`);
    streamLines.push("ET");

    // Dotted separator line
    streamLines.push("0.85 0.85 0.85 RG");
    streamLines.push("0.5 w");
    streamLines.push(`36 ${currentY - 3} m 559 ${currentY - 3} l S`);

    currentY -= 16;
  });

  // Totals Area
  const totalsY = Math.min(currentY - 10, 320);
  streamLines.push("0.36 0.15 0.21 RG");
  streamLines.push("1 w");
  streamLines.push(`350 ${totalsY + 4} m 559 ${totalsY + 4} l S`);

  streamLines.push("BT");
  streamLines.push("/F1 9 Tf");
  streamLines.push("0.2 0.2 0.2 rg");
  streamLines.push(`360 ${totalsY - 10} Td`);
  streamLines.push(`(Taxable Base:  INR ${data.baseAmount.toFixed(2)}) Tj`);
  streamLines.push("0 -13 Td");
  streamLines.push(`(CGST (2.5%):  INR ${data.cgst.toFixed(2)}) Tj`);
  streamLines.push("0 -13 Td");
  streamLines.push(`(SGST (2.5%):  INR ${data.sgst.toFixed(2)}) Tj`);

  // Grand Total in Bold Burgundy
  streamLines.push("0 -16 Td");
  streamLines.push("/F2 12 Tf");
  streamLines.push("0.36 0.15 0.21 rg");
  streamLines.push(`(GRAND TOTAL:  INR ${data.grossTotal.toFixed(2)}) Tj`);
  streamLines.push("ET");

  // Footer & Thank You
  streamLines.push("BT");
  streamLines.push("/F2 10 Tf");
  streamLines.push("0.36 0.15 0.21 rg");
  streamLines.push("36 90 Td");
  streamLines.push("(Thank You for Choosing MediGlo Clinic & Aesthetics!) Tj");
  streamLines.push("ET");

  streamLines.push("BT");
  streamLines.push("/F1 8 Tf");
  streamLines.push("0.4 0.4 0.4 rg");
  streamLines.push("36 76 Td");
  streamLines.push("(For support, appointments & queries, reach our desk at +91 7303338004 or info@mediglo.in) Tj");
  streamLines.push("0 -10 Td");
  streamLines.push("(Gurugram, Haryana  |  Computer Generated Tax Invoice  |  No physical signature required) Tj");
  streamLines.push("ET");

  const streamContent = streamLines.join("\n");
  const streamLength = streamContent.length;

  // Build standard PDF structure
  const pdfBody = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page
   /Parent 2 0 R
   /MediaBox [0 0 595 842]
   /Resources <<
     /Font <<
       /F1 4 0 R
       /F2 5 0 R
     >>
   >>
   /Contents 6 0 R
>>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>
endobj
6 0 obj
<< /Length ${streamLength} >>
stream
${streamContent}
endstream
endobj
xref
0 7
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000305 00000 n 
0000000373 00000 n 
0000000446 00000 n 
trailer
<< /Size 7 /Root 1 0 R >>
startxref
${520 + streamLength}
%%EOF`;

  return new Blob([pdfBody], { type: "application/pdf" });
}

/**
 * Downloads the generated invoice PDF file to user's device
 */
export function downloadInvoicePdf(data: InvoiceShareData): string {
  const blob = generateInvoicePdfBlob(data);
  const cleanName = (data.customerName || "Client").replace(/[^a-zA-Z0-9]/g, "_");
  const cleanInvNo = (data.invoiceNo || "INV").replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `MediGlo_Invoice_${cleanInvNo}_${cleanName}.pdf`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  return fileName;
}

/**
 * Formats a WhatsApp message and opens WhatsApp Web/App deep link
 */
export function shareInvoiceViaWhatsApp(data: InvoiceShareData, fileName: string) {
  const cleanPhone = (data.customerPhone || "").replace(/\D/g, "").slice(-10);

  const lineItemsText = data.lines
    .map((l, i) => `  ${i + 1}. *${l.description}* (${l.qty}x) — ₹${l.total.toFixed(2)}`)
    .join("\n");

  const message = `✨ *MEDIGLO CLINIC & AESTHETICS* ✨
A1/243 Second Floor, Raghvendra Marg, Block A1, Gurugram

Dear *${data.customerName}*,

Thank you for visiting MediGlo Clinic today! 🌸
Here is your official invoice & treatment summary:

🧾 *Invoice No:* ${data.invoiceNo}
📅 *Date:* ${data.invoiceDate}
💳 *Payment Mode:* ${data.paymentMode}

*Billed Services & Products:*
${lineItemsText}

───────────────
💰 *Taxable Base:* ₹${data.baseAmount.toFixed(2)}
🏛️ *GST (5%):* ₹${(data.cgst + data.sgst).toFixed(2)}
🌟 *Grand Total:* ₹${data.grossTotal.toFixed(2)}
───────────────

📥 *Your official PDF Tax Invoice (${fileName}) has been downloaded to your device.*

We look forward to seeing you at your next session! For queries or next appointments, call us at *+91 7303338004* or visit *www.mediglo.in*.

Warm Regards,
*Team MediGlo Clinic*`;

  const encoded = encodeURIComponent(message);
  const waUrl = cleanPhone
    ? `https://wa.me/91${cleanPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;

  window.open(waUrl, "_blank");
}
