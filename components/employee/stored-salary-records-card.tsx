"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLanguage } from "@/components/language-provider";
import { currency } from "@/lib/utils/formatter";
import type { Row } from "@/lib/utils/employeeDetail";

/** Read-only audit trail of salary sheets already printed for this employee. */
export function StoredSalaryRecordsCard({ records }: { records: Row[] }) {
  const { t } = useLanguage();
  const sorted = [...records].sort((a, b) =>
    (b.month as string).localeCompare(a.month as string),
  );
  return (
    <Card className="p-6 sm:p-8">
      <CardHeader className="p-0 mb-4">
        <CardTitle className="text-xl font-semibold font-heading">
          {t("empStoredSalaryRecords")}
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          {t("empStoredSalaryRecordsDesc")}
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("empTableMonth")}</TableHead>
              <TableHead>{t("labelShift")}</TableHead>
              <TableHead className="text-right">
                {t("salarySheetColSalary")}
              </TableHead>
              <TableHead className="text-right">{t("empTableAmount")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.id as string}>
                <TableCell>{r.month as string}</TableCell>
                <TableCell>{r.shiftType as string}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {currency((r.salary as number) ?? 0)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {currency((r.amount as number) ?? 0)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
