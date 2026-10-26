/**
 * Where a booking came from. Stored on `cos_appointments.appointment_source`
 * (DB CHECK constraint keeps these values in sync).
 */
export const APPOINTMENT_SOURCES = [
  { value: "manual", label: "Manual entry", icon: "✍️" },
  { value: "google_calendar", label: "Google Calendar", icon: "📅" },
  { value: "facebook", label: "Facebook", icon: "📘" },
  { value: "instagram", label: "Instagram", icon: "📸" },
  { value: "whatsapp", label: "WhatsApp", icon: "💬" },
  { value: "phone_call", label: "Phone call", icon: "📞" },
  { value: "walk_in", label: "Walk-in", icon: "🚶" },
  { value: "other", label: "Other", icon: "🔗" },
] as const;

export type AppointmentSource = (typeof APPOINTMENT_SOURCES)[number]["value"];

export function sourceLook(value: string | null | undefined) {
  return (
    APPOINTMENT_SOURCES.find((s) => s.value === (value ?? "manual")) ?? {
      value: "other",
      label: value ?? "Other",
      icon: "🔗",
    }
  );
}
