"use client";

import { useRef, useState } from "react";

type AthleteOption = {
  user_id: string;
  full_name: string;
  email: string | null;
};

type Props = {
  athletes: AthleteOption[];
  action: (formData: FormData) => Promise<void>;
};

export default function AdminCreateEventForm({ athletes, action }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    setValidationError(null);
    const form = e.currentTarget;
    const checkedBoxes = form.querySelectorAll<HTMLInputElement>(
      'input[name="athlete_ids"]:checked'
    );

    if (checkedBoxes.length === 0) {
      e.preventDefault();
      setValidationError("Seleciona pelo menos um atleta.");
      return;
    }

    for (const checkbox of checkedBoxes) {
      const athleteId = checkbox.value;
      const amountInput = form.querySelector<HTMLInputElement>(
        `input[name="amount_${athleteId}"]`
      );
      const amount = Number(amountInput?.value ?? "");

      if (!amountInput || !Number.isFinite(amount) || amount <= 0) {
        e.preventDefault();
        setValidationError(
          "Cada atleta inscrito tem de ter um valor de inscrição superior a 0."
        );
        amountInput?.focus();
        return;
      }
    }
  }

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
          Nome do evento
          <input
            type="text"
            name="event_title"
            required
            placeholder="Ex: Campeonato Regional"
            className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
          Data do evento
          <input
            type="date"
            name="event_date"
            required
            className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
          Data limite de pagamento
          <input
            type="date"
            name="payment_deadline"
            className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
          />
        </label>
      </div>

      <div className="rounded-xl border border-line/80 bg-white/70 p-4">
        <p className="sticky top-0 z-10 mb-3 border-b border-line/70 bg-white/95 pb-2 text-sm font-semibold text-zinc-800 backdrop-blur-sm">
          Atletas inscritos e valor a pagar
        </p>

        {athletes.length === 0 ? (
          <p className="text-sm text-zinc-600">
            Sem atletas ativos para adicionar ao evento.
          </p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {athletes.map((athlete) => (
              <div
                key={athlete.user_id}
                className="grid grid-cols-1 gap-3 rounded-lg border border-line/70 bg-white p-3 md:grid-cols-[1fr_auto] md:items-center"
              >
                <label className="flex items-start gap-3 text-sm text-zinc-800">
                  <input
                    type="checkbox"
                    name="athlete_ids"
                    value={athlete.user_id}
                    className="mt-1"
                    onChange={() => setValidationError(null)}
                  />
                  <span>
                    <strong className="block">{athlete.full_name}</strong>
                    {athlete.email ? (
                      <span className="text-zinc-500">{athlete.email}</span>
                    ) : null}
                  </span>
                </label>

                <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
                  Valor (EUR)
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="Ex: 12.50"
                    name={`amount_${athlete.user_id}`}
                    className="h-10 w-28 rounded-lg border border-line bg-white px-3 text-zinc-900"
                    onChange={() => setValidationError(null)}
                  />
                </label>
              </div>
            ))}
          </div>
        )}
      </div>

      {validationError ? (
        <p className="rounded-lg border border-danger/20 bg-red-50 px-4 py-3 text-sm text-danger">
          {validationError}
        </p>
      ) : null}

      <button type="submit" className="btn-primary h-10 rounded-lg px-5 font-semibold">
        Criar evento
      </button>
    </form>
  );
}
