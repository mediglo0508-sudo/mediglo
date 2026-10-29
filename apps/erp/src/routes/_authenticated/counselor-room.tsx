import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { useAuth } from "@/lib/auth";
import { CounselorPricingDashboard } from "@/components/CounselorRoom/CounselorPricingDashboard";

export const Route = createFileRoute("/_authenticated/counselor-room")({
  head: () => ({
    meta: [
      { title: "Counselor Room — MGHYN Clinic ERP" },
      { name: "description", content: "Review the doctor's recommendation, price it and send the quotation to billing." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Counselor Room — MGHYN Clinic ERP" },
      { property: "og:description", content: "Review the doctor's recommendation, price it and send the quotation to billing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CounselorRoomPage,
});

function CounselorRoomPage() {
  const { hasRole } = useAuth();
  const allowed =
    hasRole("admin") || hasRole("counselor") || hasRole("counselor_1") || hasRole("counselor_2");
  if (!allowed) return <AccessDenied />;
  return (
    <div>
      <PageHeader title="Counselor Pricing" subtitle="Review and create the quotation." />
      <CounselorPricingDashboard />
    </div>
  );
}
