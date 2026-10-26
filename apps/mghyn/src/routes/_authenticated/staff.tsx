import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { MasterTable } from "@/components/MasterTable";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({
    meta: [
      { title: "Staff — MGHYN Clinic ERP" },
      { name: "description", content: "Staff directory, therapists and role assignments." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Staff — MGHYN Clinic ERP" },
      { property: "og:description", content: "Staff directory, therapists and role assignments." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/staff" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/staff" }],
  }),
  component: StaffPage,
});

function StaffPage() {
  return (
    <div>
      <PageHeader title="Staff Directory" subtitle="Personnel assignable to treatments and sales (e.g. Vikas Sir, Gourav Sir)." />
      <MasterTable
        table="staff"
        queryKey="staff"
        orderBy="name"
        searchKeys={["name", "role_title"]}
        columns={[
          { key: "name", label: "Name" },
          { key: "role_title", label: "Designation" },
        ]}
        newRow={() => ({ name: "New Staff", role_title: "Therapist", active: true })}
      />
    </div>
  );
}
