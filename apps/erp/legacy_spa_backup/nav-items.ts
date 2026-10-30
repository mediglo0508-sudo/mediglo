import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Stethoscope,
  HeartHandshake,
  Pill,
  ShoppingBasket,
  Receipt,
  Wallet,
  BarChart3,
  UserCog,
  FileSpreadsheet,
  Boxes,
  Sparkles,
  ShoppingBag,
} from "lucide-react";
import type { StaffRole } from "@/types/domain";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: StaffRole[] | "all";
}

/** Every nav item and exactly which roles may see it - the single source of truth for the sidebar and route guards. */
export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: "all" },
  { to: "/appointments", label: "Appointments", icon: CalendarDays, roles: ["admin", "reception", "doctor", "counselor", "therapist"] },
  { to: "/customers", label: "Customers (CRM)", icon: Users, roles: ["admin", "reception", "doctor", "counselor", "accountant", "therapist", "pharmacist"] },
  { to: "/doctor-room", label: "Doctor Room", icon: Stethoscope, roles: ["admin", "doctor"] },
  { to: "/counselor-room", label: "Counselor Room", icon: HeartHandshake, roles: ["admin", "counselor"] },
  { to: "/therapist-floor", label: "Therapist Floor", icon: Sparkles, roles: ["admin", "therapist", "doctor"] },
  { to: "/pharmacy", label: "Pharmacy", icon: Pill, roles: ["admin", "pharmacist"] },
  { to: "/billing", label: "POS / Billing", icon: Receipt, roles: ["admin", "accountant", "reception", "pharmacist"] },
  { to: "/purchase-billing", label: "Purchase Billing", icon: ShoppingBag, roles: ["admin", "accountant"] },
  { to: "/inventory", label: "Inventory", icon: Boxes, roles: ["admin", "accountant", "reception", "pharmacist"] },
  { to: "/accounting", label: "Accounting", icon: Wallet, roles: ["admin", "accountant"] },
  { to: "/expenses", label: "Indirect Expenses", icon: ShoppingBasket, roles: ["admin", "accountant"] },
  { to: "/analytics", label: "Analytics", icon: BarChart3, roles: ["admin", "accountant"] },
  { to: "/tax-export", label: "GST / ITR Export", icon: FileSpreadsheet, roles: ["admin", "accountant"] },
  { to: "/staff", label: "Staff & Performance", icon: UserCog, roles: ["admin"] },
];
