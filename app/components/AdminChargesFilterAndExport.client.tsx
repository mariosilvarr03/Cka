"use client";
import { useState } from "react";
import AdminChargesFilterForm from "./AdminChargesFilterForm";
import AdminExportIntentsButton from "./AdminExportIntentsButton";

export default function AdminChargesFilterAndExport({
  selectedMonth,
  selectedYear,
  searchQuery,
  paymentStatus,
  selectedEventId,
  events,
  exportRows,
}: {
  selectedMonth: number;
  selectedYear: number;
  searchQuery: string;
  paymentStatus: "all" | "created" | "pending" | "paid" | "failed" | "expired" | "cancelled";
  selectedEventId: string;
  events: Array<{ id: string; title: string }>;
  exportRows: Array<{
    id: string;
    athlete: string;
    email: string;
    product: string;
    amount: number;
    status: string;
    due_date: string | null;
  }>;
}) {
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setIsMobileFiltersOpen((current) => !current)}
          className="h-10 w-full rounded-lg border border-line bg-white px-4 text-sm font-semibold text-zinc-900"
          aria-expanded={isMobileFiltersOpen}
          aria-controls="admin-filters-panel"
        >
          {isMobileFiltersOpen ? "Esconder filtros" : "Mostrar filtros"}
        </button>
      </div>

      <div id="admin-filters-panel" className={`${isMobileFiltersOpen ? "block" : "hidden"} md:block`}>
        <AdminChargesFilterForm
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          searchQuery={searchQuery}
          paymentStatus={paymentStatus}
          selectedEventId={selectedEventId}
          events={events}
        />
        <AdminExportIntentsButton rows={exportRows} paymentStatus={paymentStatus} />
      </div>
    </div>
  );
}

