"use client";

import { useState } from "react";

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The last date the operator actually chose, kept for the life of the page
 * session (not persisted). Recording twenty movements for the same day should
 * not mean picking that day twenty times.
 */
let sessionDate: string | null = null;

export function useEntryDate(open: boolean): {
  date: string;
  setDate: (next: string) => void;
  isRemembered: boolean;
} {
  const [date, setDateState] = useState(() => sessionDate ?? todayIso());
  const [wasOpen, setWasOpen] = useState(open);

  // Re-sync from the session on each open, during render rather than in an
  // effect, so the first paint already shows the remembered date.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDateState(sessionDate ?? todayIso());
  }

  const setDate = (next: string) => {
    sessionDate = next;
    setDateState(next);
  };

  return { date, setDate, isRemembered: date !== todayIso() };
}
