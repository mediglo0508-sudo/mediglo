import { useSyncExternalStore } from "react";

export type PresetKey =
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "last_month"
  | "custom";

export interface DashboardRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  preset: PresetKey;
}

const STORAGE_KEY = "mediglo:dashboard:range";

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getPresetRange(preset: PresetKey): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "today":
      return { from: fmt(today), to: fmt(today) };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: fmt(y), to: fmt(y) };
    }
    case "this_week": {
      const d = new Date(today);
      const dow = (d.getDay() + 6) % 7; // Monday=0
      d.setDate(d.getDate() - dow);
      return { from: fmt(d), to: fmt(today) };
    }
    case "this_month": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: fmt(first), to: fmt(today) };
    }
    case "last_month": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: fmt(first), to: fmt(last) };
    }
    case "custom":
    default:
      return { from: fmt(today), to: fmt(today) };
  }
}

function defaultRange(): DashboardRange {
  const { from, to } = getPresetRange("this_month");
  return { from, to, preset: "this_month" };
}

function readStore(): DashboardRange {
  if (typeof window === "undefined") return defaultRange();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultRange();
    const parsed = JSON.parse(raw) as DashboardRange;
    if (parsed && parsed.from && parsed.to) return parsed;
  } catch {
    /* ignore */
  }
  return defaultRange();
}

let current: DashboardRange | null = null;
const listeners = new Set<() => void>();

function ensure(): DashboardRange {
  if (!current) current = readStore();
  return current;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): DashboardRange {
  return ensure();
}

function getServerSnapshot(): DashboardRange {
  return defaultRange();
}

export function setDashboardRange(next: DashboardRange): void {
  // normalize
  let { from, to } = next;
  if (from > to) [from, to] = [to, from];
  current = { from, to, preset: next.preset };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      /* ignore */
    }
  }
  for (const cb of listeners) cb();
}

export function useDashboardRange(): DashboardRange {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Cross-tab sync
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      current = readStore();
      for (const cb of listeners) cb();
    }
  });
}
