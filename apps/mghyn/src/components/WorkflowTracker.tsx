import { Check } from "lucide-react";

/** Ordered pipeline stages a client moves through in the clinic OS. */
export const WORKFLOW_STAGES = [
  "Lead",
  "Consultation",
  "Package Confirmation",
  "Session Booking",
  "Billing",
  "Payment",
  "Inventory Deductions",
  "Analytics",
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

/**
 * Horizontal roadmap tracker rendered at the header of the client profile.
 * The current node highlights dynamically; clicking the next node advances
 * the customer to the following pipeline stage.
 */
export function WorkflowTracker({
  current,
  onAdvance,
  interactive = true,
}: {
  current: WorkflowStage;
  onAdvance?: (next: WorkflowStage) => void;
  interactive?: boolean;
}) {
  const idx = Math.max(0, WORKFLOW_STAGES.indexOf(current));
  const nextStage = WORKFLOW_STAGES[idx + 1];

  return (
    <div className="w-full overflow-x-auto pb-2">
      <ol className="flex min-w-max items-center gap-1">
        {WORKFLOW_STAGES.map((stage, i) => {
          const done = i < idx;
          const active = i === idx;
          const isNext = interactive && onAdvance && stage === nextStage;
          return (
            <li key={stage} className="flex items-center">
              <button
                type="button"
                disabled={!isNext}
                onClick={() => isNext && nextStage && onAdvance?.(nextStage)}
                title={isNext ? `Advance to ${stage}` : stage}
                className={[
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : done
                      ? "border-cos-open/40 bg-cos-open-soft text-foreground"
                      : "border-border bg-muted/40 text-muted-foreground",
                  isNext ? "cursor-pointer ring-1 ring-primary/40 hover:bg-primary/10" : "",
                ].join(" ")}
              >
                {done && <Check className="h-3 w-3 shrink-0" />}
                <span className="whitespace-nowrap">{stage}</span>
              </button>
              {i < WORKFLOW_STAGES.length - 1 && (
                <span
                  className={`mx-0.5 h-px w-4 shrink-0 ${i < idx ? "bg-cos-open" : "bg-border"}`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Derive the current pipeline stage from a customer's live data footprint.
 * Pure + defensive so it never throws in render.
 */
export function deriveWorkflowStage(input: {
  hasConsultation?: boolean;
  hasPackage?: boolean;
  hasSessions?: boolean;
  hasInvoice?: boolean;
  fullyPaid?: boolean;
  hasConsumption?: boolean;
}): WorkflowStage {
  if (input.hasConsumption) return "Inventory Deductions";
  if (input.fullyPaid) return "Payment";
  if (input.hasInvoice) return "Billing";
  if (input.hasSessions) return "Session Booking";
  if (input.hasPackage) return "Package Confirmation";
  if (input.hasConsultation) return "Consultation";
  return "Lead";
}
