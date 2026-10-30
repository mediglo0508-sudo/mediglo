import { createFileRoute } from "@tanstack/react-router";
import { DigitalClientRegistrationForm } from "@/components/DigitalClientRegistrationForm";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Client Self-Registration Kiosk — MediGlo Clinic" },
      { name: "description", content: "Self-service digital onboarding and medical consent for MediGlo Clinic." },
    ],
  }),
  component: RegisterKioskPage,
});

function RegisterKioskPage() {
  return (
    <div className="min-h-screen bg-slate-50/50 py-8 px-4 sm:px-6 lg:px-8">
      <DigitalClientRegistrationForm isKiosk={true} />
    </div>
  );
}
