"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";

type CategoryOption = {
  id: number;
  name: string;
};

type ParsedRow = {
  nome: string;
  email: string;
  categoria: string;
  categoryId: number | null;
  error?: string;
};

type Props = {
  categories: CategoryOption[];
  action: (formData: FormData) => Promise<void>;
};

function validateRows(raw: Array<[string, string, string]>, categories: CategoryOption[]): ParsedRow[] {
  return raw.map(([nome, email, categoriaRaw]) => {
    const matched = categories.find(
      (c) => c.name.toLowerCase() === (categoriaRaw ?? "").toLowerCase().trim(),
    );
    const row: ParsedRow = {
      nome: nome?.trim() ?? "",
      email: email?.trim().toLowerCase() ?? "",
      categoria: categoriaRaw?.trim() ?? "",
      categoryId: matched?.id ?? null,
    };
    if (!row.nome) row.error = "Nome em falta";
    else if (!row.email || !row.email.includes("@")) row.error = "Email inválido";
    else if (!matched) row.error = `Categoria "${row.categoria}" não encontrada`;
    return row;
  });
}

function parseCSVText(text: string, categories: CategoryOption[]): ParsedRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const firstLine = lines[0].toLowerCase();
  const hasHeader =
    firstLine.includes("nome") || firstLine.includes("email") || firstLine.includes("categoria");
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const raw = dataLines.map((line) => {
    const parts = line.split(",").map((p) => p.trim());
    return [parts[0] ?? "", parts[1] ?? "", parts[2] ?? ""] as [string, string, string];
  });
  return validateRows(raw, categories);
}

function parseXLSXBuffer(buffer: ArrayBuffer, categories: CategoryOption[]): ParsedRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
  if (json.length === 0) return [];

  // Detect if first row is a header
  const first = json[0] as string[];
  const firstLower = first.map((c) => String(c).toLowerCase());
  const hasHeader =
    firstLower.some((c) => c.includes("nome") || c.includes("email") || c.includes("categoria"));
  const dataRows = (hasHeader ? json.slice(1) : json) as string[][];

  const raw = dataRows
    .filter((row) => row.some((cell) => String(cell).trim() !== ""))
    .map((row) => [String(row[0] ?? ""), String(row[1] ?? ""), String(row[2] ?? "")] as [string, string, string]);

  return validateRows(raw, categories);
}

export default function AdminCsvImportForm({ categories, action }: Props) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const validRows = rows.filter((r) => !r.error);
  const invalidRows = rows.filter((r) => r.error);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const isXLSX = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

    if (isXLSX) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const buffer = ev.target?.result as ArrayBuffer;
        setRows(parseXLSXBuffer(buffer, categories));
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        setRows(parseCSVText(text, categories));
      };
      reader.readAsText(file, "utf-8");
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (validRows.length === 0) return;
    setLoading(true);
    const fd = new FormData();
    validRows.forEach((row, i) => {
      fd.set(`full_name_${i}`, row.nome);
      fd.set(`email_${i}`, row.email);
      fd.set(`category_id_${i}`, String(row.categoryId));
    });
    fd.set("count", String(validRows.length));
    await action(fd);
    setLoading(false);
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-zinc-700">
          Ficheiro Excel ou CSV
          <span className="ml-2 font-normal text-zinc-400">
            (colunas: nome, email, categoria)
          </span>
        </label>
        <input
          type="file"
          accept=".csv,.xlsx,.xls,text/csv"
          onChange={handleFile}
          className="block w-full cursor-pointer rounded-lg border border-line bg-white px-3 py-2 text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-zinc-700"
        />
        <p className="text-xs text-zinc-400">
          Aceita <strong>.xlsx</strong>, <strong>.xls</strong> e <strong>.csv</strong>. A primeira linha pode ser cabeçalho (nome, email, categoria).
        </p>
      </div>

      {rows.length > 0 && (
        <div className="rounded-xl border border-line/70 bg-white/60 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Pré-visualização — {validRows.length} válidos
            {invalidRows.length > 0 && (
              <span className="ml-2 text-danger">
                · {invalidRows.length} com erros (serão ignorados)
              </span>
            )}
          </p>
          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-xs text-zinc-700">
              <thead>
                <tr className="border-b border-line/50 text-left text-muted">
                  <th className="pb-1 pr-3 font-semibold">Nome</th>
                  <th className="pb-1 pr-3 font-semibold">Email</th>
                  <th className="pb-1 pr-3 font-semibold">Categoria</th>
                  <th className="pb-1 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/30">
                {rows.map((row, i) => (
                  <tr key={i} className={row.error ? "opacity-50" : ""}>
                    <td className="py-1 pr-3">{row.nome || "—"}</td>
                    <td className="py-1 pr-3">{row.email || "—"}</td>
                    <td className="py-1 pr-3">{row.categoria || "—"}</td>
                    <td className="py-1">
                      {row.error ? (
                        <span className="text-danger">{row.error}</span>
                      ) : (
                        <span className="text-ok">✓</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {validRows.length > 0 && (
        <button
          type="submit"
          disabled={loading}
          className="btn-primary h-10 rounded-lg px-5 font-semibold disabled:opacity-60"
        >
          {loading
            ? `A enviar convites (${validRows.length})...`
            : `Importar ${validRows.length} atleta${validRows.length !== 1 ? "s" : ""}`}
        </button>
      )}
    </form>
  );
}

