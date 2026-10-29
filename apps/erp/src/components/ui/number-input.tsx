import * as React from "react";
import { Input } from "@/components/ui/input";

export interface NumberInputProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  value: number;
  onValueChange: (value: number) => void;
  /** Clamped on blur only — never while typing. */
  min?: number;
  max?: number;
}

/**
 * Number field that fixes the "stuck 0 / backspace cannot clear" bug.
 * It keeps an internal string buffer so the user can fully clear the field
 * (showing empty) while the parent always receives a numeric value (0 when blank).
 */
const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onValueChange, onFocus, onBlur, min, max, ...props }, ref) => {
    const [text, setText] = React.useState<string>(value ? String(value) : "");

    // Keep buffer in sync when the parent value changes externally.
    React.useEffect(() => {
      const numeric = text === "" || text === "-" ? 0 : Number(text);
      if (numeric !== value) setText(value ? String(value) : "");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={text}
        onFocus={(e) => {
          // Select-all so the first keystroke (or backspace) replaces the zero.
          e.currentTarget.select();
          onFocus?.(e);
        }}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "" || /^-?\d*\.?\d*$/.test(raw)) {
            setText(raw);
            onValueChange(raw === "" || raw === "-" || raw === "." ? 0 : Number(raw));
          }
        }}
        onBlur={(e) => {
          const raw = text === "" || text === "-" || text === "." ? NaN : Number(text);
          let next = Number.isNaN(raw) ? (min ?? 0) : raw;
          if (min !== undefined) next = Math.max(min, next);
          if (max !== undefined) next = Math.min(max, next);
          if (Number.isNaN(raw) && min === undefined) {
            setText("");
          } else {
            setText(String(next));
            if (next !== value) onValueChange(next);
          }
          onBlur?.(e);
        }}
        {...props}
      />
    );
  },
);
NumberInput.displayName = "NumberInput";

export { NumberInput };
