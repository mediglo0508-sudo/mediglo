import { useState } from "react";
import { CalendarIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/date-format";
import {
  getPresetRange,
  setDashboardRange,
  useDashboardRange,
  type PresetKey,
} from "@/lib/date-range-store";
import type { DateRange } from "react-day-picker";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "this_week", label: "This Week" },
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
];

function toDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function DateRangePicker({ loading }: { loading?: boolean }) {
  const range = useDashboardRange();
  const [open, setOpen] = useState(false);

  const handlePreset = (key: PresetKey) => {
    const r = getPresetRange(key);
    setDashboardRange({ ...r, preset: key });
  };

  const handleCalendar = (r: DateRange | undefined) => {
    if (!r?.from) return;
    const from = toISO(r.from);
    const to = toISO(r.to ?? r.from);
    setDashboardRange({ from, to, preset: "custom" });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex flex-wrap gap-1.5 overflow-x-auto">
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={range.preset === p.key ? "default" : "outline"}
            onClick={() => handlePreset(p.key)}
          >
            {p.label}
          </Button>
        ))}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant={range.preset === "custom" ? "default" : "outline"}
              className="gap-1.5"
            >
              <CalendarIcon className="h-4 w-4" />
              {range.preset === "custom"
                ? `${fmtDate(range.from)} → ${fmtDate(range.to)}`
                : "Custom"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
            <Calendar
              mode="range"
              defaultMonth={toDate(range.from)}
              selected={{ from: toDate(range.from), to: toDate(range.to) }}
              onSelect={handleCalendar}
              numberOfMonths={2}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>
      <span className="ml-1 hidden text-xs text-muted-foreground md:inline">
        {fmtDate(range.from)} → {fmtDate(range.to)}
      </span>
      {loading && <Loader2 className="ml-1 h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  );
}
