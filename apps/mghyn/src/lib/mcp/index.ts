import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchCustomers from "./tools/search-customers";
import listAppointments from "./tools/list-appointments";
import revenueSummary from "./tools/revenue-summary";
import lowStockItems from "./tools/low-stock";
import createFollowUp from "./tools/create-follow-up";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "mediglo-harmony",
  title: "MediGlo Harmony",
  version: "0.1.0",
  instructions:
    "Tools for the MGHYN clinic ERP. Search CRM customers, list appointments by date range, summarise invoice revenue, check low inventory stock, and create follow-up desk tasks. All data access runs as the signed-in staff member with their existing role permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchCustomers, listAppointments, revenueSummary, lowStockItems, createFollowUp],
});
