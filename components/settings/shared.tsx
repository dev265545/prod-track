"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Eye, EyeOff, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Severity is carried as data, never inferred from the text. Copy edits and
 * locale switches can no longer flip an "everything worked" message into a
 * red one (or, far worse, the reverse).
 */
export type Tone = "info" | "success" | "danger";

export type ToneMessage = { tone: Tone; text: string } | null;

const TONE_STYLES: Record<Tone, { box: string; icon: string }> = {
  info: {
    box: "border-border bg-surface-2 text-foreground",
    icon: "text-muted-foreground",
  },
  success: {
    box: "border-success bg-surface-2 text-foreground",
    icon: "text-success",
  },
  danger: {
    box: "border-destructive bg-surface-2 text-foreground",
    icon: "text-destructive",
  },
};

const TONE_ICONS: Record<Tone, React.ElementType> = {
  info: Info,
  success: CheckCircle2,
  danger: TriangleAlert,
};

export function ToneAlert({
  message,
  className,
}: {
  message: ToneMessage;
  className?: string;
}) {
  if (!message) return null;
  const styles = TONE_STYLES[message.tone];
  const Icon = TONE_ICONS[message.tone];
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-3 rounded-xl border-2 px-4 py-3 text-base leading-relaxed",
        styles.box,
        className,
      )}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", styles.icon)} aria-hidden />
      <span className="min-w-0 break-words">{message.text}</span>
    </div>
  );
}

/**
 * One self-contained thing the owner can do, with the explanation always
 * above the button — he reads before he clicks, not after.
 */
export function SettingsSection({
  icon: Icon,
  title,
  description,
  danger = false,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden",
        danger && "border-2 border-destructive bg-surface-2",
      )}
    >
      <CardContent className="flex flex-col gap-5 p-5 sm:p-7">
        <div className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2.5 font-heading text-xl font-semibold text-foreground">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg",
                danger
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-surface-3 text-foreground",
              )}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0">{title}</span>
          </h2>
          {description && (
            <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/** Password entry with a show/hide toggle — typing blind is how the owner locks himself out. */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  showLabel,
  hideLabel,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  showLabel: string;
  hideLabel: string;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-base">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete="off"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[44px] w-full pr-14 text-base"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? hideLabel : showLabel}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? (
            <EyeOff className="size-5" aria-hidden />
          ) : (
            <Eye className="size-5" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}
