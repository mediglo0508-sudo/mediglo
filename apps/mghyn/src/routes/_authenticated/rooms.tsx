import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRealtimeSync, fireAlert } from "@/lib/realtime";
import { toast } from "sonner";
import { DoorOpen, DoorClosed, User, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/rooms")({
  head: () => ({
    meta: [
      { title: "Clinic Rooms — MGHYN Clinic ERP" },
      { name: "description", content: "Manage treatment rooms and their availability." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Clinic Rooms — MGHYN Clinic ERP" },
      { property: "og:description", content: "Manage treatment rooms and their availability." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/rooms" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/rooms" }],
  }),
  component: RoomsPage,
});

interface Room {
  id: number;
  room_name: string;
  status: string;
  current_treatment: string | null;
  current_patient_name: string | null;
  busy_till: string | null;
  assigned_staff_id: string | null;
  current_patient_id: string | null;
  last_updated: string;
}

function RoomsPage() {
  const { roles } = useAuth();
  const allowed = roles.some((r) => ["admin", "reception", "doctor", "therapist", "counselor"].includes(r));

  useRealtimeSync(["clinic_rooms", "patient_visits"], ["clinic-rooms", "rooms-active-visits"]);
  const { data: rooms, refetch, isLoading } = useQuery({
    queryKey: ["clinic-rooms"],
    queryFn: async () =>
      ((await supabase.from("clinic_rooms").select("*").order("id")).data ?? []) as Room[],
  });

  // Live queue mapping — any patient active in a Doctor/Counselor queue flips its room to OCCUPIED.
  const { data: activeVisits } = useQuery({
    queryKey: ["rooms-active-visits"],
    queryFn: async () =>
      (await supabase.from("patient_visits").select("customer_name, status, counselor_slot, room").in("status", ["waiting", "doctor", "counselor"])).data ?? [],
  });

  // Compute a virtual occupancy overlay keyed by room_name.
  const virtualOccupancy = new Map<string, { patient: string; treatment: string }>();
  for (const v of (activeVisits ?? []) as { customer_name: string; status: string; counselor_slot: string | null; room: string | null }[]) {
    if (v.room) {
      virtualOccupancy.set(v.room, { patient: v.customer_name, treatment: "In treatment" });
      continue;
    }
    if (v.status === "waiting" || v.status === "doctor") {
      if (!virtualOccupancy.has("Dr. Room")) virtualOccupancy.set("Dr. Room", { patient: v.customer_name, treatment: "Doctor Consultation" });
    } else if (v.status === "counselor") {
      const target = v.counselor_slot === "Counselor 2" ? "Counseling Room 2" : "Counseling Room 1";
      if (!virtualOccupancy.has(target)) virtualOccupancy.set(target, { patient: v.customer_name, treatment: "Counseling Session" });
    }
  }


  async function release(room: Room) {
    const { error } = await supabase
      .from("clinic_rooms")
      .update({ status: "FREE", current_patient_id: null, current_patient_name: null, current_treatment: null, assigned_staff_id: null, busy_till: null, last_updated: new Date().toISOString() })
      .eq("id", room.id);
    if (error) return toast.error(error.message);
    fireAlert();
    toast.success(`${room.room_name} released → FREE`);
    refetch();
  }

  async function occupy(room: Room) {
    const patient = window.prompt(`Patient name for ${room.room_name}:`);
    if (!patient) return;
    const treatment = window.prompt(`Treatment for ${room.room_name}:`) ?? "";
    const mins = Number(window.prompt(`Busy for how many minutes?`, "60") ?? "60");
    const busyTill = Number.isFinite(mins) && mins > 0 ? new Date(Date.now() + mins * 60000).toISOString() : null;
    const { error } = await supabase
      .from("clinic_rooms")
      .update({ status: "OCCUPIED", current_patient_name: patient, current_treatment: treatment, busy_till: busyTill, last_updated: new Date().toISOString() })
      .eq("id", room.id);
    if (error) return toast.error(error.message);
    fireAlert();
    toast.success(`${room.room_name} → OCCUPIED`);
    refetch();
  }

  if (!allowed) return <AccessDenied />;

  return (
    <div>
      <PageHeader title="Live Room Occupancy Grid" subtitle="Module 6 · real-time treatment room & staff availability" />
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(rooms ?? []).map((room) => {
            const virtual = virtualOccupancy.get(room.room_name);
            const free = room.status === "FREE" && !virtual;
            const patientName = room.current_patient_name ?? virtual?.patient ?? null;
            const treatment = room.current_treatment ?? virtual?.treatment ?? null;
            const liveQueue = room.status === "FREE" && !!virtual;
            return (
              <Card
                key={room.id}
                className={`p-5 border-2 ${free ? "border-emerald-500/50 bg-emerald-500/5" : "border-destructive/50 bg-destructive/5"}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{room.room_name}</h3>
                  <Badge variant={free ? "secondary" : "destructive"} className="gap-1">
                    {free ? <DoorOpen className="h-3 w-3" /> : <DoorClosed className="h-3 w-3" />}
                    {free ? "FREE" : "OCCUPIED"}
                  </Badge>
                </div>
                {!free && (
                  <div className="mt-3 space-y-1 text-sm">
                    {patientName && (
                      <p className="flex items-center gap-1 font-medium">
                        <User className="h-3.5 w-3.5" /> {patientName}
                      </p>
                    )}
                    {treatment && (
                      <p className="text-muted-foreground">{treatment}</p>
                    )}
                    {liveQueue && (
                      <p className="text-xs font-medium text-destructive">Active in live queue</p>
                    )}
                    {room.busy_till && (
                      <p className="text-xs font-medium text-destructive">
                        Busy till {new Date(room.busy_till).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                    {!liveQueue && (
                      <p className="text-xs text-muted-foreground">
                        Updated {new Date(room.last_updated).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                )}
                <div className="mt-4">
                  {free ? (
                    <Button size="sm" className="w-full" onClick={() => occupy(room)}>Allocate Room</Button>
                  ) : liveQueue ? (
                    <Button size="sm" variant="outline" className="w-full" disabled>
                      Auto-synced from queue
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="w-full" onClick={() => release(room)}>
                      Finish &amp; Release
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
          {(rooms ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No rooms configured.</p>
          )}
        </div>
      )}
    </div>
  );
}
