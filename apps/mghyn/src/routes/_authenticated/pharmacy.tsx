import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { useAuth } from "@/lib/auth";
import { PharmacistDashboard } from "@/components/PharmacistRoom/PharmacistDashboard";
import { NewProductOrderDialog } from "@/components/PharmacistRoom/NewProductOrderDialog";

export const Route = createFileRoute("/_authenticated/pharmacy")({
  head: () => ({
    meta: [
      { title: "Pharmacy — MGHYN Clinic ERP" },
      { name: "description", content: "Claim product orders, verify items and send them to billing." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Pharmacy — MGHYN Clinic ERP" },
      { property: "og:description", content: "Claim product orders, verify items and send them to billing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PharmacyPage,
});

function PharmacyPage() {
  const { hasRole } = useAuth();
  const allowed = hasRole("admin") || hasRole("pharmacist") || hasRole("reception") || hasRole("accountant");
  if (!allowed) return <AccessDenied />;
  const canCreate = hasRole("admin") || hasRole("reception") || hasRole("pharmacist");
  return (
    <div>
      <PageHeader
        title="Pharmacy"
        subtitle="Dispense products, verify items and hand over to billing."
        action={canCreate ? <NewProductOrderDialog /> : undefined}
      />
      <PharmacistDashboard />
    </div>
  );
}
