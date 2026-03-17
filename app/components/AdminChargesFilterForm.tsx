"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent } from "react";

type EventOption = {
  id: string;
  title: string;
};

type AdminChargesFilterFormProps = {
  selectedMonth: number;
  selectedYear: number;
  searchQuery: string;
  paymentStatus: "all" | "paid" | "pending";
  selectedEventId: string;
  events: EventOption[];
};

const monthFormatter = new Intl.DateTimeFormat("pt-PT", {
  month: "long",
});

export default function AdminChargesFilterForm({
  selectedMonth,
  selectedYear,
  searchQuery,
  paymentStatus,
  selectedEventId,
  events,
}: AdminChargesFilterFormProps) {
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
    const q = String(formData.get("q") ?? "").trim();
    const status = String(formData.get("paymentStatus") ?? "all");
    const eventId = String(formData.get("eventId") ?? "all");

    const params = new URLSearchParams(searchParams.toString());
    params.set("month", month);
    params.set("year", year);

    if (q) {
      params.set("q", q);
    } else {
      params.delete("q");
    }

    if (status === "paid" || status === "pending") {
      params.set("paymentStatus", status);
    } else {
      params.delete("paymentStatus");
    }

    if (eventId && eventId !== "all") {
      params.set("eventId", eventId);
    } else {
      params.delete("eventId");
    }

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <form onSubmit={applyFilters} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_1.5fr_1fr_1.2fr_auto] md:items-end">
      <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
        Mes
        <select
          name="month"
          defaultValue={String(selectedMonth)}
          className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
        >
          {months.map((month) => (
            <option key={month} value={month}>
              {monthFormatter.format(new Date(2026, month - 1, 1))}
            </option>
          ))}
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

      <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
        Pesquisar atleta
        <input
          type="text"
          name="q"
          defaultValue={searchQuery}
          placeholder="Ex: atleta1"
          className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
        />
      </label>

      <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
        Estado
        <select
          name="paymentStatus"
          defaultValue={paymentStatus}
          className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
        >
          <option value="all">Todos</option>
          <option value="pending">Por pagar</option>
          <option value="paid">Pago</option>
        </select>
      </label>

      <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
        Evento
        <select
          name="eventId"
          defaultValue={selectedEventId}
          className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
        >
          <option value="all">Todos</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title}
            </option>
          ))}
        </select>
      </label>

      <button type="submit" className="btn-primary h-10 rounded-lg px-4 font-semibold">
        Aplicar filtros
      </button>
    </form>
  );
}
