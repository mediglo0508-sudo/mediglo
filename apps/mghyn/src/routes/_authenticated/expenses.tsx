import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { MasterTable } from "@/components/MasterTable";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses — MGHYN Clinic ERP" },
      { name: "description", content: "Log and review clinic operating expenses by category." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Expenses — MGHYN Clinic ERP" },
      { property: "og:description", content: "Log and review clinic operating expenses by category." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/expenses" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/expenses" }],
  }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const { isFinance } = useAuth();
  if (!isFinance) return <AccessDenied />;
  return (
    <div>
      <PageHeader title="Indirect Expense Matrix" subtitle="Rent, electricity, salaries, maintenance, reimbursements & overheads." />
      <MasterTable
        table="expenses"
        queryKey="expenses"
        orderBy="expense_date"
        searchKeys={["category", "description", "paid_to"]}
        columns={[
          { key: "expense_date", label: "Date", width: "130px" },
          { key: "category", label: "Category" },
          { key: "description", label: "Description" },
          { key: "paid_to", label: "Paid To" },
          { key: "payment_mode", label: "Mode", width: "110px" },
          { key: "amount", label: "Amount", type: "number", width: "120px" },
        ]}
        newRow={() => ({ category: "Clinic Rent", description: "", amount: 0, payment_mode: "Cash", paid_to: "", expense_date: new Date().toISOString().slice(0, 10) })}
      />
    </div>
  );
}
