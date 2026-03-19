"use client";
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
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
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
  );
}

