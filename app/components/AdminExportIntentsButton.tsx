"use client";

import React from "react";

type ExportIntentsButtonProps = {
  rows: Array<{
    id: string;
    athlete: string;
    email: string;
    product: string;
    amount: number;
    status: string;
    due_date: string | null;
  }>;
  paymentStatus: "all" | "created" | "pending" | "paid" | "failed" | "expired" | "cancelled";
};

export default function AdminExportIntentsButton({ rows, paymentStatus }: ExportIntentsButtonProps) {
  function exportIntentsCsv() {
    const headers = [
      "ID", "Atleta", "Email", "Produto", "Valor", "Estado", "Criada em"
    ];
    const csvRows = rows.map(r => [
      r.id,
      r.athlete,
      r.email,
      r.product,
      r.amount,
      r.status,
      r.due_date ?? ""
    ]);
    const csv = [headers, ...csvRows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `intents_export_${paymentStatus}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      className="btn-secondary h-10 rounded-lg px-4 font-semibold mt-2 md:mt-0"
      onClick={exportIntentsCsv}
    >
      Exportar intents ({paymentStatus === 'all' ? 'pendentes/falhadas' : paymentStatus})
    </button>
  );
}

