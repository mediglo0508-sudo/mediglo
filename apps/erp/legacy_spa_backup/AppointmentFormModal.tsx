import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { APPOINTMENT_COLORS, type Appointment, type AppointmentSource } from "@/types/domain";
import { useServices } from "@/hooks/useQueries";
import { cn, todayIST } from "@/lib/utils";

const SOURCES: { value: AppointmentSource; label: string }[] = [
  { value: "manual", label: "Manual Entry" },
  { value: "google_calendar", label: "Google Calendar" },
  { value: "facebook", label: "Meta / Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone_call", label: "Phone Call" },
  { value: "walk_in", label: "Walk-in" },
  { value: "other", label: "Other" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass an existing appointment to edit; omit to create a new one. */
  appointment?: Appointment | null;
  onSaved: () => void;
}

export function AppointmentFormModal({ open, onOpenChange, appointment, onSaved }: Props) {
  const { data: services } = useServices();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [date, setDate] = useState(todayIST());
  const [time, setTime] = useState("10:00");
  const [serviceId, setServiceId] = useState<string>("");
  const [source, setSource] = useState<AppointmentSource>("manual");
  const [colorTag, setColorTag] = useState("default");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [existingCustomerId, setExistingCustomerId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (appointment) {
      setDate(appointment.appointment_date);
      setTime(appointment.appointment_time.slice(0, 5));
      setServiceId(appointment.service_id ?? "");
      setSource(appointment.appointment_source);
      setColorTag(appointment.color_tag ?? "default");
      setNotes(appointment.notes ?? "");
      setExistingCustomerId(appointment.customer_id);
      supabase
        .from("customers")
        .select("name, phone")
        .eq("id", appointment.customer_id)
        .maybeSingle()
        .then(({ data }) => {
          setCustomerName(data?.name ?? "");
          setCustomerPhone(data?.phone ?? "");
        });
    } else {
      setCustomerName("");
      setCustomerPhone("");
      setDate(todayIST());
      setTime("10:00");
      setServiceId("");
      setSource("manual");
      setColorTag("default");
      setNotes("");
      setExistingCustomerId(null);
    }
  }, [open, appointment]);

  const queryClient = useQueryClient();

  async function handleSave() {
    if (!customerName.trim() || !customerPhone.trim()) {
      toast.error("Customer name and phone are required");
      return;
    }
    setSaving(true);
    try {
      let customerId = existingCustomerId;

      if (customerId) {
        const { error } = await supabase.from("customers").update({ name: customerName, phone: customerPhone }).eq("id", customerId);
        if (error) throw error;
      } else {
        // Try to find an existing customer by phone first, so we don't create duplicates.
        const { data: found, error: findErr } = await supabase.from("customers").select("id").eq("phone", customerPhone).maybeSingle();
        if (findErr) throw findErr;
        if (found) {
          customerId = found.id;
          const { error } = await supabase.from("customers").update({ name: customerName }).eq("id", customerId);
          if (error) throw error;
        } else {
          const { data: created, error } = await supabase
            .from("customers")
            .insert({ name: customerName, phone: customerPhone })
            .select("id")
            .single();
          if (error) throw error;
          customerId = created.id;
        }
      }

      const service = services?.find((s) => s.id === serviceId);
      const payload = {
        customer_id: customerId,
        appointment_date: date,
        appointment_time: time,
        service_id: serviceId || null,
        service_name: service?.name ?? null,
        appointment_source: source,
        color_tag: colorTag,
        notes,
      };

      if (appointment) {
        const { error } = await supabase.from("cos_appointments").update(payload).eq("id", appointment.id);
        if (error) throw error;
        toast.success("Appointment updated");
      } else {
        const { error } = await supabase.from("cos_appointments").insert(payload);
        if (error) throw error;
        toast.success("Appointment created");
      }

      queryClient.invalidateQueries({ queryKey: ["appointments_today"] });
      queryClient.invalidateQueries({ queryKey: ["appointments_range"] });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save appointment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{appointment ? "Edit Appointment" : "New Appointment"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Customer name *</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Phone *</Label>
              <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <Label>Service</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select a service" />
              </SelectTrigger>
              <SelectContent>
                {(services ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Appointment source</Label>
            <Select value={source} onValueChange={(v) => setSource(v as AppointmentSource)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Calendar color</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {APPOINTMENT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColorTag(c.value)}
                  className={cn(
                    "h-8 w-8 rounded-full border-2 transition",
                    colorTag === c.value ? "border-foreground scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: c.hex }}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
