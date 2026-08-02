"use client";

import * as React from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  clampNumericInput,
  resolveIncomingNumericValue,
  sanitizeNumericInput,
} from "@/lib/utils/numericInput";

/**
 * The one numeric field in the app.
 *
 * `<input type="number">` let letters through (`e`, `E`, `+`, `-`, and anything
 * autofill cared to inject), reported invalid content back to React as `""` so
 * a quantity could silently blank itself, and changed its own value on a stray
 * scroll wheel. This is a text input that filters instead, so what the operator
 * sees on screen is always exactly what the form will save.
 *
 * Callers keep their existing shape: `value={qty}` and
 * `onChange={(e) => setQty(e.target.value)}` both still work, and `e.target.value`
 * is already filtered by the time the handler runs.
 */

export interface NumberInputProps extends Omit<InputProps, "type"> {
  /** Allow one decimal separator, and show the decimal keypad on touch. */
  decimal?: boolean;
  /** Lower bound, applied on blur (`type="text"` no longer enforces it). */
  min?: number;
  /** Upper bound, applied on blur. */
  max?: number;
}

/** Write a value into the DOM node the way React will notice it. */
function emitValue(node: HTMLInputElement, next: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!setter) return;
  setter.call(node, next);
  node.dispatchEvent(new Event("input", { bubbles: true }));
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput(
    {
      decimal = false,
      min,
      max,
      value,
      onChange,
      onBlur,
      onFocus,
      className,
      name,
      id,
      ...props
    },
    forwardedRef,
  ) {
    const innerRef = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(forwardedRef, () => innerRef.current!, []);

    // What the caller's state says, cleaned. Anything the caller was handed a
    // dirty value from (autofill, an old record) is corrected on the way in.
    const external = resolveIncomingNumericValue(value, { decimal });

    // While the box has focus, the operator's own text wins. Callers routinely
    // round or default in onChange (`parseInt(v) || 8`); echoing that back on
    // every keystroke is what made a cleared field snap to 8 mid-typing.
    const [draft, setDraft] = React.useState<string | null>(null);
    const display = draft ?? external;

    // Defensive read: autofill and programmatic writes do not always arrive as
    // a keystroke, so check what is actually in the DOM after every render.
    React.useEffect(() => {
      const node = innerRef.current;
      if (!node) return;
      const cleaned = sanitizeNumericInput(node.value, { decimal });
      if (cleaned !== node.value) emitValue(node, cleaned);
    });

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const cleaned = sanitizeNumericInput(event.target.value, { decimal });
      // Hand the caller the filtered text, never the raw keystroke.
      if (cleaned !== event.target.value) event.target.value = cleaned;
      setDraft(cleaned);
      onChange?.(event);
    };

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      setDraft(null);
      const clamped = clampNumericInput(event.target.value, { min, max });
      if (clamped !== event.target.value) {
        emitValue(event.target, clamped);
      }
      onBlur?.(event);
    };

    return (
      <Input
        {...props}
        ref={innerRef}
        type="text"
        inputMode={decimal ? "decimal" : "numeric"}
        value={display}
        onChange={handleChange}
        onFocus={(event) => {
          setDraft(event.target.value);
          onFocus?.(event);
        }}
        onBlur={handleBlur}
        // A text input is a *likelier* autofill target than a number one, so the
        // suppression matters more after the type change, not less. `off` alone
        // is regularly ignored by Chrome; a name that matches no profile
        // category is what actually keeps the heuristics away.
        autoComplete="off"
        id={id}
        name={name ?? (id ? `qty-${id}` : "qty-field")}
        data-1p-ignore=""
        data-lpignore="true"
        data-form-type="other"
        spellCheck={false}
        // Wheel-to-increment is a `type="number"` behaviour and cannot happen on
        // a text input, so a focused field can no longer be changed by a scroll.
        className={cn(className, "min-h-[44px]")}
      />
    );
  },
);

export { NumberInput };
