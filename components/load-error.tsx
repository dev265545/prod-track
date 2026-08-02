"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useLanguage } from "@/components/language-provider";

/**
 * The one "this screen could not load" card.
 *
 * A failed read used to render as an empty state on several screens, so the
 * operator was told his list was empty when in fact the database read had
 * thrown. Every screen now renders this instead: a warning mark, a plain
 * sentence, and a button that retries — never the empty state, which means
 * something different and must keep meaning it.
 *
 * Mirrors the Stock hub's error card so the three states (loading, empty,
 * failed) look the same everywhere.
 */
export function LoadError({
  title,
  description,
  onRetry,
}: {
  /** Falls back to the shared "could not open" sentence. */
  title?: string;
  description?: string;
  onRetry: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Card className="min-w-0 border-border bg-card shadow-sm">
      <CardContent className="p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlert aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{title ?? t("ux2LoadFailedTitle")}</EmptyTitle>
            <EmptyDescription>
              {description ?? t("ux2LoadFailedDesc")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button className="min-h-[44px] gap-2" onClick={onRetry}>
              <RefreshCw className="size-4" aria-hidden />
              {t("commonRetry")}
            </Button>
          </EmptyContent>
        </Empty>
      </CardContent>
    </Card>
  );
}
