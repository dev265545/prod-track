"use client";

import { CalendarOff, CalendarHeart } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { HolidayListCard } from "./holiday-list-card";
import { useHolidays } from "./use-holidays";

const OPERATOR_HOLIDAY_NAMES = [
  "Republic Day",
  "Holi",
  "Independence Day",
  "Gandhi Jayanti",
  "Diwali",
  "Dussehra",
  "Eid-ul-Fitr",
  "Eid-ul-Adha",
  "Good Friday",
  "Christmas",
  "Guru Nanak Jayanti",
  "Raksha Bandhan",
] as const;
const OPERATOR_HOLIDAY_OTHER = "_other";

export function CalendarsTab() {
  const { t } = useLanguage();
  const holidays = useHolidays();

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
        {t("setgCalIntro")}
      </p>
      <HolidayListCard
        icon={CalendarOff}
        title={t("setgCalFactoryTitle")}
        description={t("setgCalFactoryBody")}
        rows={holidays.factory}
        onAdd={(date) => holidays.addFactory(date)}
        onDelete={holidays.removeFactory}
      />
      <HolidayListCard
        icon={CalendarHeart}
        title={t("setgCalOperatorTitle")}
        description={t("setgCalOperatorBody")}
        rows={holidays.operator}
        nameOptions={OPERATOR_HOLIDAY_NAMES}
        otherOptionValue={OPERATOR_HOLIDAY_OTHER}
        onAdd={holidays.addOperator}
        onDelete={holidays.removeOperator}
      />
    </div>
  );
}
