"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent } from "react";

type AthletePeriodFilterFormProps = {
  selectedMonth: number;
  selectedYear: number;
};

const monthFormatter = new Intl.DateTimeFormat("pt-PT", {
  month: "long",
});

export default function AthletePeriodFilterForm({ selectedMonth, selectedYear }: AthletePeriodFilterFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const today = new Date();
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const years = Array.from({ length: 3 }, (_, i) => today.getFullYear() - 1 + i);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const month = String(formData.get("month") ?? selectedMonth);
    const year = String(formData.get("year") ?? selectedYear);

    const params = new URLSearchParams(searchParams.toString());
    params.set("month", month);
    params.set("year", year);

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <form onSubmit={applyFilters} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
      <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
        Mes
        <select
          name="month"
          defaultValue={String(selectedMonth)}
          className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
        >
          {months.map((month) => {
            const monthName = monthFormatter.format(new Date(2026, month - 1, 1));
            return (
              <option key={month} value={month}>
                {monthName.charAt(0).toUpperCase() + monthName.slice(1)}
              </option>
            );
          })}
        </select>
      </label>

      <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
        Ano
        <select
          name="year"
          defaultValue={String(selectedYear)}
          className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>

      <button type="submit" className="btn-primary h-10 rounded-lg px-5 font-semibold">
        Ver estado
      </button>
    </form>
  );
}
