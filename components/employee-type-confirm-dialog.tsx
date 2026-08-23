"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveEmployee } from "@/lib/services/employeeService";
import type { EmployeeType } from "@/lib/services/employeeTypeMigration";
import { useLanguage } from "@/components/language-provider";
import { UserCog } from "lucide-react";
import { toast } from "sonner";

const TYPE_OPTIONS: { value: EmployeeType; labelKey: "employeeTypeSalaried" | "employeeTypeProduction" | "employeeTypeOperator" }[] = [
  { value: "salaried", labelKey: "employeeTypeSalaried" },
  { value: "production", labelKey: "employeeTypeProduction" },
  // The app can never guess "operator" on its own, so a person must be able to
  // pick it here — otherwise operators stay mis-typed and get the wrong pay.
  { value: "operator", labelKey: "employeeTypeOperator" },
];

function toType(value: unknown): EmployeeType {
  return value === "production" || value === "operator" ? value : "salaried";
}

/**
 * Review dialog for people whose pay type the app guessed.
 * Every guess is shown per person and can be changed before saving — there is
 * no blind bulk action.
 */
export function EmployeeTypeConfirmDialog({
  employees,
  onSaved,
}: {
  employees: Record<string, unknown>[];
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Only what the user changed; anything untouched keeps the app's guess. */
  const [changed, setChanged] = useState<Record<string, EmployeeType>>({});

  if (employees.length === 0) return null;

  const chosenType = (emp: Record<string, unknown>): EmployeeType =>
    changed[String(emp.id)] ?? toType(emp.employeeType);

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      for (const emp of employees) {
        await saveEmployee({
          ...emp,
          employeeType: chosenType(emp),
          employeeTypeConfirmed: true,
        });
      }
      toast.success(t("etypeReviewSaved", { count: employees.length }));
      setChanged({});
      setOpen(false);
      onSaved();
    } catch (error) {
      console.error("employee type confirm failed", error);
      toast.error(t("etypeReviewSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="relative flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg px-3 text-primary hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
          aria-label={t("dashboardUnconfirmedTypesAria", {
            count: employees.length,
          })}
        >
          <UserCog className="size-5" />
          <span className="text-sm font-medium">{t("etypeReviewTitle")}</span>
          <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {employees.length > 9 ? "9+" : employees.length}
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("etypeReviewTitle")}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {t("etypeReviewIntro", { count: employees.length })}
          </p>
        </DialogHeader>
        <ul className="flex max-h-72 flex-col gap-3 overflow-y-auto">
          {employees.map((e) => {
            const id = String(e.id);
            return (
              <li key={id} className="flex flex-col gap-1">
                <label
                  htmlFor={`etype-${id}`}
                  className="text-sm font-medium text-foreground"
                >
                  {t("etypeReviewPerson", { name: String(e.name ?? id) })}
                </label>
                <Select
                  value={chosenType(e)}
                  onValueChange={(v) =>
                    setChanged((prev) => ({ ...prev, [id]: toType(v) }))
                  }
                >
                  <SelectTrigger id={`etype-${id}`} className="min-h-[44px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {t(opt.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            );
          })}
        </ul>
        <Button
          type="button"
          onClick={handleSaveAll}
          disabled={saving}
          className="min-h-[44px] w-full"
        >
          <UserCog className="size-4" />
          {saving ? t("etypeReviewSaving") : t("etypeReviewSaveAll")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
