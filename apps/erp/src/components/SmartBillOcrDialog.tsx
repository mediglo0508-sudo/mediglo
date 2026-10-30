import { useState, useRef } from "react";
import { createWorker } from "tesseract.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Scan,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Plus,
  PackageCheck,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { inr2 } from "@/lib/gst";
import {
  parseBillText,
  type ParsedBill,
  type ParsedBillItem,
  type InventoryLookupItem,
  type VendorLookupItem,
} from "@/lib/ocr-bill-parser";

interface SmartBillOcrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inventory: InventoryLookupItem[];
  vendors: VendorLookupItem[];
  onApplyBill: (bill: ParsedBill) => void;
  onDirectStockIn?: (bill: ParsedBill) => Promise<void>;
}

export function SmartBillOcrDialog({
  open,
  onOpenChange,
  inventory,
  vendors,
  onApplyBill,
  onDirectStockIn,
}: SmartBillOcrDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [parsedBill, setParsedBill] = useState<ParsedBill | null>(null);
  const [rawText, setRawText] = useState("");
  const [stockingIn, setStockingIn] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetState() {
    setFile(null);
    setPreviewUrl(null);
    setScanning(false);
    setProgress(0);
    setStatusText("");
    setParsedBill(null);
    setRawText("");
    setStockingIn(false);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    const url = URL.createObjectURL(selected);
    setPreviewUrl(url);
    processFileOcr(selected);
  }

  async function processFileOcr(fileToScan: File) {
    setScanning(true);
    setProgress(10);
    setStatusText("Initializing In-Browser OCR Engine...");
    setParsedBill(null);

    try {
      // If it's a plain text or json file, read directly
      if (fileToScan.type.includes("text") || fileToScan.name.endsWith(".txt")) {
        const text = await fileToScan.text();
        setRawText(text);
        const parsed = parseBillText(text, vendors, inventory);
        setParsedBill(parsed);
        setProgress(100);
        setStatusText("Completed!");
        toast.success(`Extracted ${parsed.items.length} bill items!`);
        return;
      }

      // Create browser-native Tesseract worker
      setProgress(25);
      setStatusText("Loading OCR neural recognition models...");
      const worker = await createWorker("eng");

      setProgress(50);
      setStatusText("Scanning vendor invoice text & line items...");

      const { data: { text } } = await worker.recognize(fileToScan);
      await worker.terminate();

      setProgress(85);
      setStatusText("Parsing invoice layout, medicine names & tax rates...");
      setRawText(text);

      const parsed = parseBillText(text, vendors, inventory);
      setParsedBill(parsed);

      setProgress(100);
      setStatusText("Extraction complete!");

      if (parsed.items.length > 0) {
        toast.success(`Smart OCR extracted ${parsed.items.length} items from ${parsed.vendorName || "vendor bill"}!`);
      } else {
        toast.warning("Invoice parsed, but line items were unclear. You can manually adjust the table.");
      }
    } catch (err: any) {
      console.error("OCR scanning error:", err);
      toast.error("Failed to extract invoice text. Please try another image or enter manually.");
      setStatusText("Error during recognition");
    } finally {
      setScanning(false);
    }
  }

  // Update line item in parsed bill
  function updateLineItem(id: string, updates: Partial<ParsedBillItem>) {
    if (!parsedBill) return;
    const nextItems = parsedBill.items.map((item) => {
      if (item.id !== id) return item;
      const merged = { ...item, ...updates };
      merged.lineTotal = Math.round(merged.quantity * merged.rate * (1 + merged.gstPct / 100) * 100) / 100;
      return merged;
    });

    const subtotal = nextItems.reduce((s, it) => s + (it.quantity * it.rate), 0);
    const grandTotal = nextItems.reduce((s, it) => s + it.lineTotal, 0);

    setParsedBill({
      ...parsedBill,
      items: nextItems,
      subtotal: Math.round(subtotal * 100) / 100,
      gstAmount: Math.round((grandTotal - subtotal) * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
    });
  }

  function removeLineItem(id: string) {
    if (!parsedBill) return;
    const nextItems = parsedBill.items.filter((it) => it.id !== id);
    const subtotal = nextItems.reduce((s, it) => s + (it.quantity * it.rate), 0);
    const grandTotal = nextItems.reduce((s, it) => s + it.lineTotal, 0);
    setParsedBill({
      ...parsedBill,
      items: nextItems,
      subtotal: Math.round(subtotal * 100) / 100,
      gstAmount: Math.round((grandTotal - subtotal) * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
    });
  }

  function addEmptyLine() {
    if (!parsedBill) return;
    const newItem: ParsedBillItem = {
      id: `item-${Date.now()}`,
      name: "New Product / Medicine",
      quantity: 1,
      rate: 100,
      mrp: 125,
      gstPct: 5,
      lineTotal: 105,
      batchNo: "BT2401",
      expiry: "12/28",
      hsnCode: "300490",
    };
    setParsedBill({
      ...parsedBill,
      items: [...parsedBill.items, newItem],
    });
  }

  async function handleApplyToForm() {
    if (!parsedBill) return;
    onApplyBill(parsedBill);
    onOpenChange(false);
    resetState();
  }

  async function handleStockInAll() {
    if (!parsedBill || !onDirectStockIn) return;
    setStockingIn(true);
    try {
      await onDirectStockIn(parsedBill);
      toast.success(`Successfully stocked-in ${parsedBill.items.length} items from ${parsedBill.vendorName}!`);
      onOpenChange(false);
      resetState();
    } catch (err: any) {
      toast.error(err.message || "Failed to stock in items.");
    } finally {
      setStockingIn(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetState(); onOpenChange(v); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Scan className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                Smart OCR Vendor Bill Scanner
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">
                  <Sparkles className="h-3 w-3 mr-1" /> 100% In-Browser Engine
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Upload or drop vendor purchase invoices (Images &amp; Documents). Auto-extracts Vendor, Bill #, Date &amp; Table Line Items.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Upload Drop Zone */}
        {!parsedBill && (
          <div className="space-y-4 py-4">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*,.pdf,.txt"
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-muted-foreground/30 hover:border-primary/60 rounded-xl p-8 text-center cursor-pointer transition-colors bg-muted/20 hover:bg-muted/40"
            >
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-3">
                <UploadCloud className="h-6 w-6" />
              </div>
              <p className="font-semibold text-sm">Click or Drag &amp; Drop Vendor Invoice</p>
              <p className="text-xs text-muted-foreground mt-1">Supports PNG, JPG, JPEG, WebP, PDF or Camera Scans</p>
              <Button size="sm" variant="outline" className="mt-4">
                Select Bill Image / PDF
              </Button>
            </div>

            {scanning && (
              <div className="space-y-2 p-4 bg-muted/40 rounded-lg border">
                <div className="flex justify-between text-xs font-medium">
                  <span className="flex items-center gap-1.5 text-primary">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {statusText}
                  </span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}
          </div>
        )}

        {/* Parsed Bill Review */}
        {parsedBill && (
          <div className="space-y-5 py-2">
            {/* Header info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-muted/30 border rounded-lg">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Vendor / Company</Label>
                <Input
                  value={parsedBill.vendorName}
                  onChange={(e) => setParsedBill({ ...parsedBill, vendorName: e.target.value })}
                  placeholder="e.g. Cipla Healthcare Ltd."
                  className="font-medium"
                />
                {parsedBill.matchedVendorId && (
                  <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Matched Vendor Directory
                  </Badge>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Invoice / Bill Number</Label>
                <Input
                  value={parsedBill.billNo}
                  onChange={(e) => setParsedBill({ ...parsedBill, billNo: e.target.value })}
                  placeholder="e.g. INV-8921"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Invoice Date</Label>
                <Input
                  type="date"
                  value={parsedBill.billDate}
                  onChange={(e) => setParsedBill({ ...parsedBill, billDate: e.target.value })}
                />
              </div>
            </div>

            {/* Line Items Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <PackageCheck className="h-4 w-4 text-primary" /> Extracted Line Items ({parsedBill.items.length})
                </Label>
                <Button size="sm" variant="ghost" onClick={addEmptyLine} className="h-7 text-xs">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Line Item
                </Button>
              </div>

              {parsedBill.items.length === 0 ? (
                <div className="text-center py-8 border rounded-lg bg-muted/10 text-muted-foreground text-xs">
                  No line items could be parsed automatically. Click &quot;Add Line Item&quot; to enter manually.
                </div>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/70 text-muted-foreground font-semibold">
                      <tr>
                        <th className="px-3 py-2 text-left">Medicine / Product</th>
                        <th className="px-2 py-2 text-left">Batch</th>
                        <th className="px-2 py-2 text-left">Exp</th>
                        <th className="px-2 py-2 text-center w-16">Qty</th>
                        <th className="px-2 py-2 text-right w-20">Rate (₹)</th>
                        <th className="px-2 py-2 text-right w-20">MRP (₹)</th>
                        <th className="px-2 py-2 text-center w-16">GST%</th>
                        <th className="px-3 py-2 text-right w-24">Total (₹)</th>
                        <th className="px-2 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {parsedBill.items.map((item) => (
                        <tr key={item.id} className="hover:bg-muted/30">
                          <td className="px-3 py-2">
                            <Input
                              value={item.name}
                              onChange={(e) => updateLineItem(item.id, { name: e.target.value })}
                              className="h-7 text-xs font-medium"
                            />
                            {item.matchedInventoryName && (
                              <span className="text-[10px] text-emerald-600 block mt-0.5 truncate max-w-[200px]">
                                ✓ Matched: {item.matchedInventoryName}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <Input
                              value={item.batchNo || ""}
                              onChange={(e) => updateLineItem(item.id, { batchNo: e.target.value })}
                              className="h-7 text-xs w-20"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <Input
                              value={item.expiry || ""}
                              onChange={(e) => updateLineItem(item.id, { expiry: e.target.value })}
                              className="h-7 text-xs w-20"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => updateLineItem(item.id, { quantity: parseInt(e.target.value) || 1 })}
                              className="h-7 text-xs text-center w-16"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              step="0.01"
                              value={item.rate}
                              onChange={(e) => updateLineItem(item.id, { rate: parseFloat(e.target.value) || 0 })}
                              className="h-7 text-xs text-right w-20"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              step="0.01"
                              value={item.mrp}
                              onChange={(e) => updateLineItem(item.id, { mrp: parseFloat(e.target.value) || 0 })}
                              className="h-7 text-xs text-right w-20"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              value={item.gstPct}
                              onChange={(e) => updateLineItem(item.id, { gstPct: parseFloat(e.target.value) || 0 })}
                              className="h-7 text-xs text-center w-16"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">
                            {inr2(item.lineTotal)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removeLineItem(item.id)}
                              className="h-6 w-6 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Totals Summary */}
              <div className="flex justify-end p-3 bg-muted/40 rounded-lg text-xs space-y-1">
                <div className="w-64 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Taxable Subtotal:</span>
                    <span className="font-medium">{inr2(parsedBill.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total GST:</span>
                    <span className="font-medium">{inr2(parsedBill.gstAmount)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 font-bold text-sm text-foreground">
                    <span>Grand Total:</span>
                    <span className="text-primary">{inr2(parsedBill.grandTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between gap-2 border-t pt-3">
          {parsedBill ? (
            <>
              <Button variant="ghost" size="sm" onClick={resetState}>
                Scan Another Bill
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleApplyToForm}>
                  Populate In Purchase Form
                </Button>
                {onDirectStockIn && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                    disabled={stockingIn || !parsedBill.items.length}
                    onClick={handleStockInAll}
                  >
                    {stockingIn ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                    )}
                    Approve &amp; Stock-In All Items
                  </Button>
                )}
              </div>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
