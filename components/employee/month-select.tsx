"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseMonthPickerValue } from "@/lib/utils/employeeDetail";

/** Month picker shared by the print card and the salary range card. */
export function MonthSelect({
  id,
  year,
  month,
  options,
  onChange,
}: {
  id: string;
  year: number;
  month: number;
  options: { value: string; label: string }[];
  onChange: (year: number, month: number) => void;
}) {
  return (
    <Select
      value={`${year}-${month}`}
      onValueChange={(v) => {
        const parsed = parseMonthPickerValue(v);
        if (parsed) onChange(parsed.year, parsed.month);
      }}
    >
      <SelectTrigger id={id} className="min-w-[200px] w-56 min-h-12">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
