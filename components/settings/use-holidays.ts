"use client";

import * as React from "react";
import {
  deleteHoliday,
  getAllHolidays,
  saveHoliday,
} from "@/lib/services/factoryHolidayService";
import {
  deleteOperatorHoliday,
  getAllOperatorHolidays,
  saveOperatorHoliday,
} from "@/lib/services/operatorHolidayService";
import type { HolidayRow } from "./holiday-list-card";

type HolidayLists = { factory: HolidayRow[]; operator: HolidayRow[] };

const EMPTY: HolidayLists = { factory: [], operator: [] };

function toRows(rows: unknown[]): HolidayRow[] {
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    date: String(r.date),
    name: r.name === undefined ? undefined : String(r.name),
  }));
}

/** Module scope on purpose: the effect below hands the setter straight to
 * the promise instead of calling setState in its own body. */
async function fetchHolidayLists(): Promise<HolidayLists> {
  const [factory, operator] = await Promise.all([
    getAllHolidays(),
    getAllOperatorHolidays(),
  ]);
  return { factory: toRows(factory), operator: toRows(operator) };
}

/**
 * Owning the fetch here (rather than in the page) keeps the page a pure shell.
 */
export function useHolidays() {
  const [lists, setLists] = React.useState<HolidayLists>(EMPTY);

  React.useEffect(() => {
    fetchHolidayLists()
      .then(setLists)
      .catch(() => {});
  }, []);

  const reload = React.useCallback(async () => {
    setLists(await fetchHolidayLists());
  }, []);

  return {
    factory: lists.factory,
    operator: lists.operator,
    reload,
    addFactory: async (date: string) => {
      await saveHoliday({ date });
      await reload();
    },
    removeFactory: async (id: string) => {
      await deleteHoliday(id);
      await reload();
    },
    addOperator: async (date: string, name?: string) => {
      await saveOperatorHoliday({ date, name: name ?? "" });
      await reload();
    },
    removeOperator: async (id: string) => {
      await deleteOperatorHoliday(id);
      await reload();
    },
  };
}
