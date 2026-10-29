import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { useAuth } from "@/lib/auth";
import { DoctorTreatmentRecommendation } from "@/components/DoctorRoom/DoctorTreatmentRecommendation";
import { ClinicalBenchmarkStudio } from "@/components/DoctorRoom/ClinicalBenchmarkStudio";

export const Route = createFileRoute("/_authenticated/doctor-room")({
  head: () => ({
    meta: [
      { title: "Doctor Room & Clinical EMR Studio — MediGlo Harmony ERP" },
      { name: "description", content: "Digital prescriptions, 1-Click Quick-Rx templates, Facial Anatomical Charting, Before/After Studio, and Digital E-Consent." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DoctorRoomPage,
});

function DoctorRoomPage() {
  const { hasRole } = useAuth();
  if (!hasRole("admin") && !hasRole("doctor")) return <AccessDenied />;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Doctor Room & Clinical EMR Workstation"
        subtitle="Enter diagnosis, treatments & medicines once — auto-routes to Counselor Room & Pharmacy Queue."
      />
      <DoctorTreatmentRecommendation />
      <ClinicalBenchmarkStudio />
    </div>
  );
}
