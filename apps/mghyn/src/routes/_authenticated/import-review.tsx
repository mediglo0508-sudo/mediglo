import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listReviewQueue, setReviewStatus } from "@/lib/import-review.functions";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/import-review")({
  head: () => ({
    meta: [
      { title: "Import Review — MGHYN Clinic ERP" },
      { name: "description", content: "Review and approve staged import batches before posting." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Import Review — MGHYN Clinic ERP" },
      { property: "og:description", content: "Review and approve staged import batches before posting." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/import-review" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/import-review" }],
  }),
  component: ImportReviewPage,
});

function ImportReviewPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listReviewQueue);
  const setFn = useServerFn(setReviewStatus);
  const { data, isLoading } = useQuery({
    queryKey: ["import-review"],
    queryFn: () => listFn({ data: undefined }),
    staleTime: 15_000,
  });

  if (!hasRole("admin") && !hasRole("accountant")) {
    return <div><PageHeader title="Import Review" subtitle="Records that could not be safely imported." /><AccessDenied /></div>;
  }

  async function act(id: string, status: "fixed" | "discarded") {
    try {
      await setFn({ data: { id, status } });
      toast.success(status === "fixed" ? "Marked resolved" : "Discarded");
      qc.invalidateQueries({ queryKey: ["import-review"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  const rows = data ?? [];
  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending");

  return (
    <div>
      <PageHeader title="Import Review Queue" subtitle="Records that could not be safely imported. Fix in the source, re-import, then mark resolved." />
      {isLoading && <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin" />}
      <Card className="mb-4 p-0">
        <div className="border-b p-3 text-sm font-semibold">Pending ({pending.length})</div>
        <div className="divide-y">
          {pending.map((r) => (
            <div key={r.id} className="p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs uppercase">{r.source}</span>
                    <span className="mr-2 text-xs text-muted-foreground">{r.kind}</span>
                    {r.reason}
                  </p>
                  <details className="mt-1 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Raw payload</summary>
                    <pre className="mt-1 overflow-auto rounded bg-muted/40 p-2 text-[11px]">{r.raw_payload}</pre>
                  </details>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="outline" onClick={() => act(r.id, "fixed")}><CheckCircle2 className="mr-1 h-3 w-3" />Resolve</Button>
                  <Button size="sm" variant="ghost" onClick={() => act(r.id, "discarded")}><XCircle className="mr-1 h-3 w-3" />Discard</Button>
                </div>
              </div>
            </div>
          ))}
          {pending.length === 0 && !isLoading && <p className="p-6 text-center text-sm text-muted-foreground">No pending items — every import completed cleanly.</p>}
        </div>
      </Card>
      {done.length > 0 && (
        <Card className="p-0">
          <div className="border-b p-3 text-sm font-semibold">History ({done.length})</div>
          <div className="max-h-[300px] overflow-auto divide-y">
            {done.slice(0, 50).map((r) => (
              <div key={r.id} className="p-2 text-xs text-muted-foreground">
                <span className="mr-2 rounded bg-muted px-1.5 py-0.5 uppercase">{r.status}</span>
                <span className="mr-2">{r.source} · {r.kind}</span>
                {r.reason}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
