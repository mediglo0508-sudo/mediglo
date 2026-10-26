import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatINR } from "@/lib/utils";
import { Bell, IndianRupee, CalendarX2, PackageX, CalendarClock } from "lucide-react";

type Tone = "due" | "missed" | "stock" | "info";

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
  stock: PackageX,
  info: CalendarClock,
};

const TONE_COLOR: Record<Tone, string> = {
  due: "text-amber-500",
  missed: "text-rose-500",
  stock: "text-orange-500",
  info: "text-blue-500",
};

export function NotificationBell() {
  const { roles } = useAuth();
  const [open, setOpen] = useState(false);

  const canSeeFinance = roles.some((r) => ["admin", "accountant", "reception"].includes(r));
  const canSeeInventory = roles.some((r) => ["admin", "accountant", "reception", "pharmacist"].includes(r));

  const { data: notes = [] } = useQuery({
    queryKey: ["notifications_bell", roles.join(",")],
    queryFn: async (): Promise<Note[]> => {
      const result: Note[] = [];
      const today = new Date().toISOString().slice(0, 10);

      // 1. Pending payment balances
      if (canSeeFinance) {
        const { data: dues } = await supabase
          .from("invoices")
          .select("id, customer_name, pending_balance, created_at")
          .neq("status", "void")
          .gt("pending_balance", 0)
          .order("pending_balance", { ascending: false })
          .limit(10);

        for (const d of dues ?? []) {
          result.push({
            id: `due-${d.id}`,
            tone: "due",
            title: "Outstanding Balance",
            message: `${d.customer_name || "Customer"}: ${formatINR(Number(d.pending_balance))} pending`,
            ts: d.created_at,
          });
        }
      }

      // 2. Low / Out of Stock alerts
      if (canSeeInventory) {
        const { data: lowStock } = await supabase
          .from("inventory")
          .select("id, name, stock_qty, reorder_level")
          .eq("active", true)
          .eq("is_service", false)
          .order("stock_qty", { ascending: true })
          .limit(10);

        for (const item of lowStock ?? []) {
          if (Number(item.stock_qty) <= Number(item.reorder_level || 5)) {
            result.push({
              id: `stk-${item.id}`,
              tone: "stock",
              title: Number(item.stock_qty) <= 0 ? "Out of Stock" : "Low Stock Alert",
              message: `${item.name}: ${Number(item.stock_qty)} left in inventory`,
            });
          }
        }
      }

      // 3. Appointments scheduled today
      const { data: appts } = await supabase
        .from("appointments")
        .select("id, customer_name, appointment_date, status")
        .eq("appointment_date", today)
        .limit(10);

      for (const a of appts ?? []) {
        result.push({
          id: `appt-${a.id}`,
          tone: "info",
          title: "Today's Appointment",
          message: `${a.customer_name || "Patient"} - ${a.status}`,
          ts: a.appointment_date,
        });
      }

      return result;
    },
    refetchInterval: 30000,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative p-2 text-muted-foreground hover:text-foreground">
          <Bell className="h-5 w-5" />
          {notes.length > 0 && (
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {notes.length > 9 ? "9+" : notes.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3 font-semibold text-sm">
          <span>Notifications</span>
          <span className="text-xs text-muted-foreground">{notes.length} alerts</span>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y">
          {notes.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">No new notifications</div>
          ) : (
            notes.map((note) => {
              const Icon = TONE_ICON[note.tone];
              return (
                <div key={note.id} className="flex items-start gap-3 p-3 hover:bg-accent/50 text-xs">
                  <div className={`mt-0.5 rounded p-1 bg-muted ${TONE_COLOR[note.tone]}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <div className="font-semibold">{note.title}</div>
                    <div className="text-muted-foreground">{note.message}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
