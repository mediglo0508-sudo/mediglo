import { Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import AppointmentsPage from "@/pages/AppointmentsPage";
import CustomersPage from "@/pages/CustomersPage";
import DoctorRoomPage from "@/pages/DoctorRoomPage";
import CounselorRoomPage from "@/pages/CounselorRoomPage";
import TherapistFloorPage from "@/pages/TherapistFloorPage";
import PharmacyPage from "@/pages/PharmacyPage";
import BillingPage from "@/pages/BillingPage";
import PurchaseBillingPage from "@/pages/PurchaseBillingPage";
import InventoryPage from "@/pages/InventoryPage";
import AccountingPage from "@/pages/AccountingPage";
import ExpensesPage from "@/pages/ExpensesPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import TaxExportPage from "@/pages/TaxExportPage";
import StaffPage from "@/pages/StaffPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />

        <Route
          path="/appointments"
          element={
            <ProtectedRoute roles={["admin", "reception", "doctor", "counselor", "therapist"]}>
              <AppointmentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customers"
          element={
            <ProtectedRoute roles={["admin", "reception", "doctor", "counselor", "accountant", "therapist", "pharmacist"]}>
              <CustomersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctor-room"
          element={
            <ProtectedRoute roles={["admin", "doctor"]}>
              <DoctorRoomPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/counselor-room"
          element={
            <ProtectedRoute roles={["admin", "counselor"]}>
              <CounselorRoomPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/therapist-floor"
          element={
            <ProtectedRoute roles={["admin", "therapist", "doctor"]}>
              <TherapistFloorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pharmacy"
          element={
            <ProtectedRoute roles={["admin", "pharmacist"]}>
              <PharmacyPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing"
          element={
            <ProtectedRoute roles={["admin", "accountant", "reception", "pharmacist"]}>
              <BillingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchase-billing"
          element={
            <ProtectedRoute roles={["admin", "accountant"]}>
              <PurchaseBillingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory"
          element={
            <ProtectedRoute roles={["admin", "accountant", "reception", "pharmacist"]}>
              <InventoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting"
          element={
            <ProtectedRoute roles={["admin", "accountant"]}>
              <AccountingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/expenses"
          element={
            <ProtectedRoute roles={["admin", "accountant"]}>
              <ExpensesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute roles={["admin", "accountant"]}>
              <AnalyticsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tax-export"
          element={
            <ProtectedRoute roles={["admin", "accountant"]}>
              <TaxExportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff"
          element={
            <ProtectedRoute roles={["admin"]}>
              <StaffPage />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  );
}
