import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { MasterTable } from "@/components/MasterTable";

export const Route = createFileRoute("/_authenticated/services")({
  head: () => ({
    meta: [
      { title: "Services — MGHYN Clinic ERP" },
      { name: "description", content: "Service catalogue with pricing, SAC codes and costs." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Services — MGHYN Clinic ERP" },
      { property: "og:description", content: "Service catalogue with pricing, SAC codes and costs." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/services" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/services" }],
  }),
  component: ServicesPage,
});

function ServicesPage() {
  return (
    <div>
      <PageHeader title="Services Library" subtitle="Clinical services with SAC codes — billed at flat 5% GST." />
      <MasterTable
        table="services_master"
        queryKey="services_master"
        orderBy="category"
        searchKeys={["name", "category", "sac_code"]}
        columns={[
          { key: "category", label: "Category" },
          { key: "name", label: "Service" },
          { key: "sac_code", label: "SAC", width: "100px" },
          { key: "gst_rate", label: "GST %", type: "number", width: "80px" },
          { key: "default_price", label: "Price", type: "number", width: "110px" },
          { key: "cost_estimate", label: "Cost", type: "number", width: "110px" },
        ]}
        newRow={() => ({ category: "General", name: "New Service", sac_code: "999312", gst_rate: 5, default_price: 0, cost_estimate: 0 })}
      />
    </div>
  );
}
