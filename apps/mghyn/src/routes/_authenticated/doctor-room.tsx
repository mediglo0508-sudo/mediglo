import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { useAuth } from "@/lib/auth";
import { DoctorTreatmentRecommendation } from "@/components/DoctorRoom/DoctorTreatmentRecommendation";

export const Route = createFileRoute("/_authenticated/doctor-room")({
  head: () => ({
    meta: [
      { title: "Doctor Room — MGHYN Clinic ERP" },
      { name: "description", content: "Enter diagnosis, treatments and medicines once and send them to the counselor." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Doctor Room — MGHYN Clinic ERP" },
      { property: "og:description", content: "Enter diagnosis, treatments and medicines once and send them to the counselor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DoctorRoomPage,
});

function DoctorRoomPage() {
  const { hasRole } = useAuth();
  if (!hasRole("admin") && !hasRole("doctor")) return <AccessDenied />;
  return (
    <div>
      <PageHeader title="Doctor Room" subtitle="One recommendation form — treatments, medicines and notes." />
      <DoctorTreatmentRecommendation />
    </div>
  );
}
