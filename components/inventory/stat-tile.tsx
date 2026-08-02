import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatTileTone = "neutral" | "amber" | "red" | "emerald";

const TONE_CLASSES: Record<
  StatTileTone,
  { icon: string; value: string; rule: string }
> = {
  neutral: {
    icon: "bg-muted text-foreground/80",
    value: "text-foreground",
    rule: "bg-foreground/15",
  },
  amber: {
    icon: "bg-warning/15 text-warning",
    value: "text-warning",
    rule: "bg-warning/60",
  },
  red: {
    icon: "bg-destructive/10 text-destructive",
    value: "text-destructive",
    rule: "bg-destructive/60",
  },
  emerald: {
    icon: "bg-success/15 text-success",
    value: "text-success",
    rule: "bg-success/60",
  },
};

export interface StatTileProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: StatTileTone;
  className?: string;
}

/** Calm stat tile: neutral card surface, thin left rule + icon chip carry the tone. */
export function StatTile({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  className,
}: StatTileProps) {
  const c = TONE_CLASSES[tone];
  return (
    <Card
      className={cn(
        "relative overflow-hidden border-border bg-card shadow-sm",
        className,
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", c.rule)} aria-hidden />
      <CardContent className="flex items-center gap-4 p-5 sm:p-6">
        <div
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-lg",
            c.icon,
          )}
        >
          <Icon className="size-6" aria-hidden />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <span
            className={cn(
              "whitespace-nowrap font-heading text-[clamp(1.55rem,2.4vw,2.25rem)] font-bold tabular-nums leading-tight tracking-[-0.035em]",
              c.value,
            )}
          >
            {value}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
