import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate, fmtTime12 } from "@/lib/date-format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Loader2, Phone, Mail, MapPin, User, Pencil, AlertCircle } from "lucide-react";
import { sourceLook } from "./appointment-source";

interface Props {
  appointmentId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
}

interface Row {
  id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string | null;
  appointment_source: string | null;
  appointment_source_metadata: Record<string, unknown> | null;
  patient_concern: string | null;
  discussion_notes: string | null;
  followup_details: string | null;
  important_note: string | null;
  lead_source: string | null;
  consultation_route: string | null;
  service_id: string | null;
  doctor_id: string | null;
  counsellor_id: string | null;
  patient_id: string;
}

function statusLabel(status: string | null | undefined) {
  const s = (status ?? "").toLowerCase();
  if (s.includes("cancel")) return { label: "Cancelled", cls: "bg-destructive/10 text-destructive" };
  if (s.includes("resched")) return { label: "Rescheduled", cls: "bg-amber-500/10 text-amber-700" };
  if (s.includes("out") || s.includes("complete")) return { label: "Checked-Out", cls: "bg-muted text-muted-foreground" };
  if (s.includes("check")) return { label: "Checked-In", cls: "bg-emerald-500/10 text-emerald-700" };
  return { label: "Scheduled", cls: "bg-primary/10 text-primary" };
}

/**
 * Everything the front desk needs about one booking in a single place:
 * when it is, who booked it, where the booking came from, and the full
 * client record (phone, email, city, age, gender).
 */
export function AppointmentDetailsModal({ appointmentId, isOpen, onClose, onEdit }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["appointment-details", appointmentId],
    enabled: isOpen && !!appointmentId,
    queryFn: async () => {
      const { data: appt, error } = await supabase
        .from("cos_appointments")
        .select(
          "id, appointment_date, start_time, end_time, status, appointment_source, appointment_source_metadata, patient_concern, discussion_notes, followup_details, important_note, lead_source, consultation_route, service_id, doctor_id, counsellor_id, patient_id",
        )
        .eq("id", appointmentId as string)
        .maybeSingle();
      if (error) throw error;
      if (!appt) return null;
      const a = appt as unknown as Row;

      const [cust, service, staffRows] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name, phone, email, city, state_code, age, gender, client_type, outstanding_balance")
          .eq("id", a.patient_id)
          .maybeSingle(),
        a.service_id
          ? supabase.from("services_master").select("name").eq("id", a.service_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("staff")
          .select("id, name, role_title")
          .in("id", [a.doctor_id, a.counsellor_id].filter(Boolean) as string[]),
      ]);

      const staff = (staffRows.data ?? []) as { id: string; name: string; role_title: string | null }[];
      return {
        appt: a,
        customer: cust.data as {
          id: string; name: string | null; phone: string | null; email: string | null;
          city: string | null; state_code: string | null; age: number | null;
          gender: string | null; client_type: string | null; outstanding_balance: number | null;
        } | null,
        serviceName: (service.data as { name?: string } | null)?.name ?? null,
        doctorName: staff.find((s) => s.id === a.doctor_id)?.name ?? null,
        counselorName: staff.find((s) => s.id === a.counsellor_id)?.name ?? null,
      };
    },
  });

  const appt = data?.appt;
  const cust = data?.customer;
  const src = sourceLook(appt?.appointment_source);
  const st = statusLabel(appt?.status);
  const meta = (appt?.appointment_source_metadata ?? {}) as Record<string, unknown>;
  const metaEntries = Object.entries(meta).filter(([, v]) => v !== null && v !== "" && v !== undefined);

  let parsedNotes: string | null = appt?.discussion_notes ?? null;
  if (appt?.discussion_notes?.trim().startsWith("{")) {
    try {
      const j = JSON.parse(appt.discussion_notes) as { notes?: string };
      parsedNotes = j.notes ?? null;
    } catch { /* legacy free text */ }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cust?.name ?? "Appointment details"}</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        )}

        {!isLoading && !appt && <p className="py-6 text-sm text-muted-foreground">Appointment not found.</p>}

        {appt && (
          <div className="space-y-4">
            <Card className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={st.cls} variant="secondary">{st.label}</Badge>
                <Badge variant="outline">{src.icon} {src.label}</Badge>
                {appt.consultation_route && <Badge variant="outline">{appt.consultation_route}</Badge>}
              </div>
              <Row label="When" value={`${fmtDate(appt.appointment_date)} · ${fmtTime12(appt.start_time)} – ${fmtTime12(appt.end_time)}`} />
              {data?.serviceName && <Row label="Service" value={data.serviceName} />}
              {data?.doctorName && <Row label="Doctor" value={data.doctorName} />}
              {data?.counselorName && <Row label="Counselor" value={data.counselorName} />}
              {appt.lead_source && <Row label="Lead source" value={appt.lead_source} />}
              <Row label="Concern" value={appt.patient_concern || "—"} />
              {parsedNotes && <Row label="Notes" value={parsedNotes} />}
              {appt.important_note && <Row label="Important" value={appt.important_note} />}
              {appt.followup_details && (
                <p className="flex items-start gap-1 text-sm text-amber-700">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5" /> Follow-up: {appt.followup_details}
                </p>
              )}
            </Card>

            <Card className="space-y-2 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client information</p>
              <p className="flex items-center gap-2 text-sm font-medium">
                <User className="h-4 w-4 text-muted-foreground" /> {cust?.name ?? "—"}
              </p>
              <p className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                {cust?.phone ? <a className="underline" href={`tel:${cust.phone}`}>{cust.phone}</a> : "No phone on file"}
              </p>
              <p className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" /> {cust?.email || "—"}
              </p>
              <p className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                {[cust?.city, cust?.state_code].filter(Boolean).join(", ") || "—"}
              </p>
              <div className="flex flex-wrap gap-2 pt-1 text-xs text-muted-foreground">
                <span>Age: {cust?.age ?? "—"}</span>
                <span>·</span>
                <span>Gender: {cust?.gender || "—"}</span>
                {cust?.client_type && <><span>·</span><span>{cust.client_type}</span></>}
                {!!Number(cust?.outstanding_balance ?? 0) && (
                  <>
                    <span>·</span>
                    <span className="text-destructive">Dues ₹{Number(cust?.outstanding_balance).toFixed(2)}</span>
                  </>
                )}
              </div>
            </Card>

            {metaEntries.length > 0 && (
              <Card className="space-y-1 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source details</p>
                {metaEntries.map(([k, v]) => (
                  <Row key={k} label={k.replace(/_/g, " ")} value={String(v)} />
                ))}
              </Card>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={onEdit} disabled={!appt}>
            <Pencil className="mr-2 h-4 w-4" /> Edit appointment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm">
      <span className="capitalize text-muted-foreground">{label}:</span> {value}
    </p>
  );
}
