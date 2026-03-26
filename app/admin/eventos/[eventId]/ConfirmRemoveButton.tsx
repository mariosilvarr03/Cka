"use client";

export function ConfirmRemoveButton() {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!window.confirm("Tens a certeza que queres remover esta inscrição? Esta acção cancela a cobrança associada.")) {
          e.preventDefault();
        }
      }}
      className="inline-flex h-8 items-center rounded-lg border border-danger/20 px-3 text-xs font-semibold text-danger hover:bg-red-50"
    >
      Remover
    </button>
  );
}
