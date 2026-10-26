import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { generateMasterBackup } from "@/lib/master-backup.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Download, Loader2, DatabaseBackup } from "lucide-react";

export function MasterBackupCard() {
  const qc = useQueryClient();
  const runBackup = useServerFn(generateMasterBackup);
  const [busy, setBusy] = useState(false);

  const { data: cfg } = useQuery({
    queryKey: ["backup-schedule"],
    queryFn: async () => {
      const { data } = await supabase.from("cos_backup_schedule").select("*").limit(1).maybeSingle();
      return data as { id: string; frequency: string; recipient_email: string; last_run_at: string | null } | null;
    },
  });

  async function trigger() {
    setBusy(true);
    try {
      const res = await runBackup({ data: undefined });
      const bin = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bin], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = res.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Master backup ready · ${res.summary.customers} clients · ${res.summary.invoices} invoices`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setBusy(false);
    }
  }

  async function setFrequency(freq: string) {
    if (!cfg) return;
    const { error } = await supabase
      .from("cos_backup_schedule")
      .update({ frequency: freq })
      .eq("id", cfg.id);
    if (error) return toast.error(error.message);
    toast.success(`Backup schedule set to ${freq}`);
    qc.invalidateQueries({ queryKey: ["backup-schedule"] });
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <DatabaseBackup className="h-5 w-5 text-primary" />
        <h3 className="text-sm font-semibold">Master Data Backup</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Compiles CRM, Packages, Sales, Expenses & Marketing into a multi-sheet Excel workbook.
        Automatically emails to <b>{cfg?.recipient_email ?? "account@mediglo.in"}</b> at the chosen frequency.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
        <Select value={cfg?.frequency ?? "off"} onValueChange={setFrequency}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="off">Off</SelectItem>
            <SelectItem value="daily">Daily (end of day)</SelectItem>
            <SelectItem value="weekly">Weekly (Sunday night)</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={trigger} disabled={busy} size="sm">
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
          Generate & Download
        </Button>
      </div>
      {cfg?.last_run_at && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Last automated run: {new Date(cfg.last_run_at).toLocaleString()}
        </p>
      )}
    </Card>
  );
}
