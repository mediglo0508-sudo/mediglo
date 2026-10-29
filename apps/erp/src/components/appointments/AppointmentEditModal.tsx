import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { APPOINTMENT_SOURCES } from "./appointment-source";

const STATUSES = ["Scheduled", "Checked-In", "Checked-Out", "Rescheduled", "Cancelled"];

interface Props {
  appointmentId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

/**
 * Edits the client record (name, phone, email) and the booking itself
 * (date, time, source, status, notes) in one save.
 */
export function AppointmentEditModal({ appointmentId, isOpen, onClose, onSave }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("09:30");
  const [source, setSource] = useState("manual");
  const [status, setStatus] = useState("Scheduled");
  const [notes, setNotes] = useState("");
  const [concern, setConcern] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["appointment-edit", appointmentId],
    enabled: isOpen && !!appointmentId,
    queryFn: async () => {
      const { data: appt, error } = await supabase
        .from("cos_appointments")
        .select("id, patient_id, appointment_date, start_time, end_time, status, appointment_source, discussion_notes, patient_concern")
        .eq("id", appointmentId as string)
        .maybeSingle();
      if (error) throw error;
      if (!appt) return null;
      const { data: cust } = await supabase
        .from("customers")
        .select("id, name, phone, email")
        .eq("id", (appt as { patient_id: string }).patient_id)
        .maybeSingle();
      return { appt: appt as Record<string, string | null>, cust: cust as { id: string; name: string | null; phone: string | null; email: string | null } | null };
    },
  });

  useEffect(() => {
    if (!data?.appt) return;
    const a = data.appt;
    setDate(a.appointment_date ?? "");
    setStart((a.start_time ?? "09:00").slice(0, 5));
    setEnd((a.end_time ?? "09:30").slice(0, 5));
    setSource(a.appointment_source ?? "manual");
    const s = (a.status ?? "").toLowerCase();
    setStatus(
      s.includes("cancel") ? "Cancelled"
        : s.includes("resched") ? "Rescheduled"
        : s.includes("out") || s.includes("complete") ? "Checked-Out"
        : s.includes("check") ? "Checked-In"
        : "Scheduled",
    );
    setConcern(a.patient_concern ?? "");
    let n = a.discussion_notes ?? "";
    if (n.trim().startsWith("{")) {
      try { n = (JSON.parse(n) as { notes?: string }).notes ?? ""; } catch { /* legacy */ }
    }
    setNotes(n);
    setName(data.cust?.name ?? "");
    setPhone(data.cust?.phone ?? "");
    setEmail(data.cust?.email ?? "");
  }, [data]);

  async function save() {
    if (!appointmentId || !data?.appt) return;
    if (!name.trim()) return toast.error("Client name is required");
    if (!phone.trim()) return toast.error("Client phone number is required");
    if (!date) return toast.error("Pick a date");
    if (end <= start) return toast.error("End time must be after start time");

    setSaving(true);
    const customerId = data.cust?.id ?? (data.appt.patient_id as string);
    const { error: custErr } = await supabase
      .from("customers")
      .update({ name: name.trim(), phone: phone.trim(), email: email.trim() || null })
      .eq("id", customerId);
    if (custErr) { setSaving(false); return toast.error(custErr.message); }

    const { error: apptErr } = await supabase
      .from("cos_appointments")
      .update({
        appointment_date: date,
        start_time: `${start}:00`,
        end_time: `${end}:00`,
        appointment_source: source,
        status,
        patient_concern: concern.trim() || null,
        discussion_notes: notes.trim() || null,
      })
      .eq("id", appointmentId);
    setSaving(false);
    if (apptErr) return toast.error(apptErr.message);
    toast.success("Appointment and client details saved");
    onSave();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Edit appointment</DialogTitle></DialogHeader>

        {isLoading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : (
          <div className="space-y-4">
            <Card className="space-y-3 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client information</p>
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Phone *</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit number" />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="optional" />
                </div>
              </div>
              <p className="text-[11px] italic text-muted-foreground">
                Changing these updates the client record everywhere in the clinic.
              </p>
            </Card>

            <Card className="space-y-3 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Appointment</p>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start</Label>
                  <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>End</Label>
                  <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Booking source</Label>
                  <Select value={source} onValueChange={setSource}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {APPOINTMENT_SOURCES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.icon} {s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Concern</Label>
                <Input value={concern} onChange={(e) => setConcern(e.target.value)} placeholder="Reason for visit" />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </Card>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || isLoading}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
