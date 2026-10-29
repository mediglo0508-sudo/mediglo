import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Role } from "@/lib/auth";
import { useRealtimeSync } from "@/lib/realtime";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { inr } from "@/lib/gst";
import { Bell, IndianRupee, CalendarX2, Megaphone, CalendarClock, DoorOpen, PackageX } from "lucide-react";
import { LOW_STOCK_THRESHOLD } from "@/components/InventoryVisibilityGrid";

type Tone = "due" | "missed" | "info" | "lead" | "room" | "stock";

interface Note {
  id: string;
  tone: Tone;
  title: string;
  message: string;
  ts?: string;
}

const TONE_ICON: Record<Tone, typeof Bell> = {
  due: IndianRupee,
  missed: CalendarX2,
  info: CalendarClock,
  lead: Megaphone,
  room: DoorOpen,
  stock: PackageX,
};

const TONE_COLOR: Record<Tone, string> = {
  due: "text-cos-due",
  missed: "text-cos-missed",
  info: "text-cos-doctor",
  lead: "text-primary",
  room: "text-cos-room",
  stock: "text-cos-warn",
};

/** Which live categories each role should see. */
function rolesInclude(roles: Role[], ...want: Role[]) {
  return want.some((r) => roles.includes(r));
}

export function NotificationBell() {
  const { roles } = useAuth();
  const [open, setOpen] = useState(false);
  useRealtimeSync(
    ["invoices", "appointments", "inventory", "cos_notifications_hub", "cos_room_assets", "cos_chat_messages"],
    ["notifications-center"],
  );

  const isFront = rolesInclude(roles, "admin", "reception", "accountant");
  
  const isClinical = rolesInclude(roles, "admin", "doctor", "counselor", "therapist");

  const { data } = useQuery({
    queryKey: ["notifications-center", roles.join(",")],
    enabled: roles.length > 0,
    queryFn: async (): Promise<Note[]> => {
      const notes: Note[] = [];
      const today = new Date().toISOString().slice(0, 10);

      // --- Front desk / finance: outstanding balances, missed + check-in ---
      if (isFront) {
        const { data: dues } = await supabase
          .from("invoices")
          .select("id, customer_name, pending_balance, invoice_date")
          .is("voided_at", null)
          .gt("pending_balance", 0)
          .order("pending_balance", { ascending: false })
          .limit(15);
        for (const d of dues ?? []) {
          notes.push({
            id: `due-${d.id}`,
            tone: "due",
            title: "Payment balance due",
            message: `${d.customer_name || "Walk-in"} — ${inr(Number(d.pending_balance))} outstanding`,
            ts: d.invoice_date,
          });
        }
        const { data: appts } = await supabase
          .from("appointments")
          .select("id, customer_name, appointment_date, status")
          .lte("appointment_date", today)
          .limit(30);
        for (const a of appts ?? []) {
          const missed = (a.status ?? "").toLowerCase() !== "checked-in" && a.appointment_date < today;
          notes.push({
            id: `appt-${a.id}`,
            tone: missed ? "missed" : "info",
            title: missed ? "Missed appointment" : "Check-in due today",
            message: `${a.customer_name || "Patient"} · ${a.appointment_date}`,
            ts: a.appointment_date,
          });
        }
      }

      // --- Marketing: live campaign events flow entirely through the hub now ---


      // --- Clinical: schedule shifts, room availability, low stock ---
      if (isClinical) {
        const { data: sessions } = await supabase
          .from("cos_scheduled_sessions")
          .select("id, session_number, scheduled_date, status")
          .gte("scheduled_date", today)
          .order("scheduled_date", { ascending: true })
          .limit(10);
        for (const s of sessions ?? []) {
          notes.push({
            id: `ses-${s.id}`,
            tone: "info",
            title: `Session ${s.session_number} scheduled`,
            message: `${s.scheduled_date} · ${s.status ?? "Pending"}`,
            ts: s.scheduled_date,
          });
        }
        const { data: rooms } = await supabase
          .from("cos_room_assets")
          .select("id, room_identifier, equipment_status")
          .neq("equipment_status", "operational")
          .limit(10);
        for (const r of rooms ?? []) {
          notes.push({
            id: `room-${r.id}`,
            tone: "room",
            title: "Room / equipment status",
            message: `${r.room_identifier} — ${r.equipment_status ?? "check"}`,
          });
        }
        const { data: low } = await supabase
          .from("inventory")
          .select("id, name, stock")
          .eq("active", true)
          .lte("stock", LOW_STOCK_THRESHOLD)
          .order("stock", { ascending: true })
          .limit(10);
        for (const i of low ?? []) {
          notes.push({
            id: `stk-${i.id}`,
            tone: "stock",
            title: Number(i.stock) <= 0 ? "Out of stock" : "Low stock alert",
            message: `${i.name} · ${Number(i.stock)} left`,
          });
        }
      }

      // --- Historical event rows from the hub, filtered by role ---
      const roleFilter = roles.map((r) => `target_role.eq.${r}`).join(",");
      const { data: hub } = await supabase
        .from("cos_notifications_hub")
        .select("id, title, message, notification_type, target_role, created_at, is_read")
        .or(`target_role.eq.all,${roleFilter}`)
        .order("created_at", { ascending: false })
        .limit(20);
      for (const h of hub ?? []) {
        const t = (h.notification_type ?? "").toLowerCase();
        const tone: Tone = t.includes("stock")
          ? "stock"
          : t.includes("balance") || t.includes("due")
            ? "due"
            : t.includes("lead")
              ? "lead"
              : "info";
        notes.push({ id: `hub-${h.id}`, tone, title: h.title, message: h.message, ts: h.created_at });
      }

      return notes.sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? "")).slice(0, 60);
    },
  });

  const notes = useMemo(() => data ?? [], [data]);
  const count = notes.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-cos-due px-1 text-[10px] font-bold text-white">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[92vw] max-w-sm p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          <span className="text-xs text-muted-foreground">{count} live</span>
        </div>
        <div className="max-h-[70vh] divide-y overflow-y-auto">
          {notes.map((n) => {
            const Icon = TONE_ICON[n.tone];
            return (
              <div key={n.id} className="flex items-start gap-3 px-4 py-3">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TONE_COLOR[n.tone]}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{n.message}</p>
                </div>
              </div>
            );
          })}
          {count === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              You're all caught up.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

