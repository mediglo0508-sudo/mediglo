import type { QueryClient } from "@tanstack/react-query";

/**
 * Every screen that shows money derived from invoices.
 * Any invoice write (save / revise / void / delete) must refresh all of them,
 * otherwise an edited bill keeps showing its pre-edit total.
 */
const LEDGER_KEY_PREFIXES = [
  "invoices",
  "invoice-lines",
  "customers",
  "customers-pos-lookup",
  "cust-ledger",
  "cust-outstanding-pos",
  "cust-packages-pos",
  "dashboard",
  "reception",
  "export-invoices",
  "recon-inv-search",
  "notifications",
  "performance",
];

/** Prefix-invalidate every invoice-derived query so ledgers re-read the true totals. */
export function invalidateLedger(qc: QueryClient) {
  qc.invalidateQueries({
    predicate: (q) => {
      const k = q.queryKey?.[0];
      return typeof k === "string" && LEDGER_KEY_PREFIXES.some((p) => k.startsWith(p));
    },
  });
}
