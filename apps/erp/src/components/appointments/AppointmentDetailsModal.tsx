import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { AppointmentDetailsView } from "@/types/domain";
import { useAuth } from "@/lib/auth";
import { Phone, Mail, MapPin, Calendar, Edit } from "lucide-react";

interface Props {
  appointmentId: string | null;
  onClose: () => void;
  onEdit: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual Entry",
  google_calendar: "Google Calendar",
  facebook: "Meta / Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  phone_call: "Phone Call",
  walk_in: "Walk-in",
  tracker: "Booked via Tracker",
  other: "Other",
};

export function AppointmentDetailsModal({ appointmentId, onClose, onEdit }: Props) {
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();

  const { data: details, isLoading } = useQuery({
    queryKey: ["appointment_details", appointmentId],
    enabled: !!appointmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointment_details_view")
        .select("*")
        .eq("appointment_id", appointmentId)
        .single();
      if (error) throw error;
      return data as AppointmentDetailsView;
    },
  });

  async function handleCheckIn() {
    if (!details) return;
    try {
      const { error: apptErr } = await supabase.from("cos_appointments").update({ status: "checked_in" }).eq("id", details.appointment_id);
      if (apptErr) throw apptErr;

      // Create (or reuse) the encounter record - the actual visit.
      const { data: existing, error: findErr } = await supabase
        .from("encounters")
        .select("id")
        .eq("appointment_id", details.appointment_id)
        .maybeSingle();
      if (findErr) throw findErr;

      if (!existing) {
        const { error: insertErr } = await supabase.from("encounters").insert({
          appointment_id: details.appointment_id,
          customer_id: details.customer_id,
          encounter_type: "consultation",
          status: "checked_in",
          checked_in_at: new Date().toISOString(),
        });
        if (insertErr) throw insertErr;
      } else {
        const { error: updateErr } = await supabase
          .from("encounters")
          .update({ status: "checked_in", checked_in_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (updateErr) throw updateErr;
      }

      toast.success("Patient checked in");
      queryClient.invalidateQueries({ queryKey: ["appointment_details"] });
      queryClient.invalidateQueries({ queryKey: ["appointments_today"] });
      queryClient.invalidateQueries({ queryKey: ["appointments_range"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to check in");
    }
  }

  return (
    <Dialog open={!!appointmentId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        {isLoading || !details ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{details.customer_name}</DialogTitle>
              <div className="mt-2 flex gap-2">
                <Badge variant={details.status === "completed" ? "success" : "outline"}>{details.status.replace("_", " ")}</Badge>
                <Badge variant="secondary">{SOURCE_LABELS[details.appointment_source] ?? details.appointment_source}</Badge>
              </div>
            </DialogHeader>

            <Card className="space-y-3 border-2 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Calendar className="h-4 w-4" /> Appointment
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Date</div>
                  <div className="font-medium">{formatDate(details.appointment_date)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Time</div>
                  <div className="font-medium">{details.appointment_time}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Doctor</div>
                  <div className="font-medium">{details.doctor_name ?? "Unassigned"}</div>
                </div>
              </div>
              {details.notes && (
                <div>
                  <div className="text-xs text-muted-foreground">Notes</div>
                  <div className="text-sm">{details.notes}</div>
                </div>
              )}
            </Card>

            <Card className="space-y-3 border-2 p-4">
              <div className="text-sm font-semibold">Client information</div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" /> {details.customer_phone || "Not provided"}
              </div>
              {details.customer_email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" /> {details.customer_email}
                </div>
              )}
              {details.customer_address && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  {details.customer_address}
                  {details.customer_city ? `, ${details.customer_city}` : ""}
                </div>
              )}
            </Card>

            <DialogFooter>
              {hasRole("admin", "reception", "doctor") && details.status === "scheduled" && (
                <Button variant="success" onClick={handleCheckIn}>
                  Check In
                </Button>
              )}
              <Button variant="outline" onClick={onEdit}>
                <Edit className="mr-1 h-4 w-4" /> Edit
              </Button>
              <Button onClick={onClose}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
