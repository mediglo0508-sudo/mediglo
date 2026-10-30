import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import type { Appointment } from "@/types/domain";
import { APPOINTMENT_COLORS } from "@/types/domain";
import { AppointmentFormModal } from "@/components/appointments/AppointmentFormModal";
import { AppointmentDetailsModal } from "@/components/appointments/AppointmentDetailsModal";
import { todayIST } from "@/lib/utils";

function colorHex(tag: string | null) {
  return APPOINTMENT_COLORS.find((c) => c.value === tag)?.hex ?? APPOINTMENT_COLORS[0].hex;
}

export default function AppointmentsPage() {
  const [date, setDate] = useState(todayIST());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["appointments_range", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cos_appointments")
        .select("*, customers(name, phone)")
        .eq("appointment_date", date)
        .order("appointment_time");
      if (error) throw error;
      return data as (Appointment & { customers: { name: string; phone: string } | null })[];
    },
  });

  const sorted = useMemo(() => appointments ?? [], [appointments]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Appointments</h1>
        <div className="flex items-center gap-2">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> New Appointment
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {APPOINTMENT_COLORS.map((c) => (
          <div key={c.value} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.hex }} />
            {c.label}
          </div>
        ))}
      </div>

      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : sorted.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No appointments on this date.</div>
        ) : (
          <ul className="divide-y divide-border">
            {sorted.map((a) => (
              <li
                key={a.id}
                onClick={() => setDetailsId(a.id)}
                className="flex cursor-pointer items-center gap-4 p-4 hover:bg-accent/50"
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: colorHex(a.color_tag) }} />
                <div className="w-20 shrink-0 text-sm font-medium">{a.appointment_time.slice(0, 5)}</div>
                <div className="flex-1">
                  <div className="font-medium">{a.customers?.name ?? "Unknown"}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.service_name ?? "General"} · {a.customers?.phone}
                  </div>
                </div>
                <div className="text-xs font-medium uppercase text-muted-foreground">{a.status.replace("_", " ")}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AppointmentFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        appointment={editing}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["appointments_range"] })}
      />

      <AppointmentDetailsModal
        appointmentId={detailsId}
        onClose={() => setDetailsId(null)}
        onEdit={() => {
          const appt = sorted.find((a) => a.id === detailsId) ?? null;
          setEditing(appt);
          setDetailsId(null);
          setFormOpen(true);
        }}
      />
    </div>
  );
}
